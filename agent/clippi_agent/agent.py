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
    ReflectedAction,
    ReflectedFlow,
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

    # Priority 2: xpath
    if "xpath" in element_info and element_info["xpath"]:
        strategies.append(
            SelectorStrategy(type="xpath", value=element_info["xpath"])
        )

    # Priority 3: aria-label
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
    raw_text = element_info.get("text", "")
    text = " ".join(raw_text.split()).strip()  # Collapse whitespace
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

    if action.resulting_state:
        # Check elements added first
        if "elements_added" in action.resulting_state:
            added = action.resulting_state["elements_added"]
            if added:
                for el in added:
                    attrs = el.get("attributes", {})
                    if "data-testid" in attrs:
                        return SuccessCondition(visible=f"[data-testid='{attrs['data-testid']}']")
                    elif "id" in attrs:
                        return SuccessCondition(visible=f"#{attrs['id']}")
                
                # Fallback to the first element's tag + class if available
                first_el = added[0]
                tag = first_el.get("tag", "div")
                attrs = first_el.get("attributes", {})
                if "class" in attrs and attrs["class"]:
                    cls = attrs["class"].split()[0]
                    return SuccessCondition(visible=f"{tag}.{cls}")
                
                return SuccessCondition(visible=tag)

        # Check elements modified next (e.g., modal opening)
        if "elements_modified" in action.resulting_state:
            modified = action.resulting_state["elements_modified"]
            if modified:
                for el in modified:
                    attrs = el.get("attributes", {})
                    changed = el.get("changed")
                    
                    if "id" in attrs:
                        selector = f"#{attrs['id']}"
                        if changed == "class" and "class" in attrs:
                            # Use the last class added
                            classes = attrs["class"].split()
                            if classes:
                                selector += f".{classes[-1]}"
                        return SuccessCondition(visible=selector)
                    elif "data-testid" in attrs:
                        return SuccessCondition(visible=f"[data-testid='{attrs['data-testid']}']")

    if action.action_type in ("click", "type", "select"):
        return SuccessCondition(click=True)

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

    SYSTEM_PROMPT = """You are a UI exploration agent for Clippi. Your job is to explore a web application \
and document how to complete specific tasks by clicking through the UI.

## Goal

DOCUMENT how a user would complete the task inside the app. Walk through the COMPLETE flow \
step-by-step and call `done` when finished. Do NOT navigate to external sites.

## Critical Rules

1. Stay on the target URL domain. NEVER leave.
2. Use placeholder values for forms (e.g., "Example" for names).
3. If you encounter a login page, STOP and report it.
4. Call `done` only after the task is FULLY completed.

## Modal & Dialog Handling (VERY IMPORTANT)

Most app actions open a modal/dialog. You MUST complete the full flow inside the modal:

1. **After clicking a button that opens a modal**: WAIT for the modal to appear. Modals often \
have CSS transitions (opacity, transform). After clicking, call `wait` for 1 second, then look \
at the page state again.
2. **Interact with elements INSIDE the modal**: Select dropdowns, fill inputs, check checkboxes. \
The modal will have its own buttons (like "Export", "Import", "Save Changes", "Create", "Confirm"). \
These are DIFFERENT from the toolbar buttons that opened the modal, even if they have similar text.
3. **Click the confirmation button inside the modal** to finish the flow (e.g., "Save Changes", \
"Export", "Create", "Import", "Confirm").
4. **NEVER re-click the button that opened the modal**. If you already clicked "Export" on the \
toolbar and a modal appeared, do NOT click the same toolbar "Export" button again. Instead, \
interact with the form elements inside the modal and then click the modal's own confirm button.

## Identifying Modal Elements vs Toolbar Elements

- Toolbar/page buttons are at the TOP of the page, inside headers or action bars.
- Modal buttons are INSIDE `div[role="dialog"]` or elements with classes like `modal`, `modal-footer`.
- Modal confirm buttons typically have `data-testid` ending in `-confirm`, `-save`, or `-submit`.
- If you see two buttons with similar text (e.g., "Export"), the one inside the modal is the one \
you need to click to complete the flow. Check the DOM hierarchy or `data-testid` to tell them apart.

## Interaction Strategy

- ALWAYS try clicking elements by their index first. The page state shows indexed interactive elements.
- If an element you need (e.g., inside a modal or dropdown) is NOT indexed, use `evaluate` with \
JavaScript to click it directly.
- **CRITICAL: EVALUATE MUST RETURN ELEMENT INFO.** Every `evaluate` call that clicks/interacts \
with an element MUST return a JSON string describing it. Without this, we cannot record the action. \
Use this exact pattern:

```
(function(){
  const el = document.querySelector('[data-testid="my-btn"]');
  if(!el) return JSON.stringify({error: "not found"});
  el.click();
  return JSON.stringify({
    tag: el.tagName,
    text: el.textContent.trim(),
    attributes: {
      "data-testid": el.getAttribute("data-testid") || undefined,
      "aria-label": el.getAttribute("aria-label") || undefined,
      "class": el.getAttribute("class") || undefined
    }
  });
})()
```

- NEVER write evaluate code that just does `el.click()` without returning the JSON descriptor.
- Filter out null/undefined attribute values — only include attributes that exist.
- Do NOT call `find_elements` more than once per modal/dialog. If `find_elements` does not give \
you a clickable index, switch to `evaluate` immediately.
- NEVER repeat the same `find_elements` call. If you already tried it, use a different approach.

## What We Record

Each click, type, and select action captures the element's tag, text, and attributes \
(data-testid, aria-label, id, class). This generates a manifest for visual cursor guidance.

## Output Quality & Hallucination Prevention

- **CRITICAL**: Before calling `done`, you MUST verify the final state matches what the task \
asked for. If you opened a modal, you MUST interact with the modal contents (dropdowns, inputs) \
AND click the modal's confirm/save button before calling `done`.
- Do NOT hallucinate dialogs or modals being open if they are not present in the browser state.
- Prefer elements with `data-testid` or `aria-label` (stable selectors).
- Navigate via the app's UI (nav bar, sidebar, menus), not by URL.
- Complete multi-step flows fully (e.g., for "export to CSV": click Export toolbar button → \
wait for modal → select CSV format in dropdown → click the modal's Export/Confirm button).
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

    REFLECTION_PROMPT = """You just explored a web application to complete a task. Now reflect on \
