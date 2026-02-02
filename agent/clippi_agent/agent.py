"""
Browser Use Agent for Clippi manifest generation.

This module implements the core agent that:
1. Takes a task description
2. Uses Browser Use to explore the application
3. Records actions and generates selectors
4. Outputs a manifest target
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any

from browser_use import Agent, Browser, BrowserConfig
from browser_use.browser.context import BrowserContext
from langchain_google_genai import ChatGoogleGenerativeAI

from .schemas import (
    AgentConfig,
    AgentTask,
    Manifest,
    ManifestDefaults,
    ManifestMeta,
    ManifestTarget,
    OnBlocked,
    PathStep,
    RecordedAction,
    RecordedFlow,
    Selector,
    SelectorStrategy,
    SuccessCondition,
)


def get_llm(config: AgentConfig):
    """Create the LLM instance based on configuration."""
    if config.provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required. "
                "Get one at https://aistudio.google.com/apikey"
            )
        return ChatGoogleGenerativeAI(
            model=config.model,
            google_api_key=api_key,
            temperature=0.1,  # Low temperature for consistent actions
        )
    elif config.provider == "openai":
        # Import only when needed
        from langchain_openai import ChatOpenAI

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        return ChatOpenAI(model=config.model, api_key=api_key, temperature=0.1)
    elif config.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        return ChatAnthropic(model=config.model, api_key=api_key, temperature=0.1)
    else:
        raise ValueError(f"Unknown provider: {config.provider}")


def generate_id_from_description(description: str) -> str:
    """Generate a kebab-case ID from a task description."""
    # Remove common words and clean up
    stop_words = {"how", "to", "do", "i", "the", "a", "an", "my", "our"}
    words = description.lower().split()
    words = [w for w in words if w not in stop_words]

    # Take first 3-4 significant words
    words = words[:4]

    # Clean and join
    cleaned = []
    for word in words:
        # Remove non-alphanumeric chars
        word = re.sub(r"[^a-z0-9]", "", word)
        if word:
            cleaned.append(word)

    return "-".join(cleaned) if cleaned else "unnamed-task"


def extract_selectors_from_element(element_info: dict[str, Any]) -> Selector:
    """Extract selector strategies from element information captured by Browser Use."""
    strategies: list[SelectorStrategy] = []

    attrs = element_info.get("attributes", {})

    # Priority 1: data-testid
    if "data-testid" in attrs:
        strategies.append(
            SelectorStrategy(type="testId", value=attrs["data-testid"])
        )

    # Priority 2: aria-label
    if "aria-label" in attrs:
        strategies.append(SelectorStrategy(type="aria", value=attrs["aria-label"]))

    # Priority 3: ID-based CSS selector
    if "id" in attrs and attrs["id"]:
        strategies.append(SelectorStrategy(type="css", value=f"#{attrs['id']}"))

    # Priority 4: Class-based CSS selector (if specific enough)
    if "class" in attrs and attrs["class"]:
        classes = attrs["class"].split()
        # Look for specific/unique-looking classes (longer names, with hyphens)
        specific_classes = [c for c in classes if len(c) > 5 or "-" in c]
        if specific_classes:
            selector = "." + ".".join(specific_classes[:2])
            tag = element_info.get("tag", "")
            if tag:
                selector = f"{tag}{selector}"
            strategies.append(SelectorStrategy(type="css", value=selector))

    # Priority 5: Text content (fallback)
    text = element_info.get("text", "").strip()
    tag = element_info.get("tag", "")
    if text and len(text) < 50:
        strategies.append(
            SelectorStrategy(
                type="text",
                value=text,
                tag=tag if tag in ["button", "a", "span", "div", "label"] else None,
            )
        )

    # If no strategies found, try a basic CSS path
    if not strategies:
        tag = element_info.get("tag", "div")
        strategies.append(SelectorStrategy(type="css", value=tag))

    return Selector(strategies=strategies)


def infer_success_condition(
    action: RecordedAction, next_action: RecordedAction | None
) -> SuccessCondition | None:
    """Infer a success condition based on what changed after an action."""
    # URL changed
    if action.url_after != action.url_before:
        # Use url_contains for partial match
        path = action.url_after.split("://", 1)[-1].split("/", 1)
        if len(path) > 1:
            return SuccessCondition(url_contains=f"/{path[1]}")

    # If next action targets a different element, the current action likely
    # made something appear - but we can't easily detect this without DOM analysis
    # For now, return None and rely on manual refinement or future improvement

    return None


def extract_keywords(description: str, label: str) -> list[str]:
    """Extract relevant keywords from description and label."""
    # Combine description and label
    text = f"{description} {label}".lower()

    # Remove common stop words
    stop_words = {
        "how",
        "to",
        "do",
        "i",
        "the",
        "a",
        "an",
        "my",
        "our",
        "is",
        "are",
        "this",
        "that",
        "can",
        "will",
        "be",
        "have",
        "has",
        "for",
        "on",
        "in",
        "of",
        "and",
        "or",
    }

    words = re.findall(r"\b[a-z]+\b", text)
    keywords = list(dict.fromkeys(w for w in words if w not in stop_words and len(w) > 2))

    return keywords[:10]  # Limit to 10 keywords


class ClippiAgent:
    """Agent for generating Clippi manifests using Browser Use."""

    def __init__(self, config: AgentConfig):
        self.config = config
        self.llm = get_llm(config)
        self.recorded_flows: list[RecordedFlow] = []

    async def explore_task(self, task: AgentTask) -> RecordedFlow:
        """
        Explore a single task and record the actions taken.

        Returns a RecordedFlow with the actions and whether it succeeded.
        """
        flow = RecordedFlow(task=task)
        start_time = time.time()

        browser_config = BrowserConfig(
            headless=self.config.headless,
            disable_security=True,  # Needed for some sites
        )

        browser = Browser(config=browser_config)

        try:
            # Create the Browser Use agent with specific instructions
            system_prompt = f"""You are exploring a web application to document how to complete a task.

