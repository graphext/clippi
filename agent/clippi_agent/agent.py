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

from browser_use import Agent, Browser
from browser_use.llm.google import ChatGoogle
from browser_use.llm.openai.chat import ChatOpenAI as BrowserChatOpenAI
from browser_use.llm.anthropic.chat import ChatAnthropic as BrowserChatAnthropic

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
    TaskTiming,
)


def get_llm(config: AgentConfig):
    """Create the LLM instance based on configuration using Browser Use's native LLMs."""
    if config.provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required. "
                "Get one at https://aistudio.google.com/apikey"
            )
        return ChatGoogle(
            model=config.model,
            api_key=api_key,
            temperature=0.1,  # Low temperature for consistent actions
        )
    elif config.provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        return BrowserChatOpenAI(
            model=config.model,
            api_key=api_key,
            temperature=0.1
        )
    elif config.provider == "anthropic":
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        return BrowserChatAnthropic(
            model=config.model,
            api_key=api_key,
            temperature=0.1
        )
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

    SYSTEM_PROMPT = """You are a UI exploration agent for Clippi, an open-source library that provides \
visual cursor guidance in web applications. Your job is to explore a web application and document \
how to complete specific tasks by finding the right UI elements and recording the steps.

## Your Goal

You are NOT trying to actually accomplish the task for real. You are DOCUMENTING how a user would \
do it inside the application. For example, if the task is "export data to CSV", you should find \
the Export button inside the app, click through the export flow, and stop. You should NOT navigate \
to external sites, search engines, or other applications.

## Critical Rules

1. NEVER leave the application. Stay on the target URL domain at all times.
   If you find yourself on a different domain, navigate back immediately.
2. DO NOT type URLs in the address bar to navigate externally.
3. DO NOT use search engines or visit external websites.
4. Interact ONLY with the UI elements of the target application.
5. Take the MINIMUM number of steps to reach the target UI element or complete the flow.
6. Prefer clicking buttons, links, and menu items over any other interaction.
7. If the task requires filling a form, use placeholder/example values.
8. If you encounter a login page, STOP and report that login is required.
9. If the task cannot be completed within the application, STOP and explain why.

## What You Are Recording

For each step you take, we capture:
- Which element you interacted with (tag, text, attributes like data-testid, aria-label, id, class)
- What action you performed (click, type, select)
- The URL before and after the action

This information is used to generate a manifest file that maps user intents to UI elements, \
so that Clippi can later visually guide users through the same steps with an animated cursor.

## Output Quality

- Prefer elements with `data-testid` or `aria-label` attributes (they make stable selectors).
- Navigate through the app's own UI (sidebar, nav bar, menus) rather than manipulating the URL.
- Complete multi-step flows fully: e.g., for "export to CSV", navigate to the data section, \
click Export, select CSV format, and stop at the final confirmation.
"""

    def __init__(self, config: AgentConfig):
        self.config = config
        self.llm = get_llm(config)
        self.recorded_flows: list[RecordedFlow] = []
        self.verbose = config.verbose
        self.timings: list[TaskTiming] = []
        self._task_start_time: float = time.time()  # Initialize to current time

    def _log_verbose(self, message: str):
        """Log debug message if verbose mode is enabled."""
        if self.verbose:
            elapsed = time.time() - self._task_start_time
            print(f"   🔍 [{elapsed:6.2f}s] {message}")

    def _log(self, message: str):
        """Log message with elapsed time."""
        elapsed = time.time() - self._task_start_time
        print(f"   [{elapsed:6.2f}s] {message}")

    def _build_task_prompt(self, task: AgentTask) -> str:
        """Build the task prompt for the Browser Use agent."""
        parts = [
            f'Navigate to {self.config.url} and find how to: "{task.description}".',
            "",
            "Walk through the application UI to locate and interact with the relevant elements.",
            f"Stay within {self.config.url} at all times. Do not leave this site.",
        ]
        if self.config.docs_context:
            parts.extend([
                "",
                "## Application Context",
                self.config.docs_context,
            ])
        return "\n".join(parts)

    async def explore_task(self, task: AgentTask) -> RecordedFlow:
        """
        Explore a single task and record the actions taken.

        Returns a RecordedFlow with the actions and whether it succeeded.
        """
        # Set start time for this task (used by _log and _log_verbose)
        self._task_start_time = time.time()

        flow = RecordedFlow(task=task)
        timing = TaskTiming(task_description=task.description)

        # Time browser startup
        browser_start = time.time()
        self._log("🌐 Starting browser...")
        browser = Browser(
            headless=self.config.headless,
            disable_security=True,  # Needed for some sites
        )
        timing.browser_startup_ms = (time.time() - browser_start) * 1000
        self._log(f"✅ Browser ready ({timing.browser_startup_ms/1000:.2f}s)")

        try:
            # Build agent
            agent = Agent(
                task=self._build_task_prompt(task),
                llm=self.llm,
                browser=browser,
                use_vision=True,
                extend_system_message=self.SYSTEM_PROMPT,
                include_attributes=["data-testid", "aria-label", "aria-selected", "role"],
            )

            # Track step progress
            current_step = [0]  # Use list for closure modification
            step_start_time = [0.0]  # Track when each step starts

            async def on_step_start(agent_instance):
                current_step[0] += 1
                step_start_time[0] = time.time()
                self._log(f"🧠 Step {current_step[0]}/15: Agent analyzing page...")

            async def on_step_end(agent_instance):
                step_duration = time.time() - step_start_time[0]
                # Get last action from history
                if agent_instance.history and len(agent_instance.history.history) > 0:
                    last_step = agent_instance.history.history[-1]
                    if last_step.model_output and last_step.model_output.action:
                        actions = last_step.model_output.action
                        action_names = [a.__class__.__name__ for a in actions]
                        action_summary = ", ".join(action_names)
                        self._log(f"✅ Step {current_step[0]}: {action_summary} ({step_duration:.2f}s)")

            # Time agent execution
            agent_start = time.time()
            self._log("🤖 Running agent...")
            history = await agent.run(
                max_steps=15,
                on_step_start=on_step_start,
                on_step_end=on_step_end,
            )
            timing.agent_execution_ms = (time.time() - agent_start) * 1000
            self._log(f"✅ Agent completed ({timing.agent_execution_ms/1000:.2f}s)")

            # Time action extraction
            extract_start = time.time()
            self._log("📊 Extracting actions...")
            flow.actions = self._extract_actions_from_history(history)
            timing.extraction_ms = (time.time() - extract_start) * 1000
            self._log(f"✅ Extracted {len(flow.actions)} actions ({timing.extraction_ms/1000:.2f}s)")

            flow.success = True

        except Exception as e:
            flow.error = str(e)
            flow.success = False

        finally:
            # Browser Use's Browser object stores the session
            # Close the browser session properly
            if hasattr(browser, 'session') and browser.session:
                await browser.session.close()

        # Calculate total
        timing.total_ms = (time.time() - timing.start_time) * 1000
        flow.duration_ms = timing.total_ms
        self.timings.append(timing)

        return flow

    def _extract_actions_from_history(
        self, history: Any
    ) -> list[RecordedAction]:
        """Extract recorded actions from Browser Use agent history."""
        actions: list[RecordedAction] = []

        # Validate history exists and has correct structure
        if not history:
            self._log_verbose("History is None")
            return actions

        if not hasattr(history, "history"):
            self._log_verbose(f"History missing 'history' attr. Type: {type(history)}")
            return actions

        self._log_verbose(f"Processing {len(history.history)} history steps")

        for step_idx, step in enumerate(history.history):
            self._log_verbose(f"Step {step_idx + 1}:")

            # Check model_output exists
            if not hasattr(step, "model_output") or not step.model_output:
                self._log_verbose(f"  ⏭️  No model_output")
                continue

            # CRITICAL FIX: action is a LIST in v0.11.9, not single object
            action_list = step.model_output.action
            if not action_list:
                self._log_verbose(f"  ⏭️  Empty action list")
                continue

            self._log_verbose(f"  Found {len(action_list)} action(s)")

            # Get URL from state
            url_before = ""
            url_after = ""
            if hasattr(step, "state") and step.state:
                url_before = getattr(step.state, "url", "")
                url_after = url_before

            # Process each action in the list
            for action_idx, action_item in enumerate(action_list):
                action_type_name = action_item.__class__.__name__
                self._log_verbose(f"    Action {action_idx + 1}: {action_type_name}")

                # Parse action type from class name
                action_type = self._parse_action_type(action_type_name)

                if action_type in ("navigate", "scroll"):
                    self._log_verbose(f"      ⏭️  Filtered {action_type}")
                    continue

                if not action_type:
                    self._log_verbose(f"      ⚠️  Unknown type: {action_type_name}")
                    continue

                # CRITICAL FIX: Get element from state.interacted_element LIST
                element_info = self._get_element_from_state(step, action_idx)

                # Get input value
                input_value = None
                if hasattr(action_item, "text"):
                    input_value = action_item.text
                elif hasattr(action_item, "value"):
                    input_value = action_item.value

                # Update URL from result if navigation occurred
                if hasattr(step, "result") and step.result and len(step.result) > action_idx:
                    result_item = step.result[action_idx]
                    if hasattr(result_item, "url") and result_item.url:
                        url_after = result_item.url

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
                self._log_verbose(f"      ✅ Recorded {action_type}")

        self._log_verbose(f"Extracted {len(actions)} total actions")
        return actions

    def _parse_action_type(self, action_class_name: str) -> str | None:
        """Parse Browser Use action class name to our action type."""
        name_lower = action_class_name.lower()

        if "click" in name_lower:
            return "click"
        elif "input" in name_lower or "type" in name_lower:
            return "type"
        elif "select" in name_lower:
            return "select"
        elif "navigate" in name_lower or "goto" in name_lower:
            return "navigate"
        elif "scroll" in name_lower:
            return "scroll"
        else:
            return None

    def _get_element_from_state(self, step: Any, action_index: int) -> dict[str, Any]:
        """Get element information from Browser Use step state.

        Browser Use v0.11.9 stores interacted elements in state.interacted_element as a LIST.
        """
        element_info: dict[str, Any] = {"attributes": {}}

        if not hasattr(step, "state") or not step.state:
            self._log_verbose(f"        No state")
            return element_info

        # CRITICAL FIX: interacted_element is a LIST in v0.11.9
        if not hasattr(step.state, "interacted_element"):
            self._log_verbose(f"        No interacted_element in state")
            return element_info

        interacted_elements = step.state.interacted_element
        if not interacted_elements or action_index >= len(interacted_elements):
            self._log_verbose(f"        No element at index {action_index}")
            return element_info

        elem = interacted_elements[action_index]
        if not elem:
            self._log_verbose(f"        Element {action_index} is None")
            return element_info

        # Extract from DOMInteractedElement
        if hasattr(elem, "node_name"):
            element_info["tag"] = elem.node_name.lower()

        if hasattr(elem, "node_value"):
            element_info["text"] = elem.node_value

        if hasattr(elem, "attributes") and elem.attributes:
            element_info["attributes"] = dict(elem.attributes)

        # Use ax_name as fallback text
        if not element_info.get("text") and hasattr(elem, "ax_name") and elem.ax_name:
            element_info["text"] = elem.ax_name

        self._log_verbose(f"        Element: {element_info.get('tag', '?')} - {element_info.get('text', '')[:30]}")

        return element_info

    def convert_flow_to_target(self, flow: RecordedFlow) -> ManifestTarget | None:
        """Convert a recorded flow to a manifest target."""
        if not flow.success or not flow.actions:
            return None

        task = flow.task

        # Generate ID
        target_id = generate_id_from_description(task.description)

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
            self._log(f"⚠️  Warning: No valid steps found for task '{flow.task.description}'")
            if flow.actions:
                self._log_verbose(f"Had {len(flow.actions)} actions: {[a.action_type for a in flow.actions]}")
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

        return ManifestTarget(
            id=target_id,
            selector=target_selector,
            label=label,
            description=task.description,
            keywords=keywords,
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

    def _build_manifest(self, targets: list[ManifestTarget]) -> Manifest:
        """Build a Manifest object from a list of targets."""
        return Manifest(
            meta=ManifestMeta(
                app_name=self._infer_app_name(),
                generated_at=datetime.now(timezone.utc).isoformat(),
                generator=f"clippi-agent/{self.config.provider}",
            ),
            defaults=ManifestDefaults(timeout_ms=self.config.timeout_ms),
            targets=targets,
        )

    def _write_partial_manifest(self, targets: list[ManifestTarget]) -> None:
        """Write current progress to a .part file."""
        part_path = self.config.output_path + ".part"

        write_start = time.time()
        manifest = self._build_manifest(targets)
        manifest_dict = manifest.model_dump(by_alias=True, exclude_none=True)

        with open(part_path, "w") as f:
            json.dump(manifest_dict, f, indent=2)

        write_duration = time.time() - write_start

        # Show what was saved
        total_steps = sum(len(t.path) if t.path else 0 for t in targets)
        self._log(f"💾 Progress saved: {len(targets)} target{'s' if len(targets) != 1 else ''}, "
                  f"{total_steps} step{'s' if total_steps != 1 else ''} ({write_duration:.2f}s)")

        # Show last added target
        if targets:
            last = targets[-1]
            step_count = len(last.path) if last.path else 0
            self._log_verbose(f"Latest: {last.id} ({step_count} step{'s' if step_count != 1 else ''})")

    def _load_partial_manifest(self) -> tuple[list[ManifestTarget], set[str]]:
        """Load targets from an existing .part file. Returns (targets, completed_ids)."""
        part_path = self.config.output_path + ".part"
        if not os.path.exists(part_path):
            return [], set()

        try:
            with open(part_path) as f:
                data = json.load(f)
            targets = [ManifestTarget(**t) for t in data.get("targets", [])]
            completed_ids = {t.id for t in targets}
            return targets, completed_ids
        except (json.JSONDecodeError, Exception):
            return [], set()

    async def generate_manifest(self) -> Manifest:
        """Generate a complete manifest by exploring all tasks."""
        # Try to resume from a previous partial run
        targets, completed_ids = self._load_partial_manifest()

        total = len(self.config.tasks)
        skipped = 0

        print(f"\n🚀 Starting manifest generation for {total} tasks")
        print(f"   URL: {self.config.url}")
        print(f"   Model: {self.config.provider}/{self.config.model}")

        if completed_ids:
            print(f"   🔄 Resuming: {len(completed_ids)} completed, {total - len(completed_ids)} remaining")
            preview = list(completed_ids)[:3]
            preview_str = ", ".join(preview)
            if len(completed_ids) > 3:
                preview_str += f", ... (+{len(completed_ids) - 3} more)"
            print(f"      Completed: {preview_str}")

        print()

        for i, task in enumerate(self.config.tasks, 1):
            task_id = generate_id_from_description(task.description)
            if task_id in completed_ids:
                print(f"⏭️  [{i}/{total}] Skipping (done): {task.description}")
                skipped += 1
                continue

            print(f"📋 [{i}/{total}] Exploring: {task.description}")

            flow = await self.explore_task(task)
            self.recorded_flows.append(flow)

            # Get timing for this task
            elapsed = self.timings[-1].total_ms / 1000 if self.timings else 0

            if flow.success:
                target = self.convert_flow_to_target(flow)
                if target:
                    targets.append(target)
                    self._write_partial_manifest(targets)
                    step_count = len(target.path) if target.path else 1
                    print(f"   ✅ Generated target: {target.id} ({step_count} steps) - {elapsed:.1f}s")
                else:
                    print(f"   ⚠️  Flow succeeded but no steps recorded - {elapsed:.1f}s")
            else:
                print(f"   ❌ Failed: {flow.error} - {elapsed:.1f}s")

        # Print timing summary
        if self.timings:
            print(f"\n⏱️  Performance Summary:")
            print(f"{'Task':<38} {'Total':>8} {'Browser':>8} {'Agent':>8} {'Extract':>8}")
            print("-" * 79)

            for timing in self.timings:
                task, total, browser, agent, extract = timing.format_row()
                print(f"{task:<38} {total:>8} {browser:>8} {agent:>8} {extract:>8}")

            total_ms = sum(t.total_ms for t in self.timings)
            print("-" * 79)
            print(f"{'TOTAL':<38} {total_ms/1000:>7.1f}s")
            print()

        print(f"✨ Generated manifest with {len(targets)} targets", end="")
        if skipped:
            print(f" ({skipped} resumed)")
        else:
            print()

        if len(targets) == 0:
            print(f"\n⚠️  WARNING: No targets were generated!")
            print(f"   Attempted: {total} task{'s' if total != 1 else ''}")
            print(f"   Succeeded: 0")
            print(f"\n   💡 Troubleshooting:")
            print(f"      1. Run with --verbose to see extraction details")
            print(f"      2. Check that the application is accessible at {self.config.url}")
            print(f"      3. Verify Browser Use version: pip show browser-use")
        elif len(targets) < total - skipped:
            failed = total - skipped - len(targets)
            print(f"\n⚠️  Partial success: {failed}/{total - skipped} task{'s' if failed != 1 else ''} failed")

        return self._build_manifest(targets)

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

    # Write final manifest
    output_path = config.output_path
    with open(output_path, "w") as f:
        manifest_dict = manifest.model_dump(by_alias=True, exclude_none=True)
        json.dump(manifest_dict, f, indent=2)

    # Clean up partial file
    part_path = output_path + ".part"
    if os.path.exists(part_path):
        os.remove(part_path)

    print(f"\n📄 Manifest written to: {output_path}")
    return manifest