what you did and identify ONLY the essential user-facing steps needed to accomplish the task.

## Your Job

Given the task description and the full history of recorded actions (indexed from 0), \
produce the MINIMAL sequence of actions a real user would need.

## Rules

1. **Only include actions the user needs to perform.** If you clicked around to understand \
the UI, those exploratory clicks should NOT be in the output.
2. **Remove duplicates.** If you clicked the same button multiple times (e.g., retrying), \
include it only once.
3. **Remove noise.** If you clicked something unrelated to the task (e.g., clicked a menu \
then went back), exclude it.
4. **Include the complete flow.** Don't stop short — if the task requires clicking a confirm \
button in a modal, include that step.
5. **But don't overshoot.** If the task is "find my API key", the final step is navigating \
to the API key section — do NOT include "Save Changes" or other actions beyond the task goal.
6. **Use human-friendly instructions.** Each step should have a clear instruction like \
'Click the "Export" button' or 'Select "CSV" from the format dropdown'.
7. **Mark the last step as is_final=true.**
8. **CRITICAL: Always set source_action_index** to the index of the recorded action this step \
corresponds to. This is how we recover the element's selectors (data-testid, aria-label, etc.) \
from the recording. If the step doesn't map to any recorded action (rare), set it to null.

## Output Format

Return a JSON object with a "steps" array. Each step has:
- action: "click" | "type" | "select"
- instruction: human-readable instruction
- source_action_index: index into the recorded actions array (REQUIRED)
- input_value: value for type/select actions (null for clicks)
- is_final: true only for the last step
"""

    def _build_task_prompt(self, task: AgentTask) -> str:
        """Build the task prompt for the Browser Use agent."""
        parts = [
            f'Navigate to {self.config.url} and complete this task: "{task.description}".',
            "",
            "Walk through the COMPLETE flow step-by-step:",
            "1. Find and click the relevant button/link on the page.",
            "2. If a modal or dialog opens, WAIT for it to fully appear, then interact with",
            "   the form elements RELEVANT TO THE TASK (dropdowns, inputs, checkboxes).",
            "3. Click the confirmation/save button INSIDE the modal to finish.",
            "",
            "IMPORTANT:",
            "- Each step should interact with a DIFFERENT element. Never click the same button twice.",
            "- If a modal opened, work inside it — don't re-click the trigger button.",
            "- ONLY interact with elements that are directly relevant to the task description.",
            "  Do NOT fill in or change form fields that the task doesn't ask about.",
            '  For example, if the task says "change theme to dark mode", ONLY change the theme',
            "  dropdown — do NOT also change the language or timezone.",
            '  If the task says "find my API key", navigate to the API key section and STOP.',
            "  Do NOT explore every settings tab or fill in unrelated forms.",
            "",
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
            # Track step progress
            current_step = [0]  # Use list for closure modification
            step_start_time = [0.0]  # Track when each step starts
            step_dom_items = []

            async def on_new_step(state, output, step):
                if hasattr(state, "dom_state") and hasattr(state.dom_state, "selector_map"):
                    step_dom_items.append(state.dom_state.selector_map)
                else:
                    step_dom_items.append({})

            # Build agent
            agent = Agent(
                task=self._build_task_prompt(task),
                llm=self.llm,
                browser=browser,
                use_vision=True,
                extend_system_message=self.SYSTEM_PROMPT,
                include_attributes=["data-testid", "aria-label", "aria-selected", "role"],
                max_actions_per_step=3,
                register_new_step_callback=on_new_step,
            )

            async def on_step_start(agent_instance):
                current_step[0] += 1
                step_start_time[0] = time.time()
                self._log(f"🧠 Step {current_step[0]}/10: Agent analyzing page...")

            async def on_step_end(agent_instance):
                step_duration = time.time() - step_start_time[0]
                # Get last action from history
                if agent_instance.history and len(agent_instance.history.history) > 0:
                    last_step = agent_instance.history.history[-1]
                    if last_step.model_output and last_step.model_output.action:
                        actions = last_step.model_output.action
                        action_names = [self._get_action_name(a) or "unknown" for a in actions]
                        action_summary = ", ".join(action_names)
                        self._log(f"✅ Step {current_step[0]}: {action_summary} ({step_duration:.2f}s)")

            # Time agent execution
            agent_start = time.time()
            self._log("🤖 Running agent...")
            history = await agent.run(
                max_steps=10,
                on_step_start=on_step_start,
                on_step_end=on_step_end,
            )
            timing.agent_execution_ms = (time.time() - agent_start) * 1000
            self._log(f"✅ Agent completed ({timing.agent_execution_ms/1000:.2f}s)")

            # Time action extraction (raw recording for debugging)
            extract_start = time.time()
            self._log("📊 Extracting raw actions...")
            flow.actions = self._extract_actions_from_history(history, step_dom_items)
            timing.extraction_ms = (time.time() - extract_start) * 1000
            self._log(f"✅ Extracted {len(flow.actions)} raw actions ({timing.extraction_ms/1000:.2f}s)")

            # Reflection: ask the LLM to identify only the essential steps
            reflect_start = time.time()
            self._log("🪞 Reflecting on essential steps...")
            flow.reflected_actions = await self._reflect_on_actions(task, flow.actions)
            reflect_duration = (time.time() - reflect_start) * 1000
            self._log(
                f"✅ Reflected: {len(flow.reflected_actions)} essential steps "
                f"(from {len(flow.actions)} raw) ({reflect_duration/1000:.2f}s)"
            )

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

    async def _reflect_on_actions(
        self, task: AgentTask, raw_actions: list[RecordedAction]
    ) -> list[ReflectedAction]:
        """Ask the LLM to reflect on its exploration and identify essential steps.

        Instead of using heuristic dedup/cleaning, we give the LLM the task
        description and the full action history, and ask it to return only the
        minimal steps a real user would need.
        """
        from browser_use.llm.messages import SystemMessage, UserMessage

        # Build a summary of recorded actions for the LLM
        actions_summary = []
        for i, action in enumerate(raw_actions):
            entry = {
                "index": i,
                "action": action.action_type,
                "tag": action.element_tag,
                "text": action.element_text,
                "attributes": action.element_attributes,
                "xpath": action.xpath,
                "input_value": action.input_value,
                "url_before": action.url_before,
                "url_after": action.url_after,
            }
            actions_summary.append(entry)

        user_prompt = (
            f'Task: "{task.description}"\n\n'
            f"Recorded actions during exploration ({len(raw_actions)} total):\n"
            f"{json.dumps(actions_summary, indent=2)}\n\n"
            "Now identify only the essential user-facing steps. "
            "Return them as a structured ReflectedFlow."
        )

        messages = [
            SystemMessage(content=self.REFLECTION_PROMPT),
            UserMessage(content=user_prompt),
        ]

        try:
            result = await self.llm.ainvoke(
                messages, output_format=ReflectedFlow
            )
            reflected = result.completion
            if isinstance(reflected, ReflectedFlow) and reflected.steps:
                # Ensure last step is marked final
                for step in reflected.steps:
                    step.is_final = False
                reflected.steps[-1].is_final = True

                # Enrich reflected steps with element metadata from raw actions
                self._enrich_reflected_from_raw(reflected.steps, raw_actions)

                return reflected.steps
            else:
                self._log("⚠️  Reflection returned no steps, falling back to raw actions")
                return self._raw_actions_to_reflected(raw_actions)
        except Exception as e:
            self._log(f"⚠️  Reflection failed ({e}), falling back to raw actions")
            return self._raw_actions_to_reflected(raw_actions)

    def _enrich_reflected_from_raw(
        self,
        reflected: list[ReflectedAction],
        raw_actions: list[RecordedAction],
    ) -> None:
        """Fill in element metadata on reflected steps from the raw action recording.

        The LLM returns source_action_index pointing to the raw action each step
        corresponds to. We pull tag, text, attributes, and xpath from the raw
        action so selectors can be generated properly.
        """
        for step in reflected:
            idx = step.source_action_index
            if idx is not None and 0 <= idx < len(raw_actions):
                raw = raw_actions[idx]
                step.element = {
                    "tag": raw.element_tag or "div",
                    "text": raw.element_text or "",
                    "attributes": raw.element_attributes or {},
                    "xpath": raw.xpath,
                }
                self._log_verbose(
                    f"  Enriched step '{step.instruction[:40]}' from raw[{idx}] "
                    f"({raw.element_tag} / {(raw.element_attributes or {}).get('data-testid', '?')})"
                )
            elif not step.element or not step.element.get("tag"):
                self._log_verbose(
                    f"  ⚠️  No raw match for step '{step.instruction[:40]}' (index={idx})"
                )

    def _raw_actions_to_reflected(
        self, raw_actions: list[RecordedAction]
    ) -> list[ReflectedAction]:
        """Convert raw recorded actions to ReflectedAction format as a fallback."""
        reflected = []
        for i, action in enumerate(raw_actions):
            if action.action_type not in ("click", "type", "select"):
                continue
            reflected.append(
                ReflectedAction(
                    action=action.action_type,
                    instruction=self._generate_instruction(action),
                    source_action_index=i,
                    element={
                        "tag": action.element_tag or "div",
                        "text": action.element_text or "",
                        "attributes": action.element_attributes,
                        "xpath": action.xpath,
                    },
                    input_value=action.input_value,
                    is_final=False,
                )
            )
        if reflected:
            reflected[-1].is_final = True
        return reflected

    def _extract_actions_from_history(
        self, history: Any, step_dom_items: list[dict] = None
    ) -> list[RecordedAction]:
        step_dom_items = step_dom_items or []
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
                # Get the real action name from the ActionModel's dynamic field
                action_name = self._get_action_name(action_item)
                self._log_verbose(f"    Action {action_idx + 1}: {action_name}")

                if not action_name:
                    self._log_verbose(f"      ⚠️  Could not determine action name")
                    continue

                # Parse action type (returns None for non-interactive actions)
                action_type = self._parse_action_type(action_name)

                if not action_type:
                    self._log_verbose(f"      ⏭️  Skipped non-interactive: {action_name}")
                    continue

                # CRITICAL FIX: Get element from state.interacted_element LIST
                element_info = self._get_element_from_state(step, action_idx)

                # Get input value from the action's parameters
                input_value = None
                try:
                    action_data = action_item.model_dump(exclude_unset=True)
                    params = action_data.get(action_name, {})
                    if isinstance(params, dict):
                        input_value = params.get("text") or params.get("value") or params.get("keys")

                        # Special handling for select actions: the LLM's select_dropdown
                        # action has a "text" field with the option text (e.g., "Dark").
                        # Only fall back to DOM state lookup if that text is missing or
                        # looks like a raw index (pure digits).
                        if action_type == "select" and "index" in params:
                            if not input_value or (isinstance(input_value, str) and input_value.isdigit()):
                                input_value = self._get_dropdown_option_from_state(step, params["index"])
                except Exception:
                    pass

                # If evaluate, parse the extracted_content as JSON to get the spoofed element
                if action_name == "evaluate" and hasattr(step, "result") and step.result and len(step.result) > action_idx:
                    try:
                        ext_content = step.result[action_idx].extracted_content
                        if ext_content:
                            parsed_elem = json.loads(ext_content)
                            if isinstance(parsed_elem, dict) and "tag" in parsed_elem:
                                element_info["tag"] = parsed_elem.get("tag", "").lower()
                                element_info["text"] = parsed_elem.get("text", "")
                                # Sanitize attributes: filter out None values,
                                # convert all to str (Pydantic requires dict[str, str])
                                raw_attrs = parsed_elem.get("attributes", {})
                                element_info["attributes"] = {
                                    str(k): str(v) for k, v in raw_attrs.items()
                                    if v is not None
                                }
                                # Change action to click for path building if it's evaluate
                                action_type = "click"
                    except Exception:
                        pass

                # If evaluate didn't produce usable element data, skip it entirely.
                # (action_type stays "evaluate" when the JS didn't return valid JSON
                # with element metadata — there's nothing meaningful to record.)
                if action_type == "evaluate":
                    self._log_verbose(f"      ⏭️  Skipped evaluate (no element data extracted)")
                    continue

                # Update URL from result if navigation occurred
                if hasattr(step, "result") and step.result and len(step.result) > action_idx:
                    result_item = step.result[action_idx]
                    if hasattr(result_item, "url") and result_item.url:
                        url_after = result_item.url

                # Extract xpath from DOMInteractedElement if available
                xpath = element_info.get("xpath")

                try:
                    recorded = RecordedAction(
                        action_type=action_type,
                        element_tag=element_info.get("tag"),
                        element_text=element_info.get("text"),
                        element_attributes=element_info.get("attributes", {}),
                        xpath=xpath,
                        input_value=input_value,
                        url_before=url_before,
                        url_after=url_after,
                        timestamp=time.time(),
                        resulting_state=None,  # Will be populated after looping
                    )

                    actions.append(recorded)
                    self._log_verbose(f"      ✅ Recorded {action_type}")
                except Exception as e:
                    self._log_verbose(f"      ❌ Failed to record action {action_type}: {e}")
                    self._log_verbose(f"         Data: tag={element_info.get('tag')} attrs={element_info.get('attributes')}")

        self._log_verbose(f"Extracted {len(actions)} total actions")

        # Now compute DOM diffs for resulting_state if possible
        self._compute_and_assign_dom_diffs(actions, history, step_dom_items)

        return actions

    def _compute_and_assign_dom_diffs(self, actions: list[RecordedAction], history: Any, step_dom_items: list[dict]) -> None:
        """Compute differences between steps to populate resulting_state."""
        if not actions or not history or not hasattr(history, "history"):
            return

        action_idx = 0
        for step_idx in range(len(history.history) - 1):
            step = history.history[step_idx]

            if not hasattr(step, "model_output") or not step.model_output:
                continue
            
            action_list = step.model_output.action
            if not action_list:
                continue

            # Assuming the last interactive action in this step caused the DOM change
            interactive_actions = [a for a in action_list if self._get_action_name(a) not in {"navigate", "go_back", "scroll", "find_elements", "search_page", "extract", "screenshot", "read_content", "wait", "search", "switch_tab", "close_tab", "done", "get_dropdown_options", "upload_file"}]
            if not interactive_actions:
                continue
                
            # Advance action_idx to the last interactive action of this step
            action_idx += len(interactive_actions) - 1
            if action_idx >= len(actions):
                break
                
            current_action = actions[action_idx]

            curr_selector_map = step_dom_items[step_idx] if step_idx < len(step_dom_items) else {}
            next_selector_map = step_dom_items[step_idx + 1] if step_idx + 1 < len(step_dom_items) else {}

            curr_items = list(curr_selector_map.values())
            next_items = list(next_selector_map.values())

            curr_paths = {}
            for item in curr_items:
                xp = getattr(item, "x_path", None) or getattr(item, "xpath", None)
                if xp:
                    curr_paths[xp] = item
                    
            next_paths = {}
            for item in next_items:
                xp = getattr(item, "x_path", None) or getattr(item, "xpath", None)
                if xp:
                    next_paths[xp] = item

            added_xpaths = set(next_paths.keys()) - set(curr_paths.keys())
            
            elements_added = []
            for xp in list(added_xpaths)[:5]:  # Limit to 5 for brevity
                item = next_paths[xp]
                el_data = {
                    "tag": getattr(item, "node_name", "Unknown").lower(),
                    "attributes": {}
                }
                if hasattr(item, "attributes") and item.attributes:
                    try:
                        el_data["attributes"] = dict(item.attributes)
                    except Exception:
                        pass
                elements_added.append(el_data)
                
            elements_modified = []
            for xp, curr_item in curr_paths.items():
                if xp in next_paths:
                    next_item = next_paths[xp]
                    curr_attrs = dict(getattr(curr_item, "attributes", {}) or {})
                    next_attrs = dict(getattr(next_item, "attributes", {}) or {})
                    
                    if curr_attrs.get("class") != next_attrs.get("class") or curr_attrs.get("style") != next_attrs.get("style"):
                        el_data = {
                            "tag": getattr(next_item, "node_name", "Unknown").lower(),
                            "attributes": next_attrs,
                            "xpath": xp,
                            "changed": "class" if curr_attrs.get("class") != next_attrs.get("class") else "style"
                        }
                        elements_modified.append(el_data)
                        if len(elements_modified) >= 5:
                            break

            if elements_added or elements_modified:
                current_action.resulting_state = {}
                if elements_added:
                    current_action.resulting_state["elements_added"] = elements_added
                if elements_modified:
                    current_action.resulting_state["elements_modified"] = elements_modified
            
            action_idx += 1

    def _get_action_name(self, action_item: Any) -> str | None:
        """Get the action name from a Browser Use ActionModel instance.

        In Browser Use v0.11.9, actions are ActionModel instances with a single
        dynamic field. The field name IS the action name (e.g., 'click', 'input',
        'select_dropdown'). action_item.__class__.__name__ is always 'ActionModel'.
        """
        try:
            action_data = action_item.model_dump(exclude_unset=True)
            if action_data:
                return next(iter(action_data.keys()))
        except Exception:
            pass
        return None

    def _parse_action_type(self, action_name: str) -> str | None:
        """Map a Browser Use action name to our action type."""
        # Map Browser Use action names to our types
        ACTION_MAP = {
            "click": "click",
            "click_element": "click",
            "input": "type",
            "input_text": "type",
            "type": "type",
            "send_keys": "type",
            "select_dropdown": "select",
            "select_dropdown_option": "select",
            "select": "select",
        }

        # Skip non-interactive actions that don't belong in the manifest
        SKIP_ACTIONS = {
            "navigate", "go_back", "scroll", "find_elements", "search_page",
            "extract", "screenshot", "read_content", "wait",
            "search", "switch_tab", "close_tab", "done",
            "get_dropdown_options", "upload_file",
        }

        if action_name == "evaluate":
            return "evaluate"

        if action_name in SKIP_ACTIONS:
            return None

        if action_name in ACTION_MAP:
            return ACTION_MAP[action_name]

        # Fallback: try substring matching for unknown action names
        name_lower = action_name.lower()
        if "click" in name_lower:
            return "click"
        elif "input" in name_lower or "type" in name_lower:
            return "type"
        elif "select" in name_lower:
            return "select"

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
            try:
                attrs = dict(elem.attributes)
                # Pydantic validation requires dict[str, str], so force all values to str
                element_info["attributes"] = {str(k): str(v) if v is not None else "" for k, v in attrs.items()}
            except Exception as e:
                self._log_verbose(f"        Warning: Failed to parse attributes: {e}")
                element_info["attributes"] = {}

        # In browser_use 0.11.9, DOMInteractedElement uses x_path instead of xpath
        if hasattr(elem, "x_path") and elem.x_path:
            element_info["xpath"] = elem.x_path
        elif hasattr(elem, "xpath") and elem.xpath:
            element_info["xpath"] = elem.xpath

        # Use ax_name as fallback text
        if not element_info.get("text") and hasattr(elem, "ax_name") and elem.ax_name:
            element_info["text"] = elem.ax_name

        self._log_verbose(f"        Element: {element_info.get('tag', '?')} - {element_info.get('text', '')[:30]}")

        return element_info

    def _get_dropdown_option_from_state(self, step: Any, index: int) -> str | None:
        """Get the text or value of a dropdown option by index from the state.

        Browser Use's select_dropdown uses a highlight_index to identify the
        chosen <option>. We look in both interacted_element list and the
        DOM selector_map to find the actual option text/value.
        """
        if not hasattr(step, "state") or not step.state:
            return str(index)

        # Strategy 1: Check interacted_element list
        interacted_elements = getattr(step.state, "interacted_element", [])
        if interacted_elements and not isinstance(interacted_elements, dict):
            try:
                for item in interacted_elements:
                    if hasattr(item, "highlight_index") and item.highlight_index == index:
                        if hasattr(item, "node_value") and item.node_value:
                            return item.node_value
                        if hasattr(item, "attributes") and item.attributes:
                            if "value" in item.attributes:
                                return item.attributes["value"]
            except Exception:
                pass

        # Strategy 2: Check DOM selector_map for the option element at this index
        if hasattr(step.state, "dom_state") and hasattr(step.state.dom_state, "selector_map"):
            selector_map = step.state.dom_state.selector_map
            if index in selector_map:
                item = selector_map[index]
                tag = getattr(item, "node_name", "").lower()
                if tag == "option":
                    # Return the option's text or value attribute
                    text = getattr(item, "node_value", None) or getattr(item, "ax_name", None)
                    if text:
                        return " ".join(text.split()).strip()
                    attrs = dict(getattr(item, "attributes", {}) or {})
                    if "value" in attrs:
                        return attrs["value"]

        return str(index)

    def convert_flow_to_target(self, flow: RecordedFlow) -> ManifestTarget | None:
        """Convert a recorded flow to a manifest target.

        Uses reflected_actions (LLM-identified essential steps) when available.
        Falls back to raw actions with heuristic cleaning only if reflection
        didn't produce results.
        """
        if not flow.success:
            return None

        task = flow.task
        target_id = generate_id_from_description(task.description)

        # Prefer reflected actions (LLM-curated essential steps)
        if flow.reflected_actions:
            path = self._build_path_from_reflected(flow.reflected_actions)
        elif flow.actions:
            # Fallback: old pipeline (raw actions → clean → build)
            path = self._build_path_from_raw_actions(flow.actions)
        else:
            return None

        if not path:
            self._log(f"⚠️  Warning: No valid steps found for task '{flow.task.description}'")
            return None

        target_selector = path[0].selector

        label = task.description.title()
        if len(label) > 50:
            label = label[:47] + "..."

        keywords = extract_keywords(task.description, label)

        return ManifestTarget(
            id=target_id,
            selector=target_selector,
            label=label,
            description=task.description,
            keywords=keywords,
            path=path if path else None,
        )

    def _build_path_from_reflected(
        self, reflected_actions: list[ReflectedAction]
    ) -> list[PathStep]:
        """Build manifest PathSteps from LLM-reflected essential actions."""
        path: list[PathStep] = []
        for step in reflected_actions:
            element_info = {
                "tag": step.element.get("tag", "div"),
                "text": step.element.get("text", ""),
                "attributes": step.element.get("attributes", {}),
                "xpath": step.element.get("attributes", {}).get("xpath")
                    or step.element.get("xpath"),
            }
            selector = extract_selectors_from_element(element_info)

            path.append(
                PathStep(
                    selector=selector,
                    instruction=step.instruction,
                    action=step.action,
                    input=step.input_value,
                    success_condition=SuccessCondition(click=True),
                    final=step.is_final,
                )
            )
        return path

    def _build_path_from_raw_actions(
        self, raw_actions: list[RecordedAction]
    ) -> list[PathStep]:
        """Fallback: build path from raw actions (legacy pipeline)."""
        path: list[PathStep] = []
        for i, action in enumerate(raw_actions):
            if action.action_type in ("navigate", "scroll"):
                continue

            element_info = {
                "tag": action.element_tag or "div",
                "text": action.element_text or "",
                "attributes": action.element_attributes,
                "xpath": action.xpath,
            }

            selector = extract_selectors_from_element(element_info)
            instruction = self._generate_instruction(action)
            next_action = raw_actions[i + 1] if i + 1 < len(raw_actions) else None
            success_condition = infer_success_condition(action, next_action)

            is_final = i == len(raw_actions) - 1 or (
                i == len(raw_actions) - 2
                and raw_actions[-1].action_type in ("navigate", "scroll")
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

        return path


    @staticmethod
    def _clean_element_text(text: str | None) -> str:
        """Normalize element text: collapse whitespace and trim."""
        if not text:
            return ""
        # Collapse all whitespace (newlines, tabs, multiple spaces) into single space
        return " ".join(text.split()).strip()

    def _generate_instruction(self, action: RecordedAction) -> str:
        """Generate a human-readable instruction for an action."""
        text = self._clean_element_text(action.element_text)

        if action.action_type == "click":
            if text:
                return f'Click on "{text}"'
            elif action.element_tag:
                return f"Click the {action.element_tag}"
            return "Click here"

        elif action.action_type == "type":
            if text:
                return f'Type in the "{text}" field'
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
                    
                    # Also persist recorded actions
                    actions_path = self.config.output_path + ".actions.json"
                    with open(actions_path, "w") as af:
                        actions_dict = [f.model_dump(exclude_none=True) for f in self.recorded_flows]
                        json.dump(actions_dict, af, indent=2)
                        
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
                task_name, total_time, browser, agent_time, extract = timing.format_row()
                print(f"{task_name:<38} {total_time:>8} {browser:>8} {agent_time:>8} {extract:>8}")

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


async def rebuild_manifest_from_actions(config: AgentConfig, actions_path: str) -> Manifest:
    """Rebuild a manifest entirely from an existing recorded actions file without creating LLM LLM tasks."""
    print(f"\n🚀 Rebuilding manifest from {actions_path}")
    
    agent = ClippiAgent(config)
    
    with open(actions_path, "r") as f:
        data = json.load(f)
        
    targets = []
    
    for flow_data in data:
        flow = RecordedFlow(**flow_data)
        
        # Only valid completed flows are dumped but let's be safe
        if flow.success:
            target = agent.convert_flow_to_target(flow)
            if target:
                targets.append(target)
                step_count = len(target.path) if target.path else 1
                print(f"   ✅ Generated target: {target.id} ({step_count} steps)")
            else:
                print(f"   ⚠️  Flow {flow.task.description} succeeded but no steps recorded")
        else:
            print(f"   ❌ Flow failed: {flow.error}")
            
    print(f"✨ Rebuilt manifest with {len(targets)} targets")
    
    manifest = agent._build_manifest(targets)
    
    # Write final rebuilt manifest
    output_path = config.output_path
    with open(output_path, "w") as f:
        manifest_dict = manifest.model_dump(by_alias=True, exclude_none=True)
        json.dump(manifest_dict, f, indent=2)

    print(f"\n📄 Manifest written to: {output_path}")
    return manifest


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
    actions_path = output_path + ".actions.json"
    if os.path.exists(actions_path):
        print(f"📼 Raw actions saved to: {actions_path}")
    return manifest