TASK: {task.description}

INSTRUCTIONS:
1. Navigate to {self.config.url} if not already there
2. Find and complete the task step by step
3. Click on elements, fill forms, select options as needed
4. Stop when the task is complete

IMPORTANT:
- Take minimal steps to complete the task
- Prefer clicking on buttons and links over typing URLs
- If you encounter a login page, stop and report that login is required
- If the task cannot be completed, explain why

{"CONTEXT: " + self.config.docs_context if self.config.docs_context else ""}
"""

            agent = Agent(
                task=f"Complete this task: {task.description}",
                llm=self.llm,
                browser=browser,
                use_vision=True,  # Use vision for better element identification
            )

            # Run the agent and capture the history
            history = await agent.run(max_steps=15)

            # Extract actions from history
            flow.actions = self._extract_actions_from_history(history)
            flow.success = True
            flow.duration_ms = (time.time() - start_time) * 1000

        except Exception as e:
            flow.error = str(e)
            flow.success = False
            flow.duration_ms = (time.time() - start_time) * 1000

        finally:
            await browser.close()

        return flow

    def _extract_actions_from_history(
        self, history: Any
    ) -> list[RecordedAction]:
        """Extract recorded actions from Browser Use history."""
        actions: list[RecordedAction] = []

        # Browser Use history contains action results
        # We need to parse them to extract element info
        if not history or not hasattr(history, "history"):
            return actions

        for step in history.history:
            if not hasattr(step, "model_output") or not step.model_output:
                continue

            action = step.model_output.action
            if not action:
                continue

            # Get action type
            action_type = None
            element_info: dict[str, Any] = {}
            input_value = None

            # Parse different action types from Browser Use
            for action_item in action:
                action_name = action_item.__class__.__name__.lower()

                if "click" in action_name:
                    action_type = "click"
                    if hasattr(action_item, "index"):
                        element_info = self._get_element_from_index(
                            step, action_item.index
                        )
                elif "input" in action_name or "type" in action_name:
                    action_type = "type"
                    input_value = getattr(action_item, "text", None)
                    if hasattr(action_item, "index"):
                        element_info = self._get_element_from_index(
                            step, action_item.index
                        )
                elif "select" in action_name:
                    action_type = "select"
                    input_value = getattr(action_item, "value", None)
                    if hasattr(action_item, "index"):
                        element_info = self._get_element_from_index(
                            step, action_item.index
                        )
                elif "go_to" in action_name or "navigate" in action_name:
                    action_type = "navigate"
                elif "scroll" in action_name:
                    action_type = "scroll"

            if action_type and action_type != "scroll":
                # Get URLs from state
                url_before = ""
                url_after = ""
                if hasattr(step, "state") and step.state:
                    url_before = getattr(step.state, "url", "")
                    url_after = url_before  # Will be updated from result

                if hasattr(step, "result") and step.result:
                    if hasattr(step.result, "url"):
                        url_after = step.result.url

                recorded = RecordedAction(
                    action_type=action_type,
                    element_tag=element_info.get("tag"),
                    element_text=element_info.get("text"),
                    element_attributes=element_info.get("attributes", {}),
                    input_value=input_value,
                    url_before=url_before,
                    url_after=url_after,
                    timestamp=time.time(),
                )
                actions.append(recorded)

        return actions

    def _get_element_from_index(self, step: Any, index: int) -> dict[str, Any]:
        """Get element information from Browser Use step by index."""
        element_info: dict[str, Any] = {"attributes": {}}

        if not hasattr(step, "state") or not step.state:
            return element_info

        # Browser Use stores interacted elements in state
        if hasattr(step.state, "interacted_element") and step.state.interacted_element:
            elem = step.state.interacted_element
            if hasattr(elem, "tag_name"):
                element_info["tag"] = elem.tag_name
            if hasattr(elem, "text"):
                element_info["text"] = elem.text
            if hasattr(elem, "attributes"):
                element_info["attributes"] = elem.attributes

        # Also check selector_map if available
        if hasattr(step.state, "selector_map"):
            selector_map = step.state.selector_map
            if index in selector_map:
                elem = selector_map[index]
                if hasattr(elem, "tag_name"):
                    element_info["tag"] = elem.tag_name
                if hasattr(elem, "text"):
                    element_info["text"] = elem.text
                if hasattr(elem, "attributes"):
                    element_info["attributes"] = dict(elem.attributes)

        return element_info

    def convert_flow_to_target(self, flow: RecordedFlow) -> ManifestTarget | None:
        """Convert a recorded flow to a manifest target."""
        if not flow.success or not flow.actions:
            return None

        task = flow.task

        # Generate ID
        target_id = task.id or generate_id_from_description(task.description)

        # Build path steps
        path: list[PathStep] = []
        for i, action in enumerate(flow.actions):
            if action.action_type in ("navigate", "scroll"):
                continue

            # Build element info for selector extraction
            element_info = {
                "tag": action.element_tag or "div",
                "text": action.element_text or "",
                "attributes": action.element_attributes,
            }

            selector = extract_selectors_from_element(element_info)

            # Generate instruction
            instruction = self._generate_instruction(action)

            # Infer success condition
            next_action = flow.actions[i + 1] if i + 1 < len(flow.actions) else None
            success_condition = infer_success_condition(action, next_action)

            is_final = i == len(flow.actions) - 1 or (
                i == len(flow.actions) - 2
                and flow.actions[-1].action_type in ("navigate", "scroll")
            )

            step = PathStep(
                selector=selector,
                instruction=instruction,
                action=action.action_type if action.action_type in ("click", "type", "select", "clear") else "click",
                input=action.input_value,
                success_condition=success_condition,
                final=is_final,
            )
            path.append(step)

        if not path:
            return None

        # Use first step's selector as the target selector
        # (the starting point for this flow)
        target_selector = path[0].selector

        # Generate label from task description
        label = task.description.title()
        if len(label) > 50:
            label = label[:47] + "..."

        # Generate keywords
        keywords = extract_keywords(task.description, label)
        if task.keywords:
            keywords = list(dict.fromkeys(task.keywords + keywords))

        return ManifestTarget(
            id=target_id,
            selector=target_selector,
            label=label,
            description=task.description,
            keywords=keywords,
            category=task.category,
            path=path if len(path) > 1 else None,
        )

    def _generate_instruction(self, action: RecordedAction) -> str:
        """Generate a human-readable instruction for an action."""
        if action.action_type == "click":
            if action.element_text:
                return f'Click on "{action.element_text}"'
            elif action.element_tag:
                return f"Click the {action.element_tag}"
            return "Click here"

        elif action.action_type == "type":
            if action.element_text:
                return f'Type in the "{action.element_text}" field'
            return "Enter text"

        elif action.action_type == "select":
            if action.input_value:
                return f'Select "{action.input_value}"'
            return "Select an option"

        return "Perform action"

    async def generate_manifest(self) -> Manifest:
        """Generate a complete manifest by exploring all tasks."""
        targets: list[ManifestTarget] = []

        print(f"\n🚀 Starting manifest generation for {len(self.config.tasks)} tasks")
        print(f"   URL: {self.config.url}")
        print(f"   Model: {self.config.provider}/{self.config.model}\n")

        for i, task in enumerate(self.config.tasks, 1):
            print(f"📋 [{i}/{len(self.config.tasks)}] Exploring: {task.description}")

            flow = await self.explore_task(task)
            self.recorded_flows.append(flow)

            if flow.success:
                target = self.convert_flow_to_target(flow)
                if target:
                    targets.append(target)
                    print(f"   ✅ Generated target: {target.id}")
                else:
                    print(f"   ⚠️  Flow succeeded but no steps recorded")
            else:
                print(f"   ❌ Failed: {flow.error}")

        # Create manifest
        manifest = Manifest(
            meta=ManifestMeta(
                app_name=self._infer_app_name(),
                generated_at=datetime.now(timezone.utc).isoformat(),
                generator=f"clippi-agent/{self.config.provider}",
            ),
            defaults=ManifestDefaults(timeout_ms=self.config.timeout_ms),
            targets=targets,
        )

        print(f"\n✨ Generated manifest with {len(targets)} targets")
        return manifest

    def _infer_app_name(self) -> str:
        """Infer app name from URL."""
        from urllib.parse import urlparse

        parsed = urlparse(self.config.url)
        hostname = parsed.hostname or "MyApp"

        # Remove common prefixes/suffixes
        hostname = hostname.replace("www.", "").replace(".com", "").replace(".io", "")

        return hostname.title()


async def run_agent(config: AgentConfig) -> Manifest:
    """Main entry point for running the agent."""
    agent = ClippiAgent(config)
    manifest = await agent.generate_manifest()

    # Write manifest to file
    output_path = config.output_path
    with open(output_path, "w") as f:
        # Use model_dump with by_alias for $schema field
        manifest_dict = manifest.model_dump(by_alias=True, exclude_none=True)
        json.dump(manifest_dict, f, indent=2)

    print(f"\n📄 Manifest written to: {output_path}")
    return manifest
