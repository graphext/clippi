"""Test action extraction with mock Browser Use v0.11.9 history."""
import asyncio
from unittest.mock import Mock
from clippi_agent.agent import ClippiAgent
from clippi_agent.schemas import AgentConfig, AgentTask


class FakeAction:
    """Mimics Browser Use's ActionModel. model_dump() returns {action_name: params}."""

    def __init__(self, action_name: str, params: dict):
        self._action_name = action_name
        self._params = params

    def model_dump(self, **kwargs):
        return {self._action_name: self._params}


def make_step(actions, elements, url="http://localhost:3000"):
    """Create a mock history step."""
    step = Mock()
    step.model_output = Mock()
    step.model_output.action = actions
    step.state = Mock()
    step.state.url = url
    step.state.interacted_element = elements
    step.result = []
    return step


def make_element(tag, text, attributes, ax_name=None, xpath=None):
    """Create a mock DOMInteractedElement."""
    elem = Mock()
    elem.node_name = tag
    elem.node_value = text
    elem.attributes = attributes
    elem.ax_name = ax_name
    elem.x_path = xpath
    elem.xpath = xpath
    return elem


def create_mock_history():
    """Create mock history matching Browser Use v0.11.9 with real ActionModel fields."""
    # Step 1: Click the Export button
    step1 = make_step(
        actions=[FakeAction("click", {"index": 43})],
        elements=[make_element("button", "Export", {"data-testid": "export-btn", "aria-label": "Export data"})],
    )

    # Step 2: Select CSV + type filename (multi-action step)
    step2 = make_step(
        actions=[
            FakeAction("select_dropdown", {"index": 12, "text": "CSV"}),
            FakeAction("input", {"index": 5, "text": "my-export", "clear": False}),
        ],
        elements=[
            make_element("select", "", {"data-testid": "format-select"}, ax_name="Format"),
            make_element("input", "", {"data-testid": "export-name", "placeholder": "File name"}),
        ],
    )

    # Step 3: find_elements (should be skipped - non-interactive)
    step3 = make_step(
        actions=[FakeAction("find_elements", {"selector": "button", "max_results": 50})],
        elements=[None],
    )

    # Step 4: done (should be skipped - non-interactive)
    step4 = make_step(
        actions=[FakeAction("done", {"text": "Completed!", "success": True})],
        elements=[None],
    )

    history = Mock()
    history.history = [step1, step2, step3, step4]
    return history


async def test_extraction():
    config = AgentConfig(
        url="http://localhost:3000",
        tasks=[AgentTask(description="test")],
        verbose=True,
    )
    agent = ClippiAgent(config)

    mock_history = create_mock_history()
    actions = agent._extract_actions_from_history(mock_history)

    print(f"\n{'✅' if actions else '❌'} Extracted {len(actions)} actions")

    if not actions:
        print("\n❌ FAILED: No actions extracted")
        return False

    # Should have 3 interactive actions: click, select, input
    # (find_elements and done should be skipped)
    assert len(actions) == 3, f"Expected 3 actions, got {len(actions)}: {[a.action_type for a in actions]}"

    a = actions[0]
    print(f"   [0] Type: {a.action_type}, Tag: {a.element_tag}, Text: {a.element_text}")
    assert a.action_type == "click", f"Expected 'click', got '{a.action_type}'"
    assert a.element_tag == "button", f"Expected 'button', got '{a.element_tag}'"
    assert a.element_text == "Export", f"Expected 'Export', got '{a.element_text}'"
    assert a.element_attributes.get("data-testid") == "export-btn"

    b = actions[1]
    print(f"   [1] Type: {b.action_type}, Tag: {b.element_tag}, Input: {b.input_value}")
    assert b.action_type == "select", f"Expected 'select', got '{b.action_type}'"
    assert b.input_value == "CSV", f"Expected 'CSV', got '{b.input_value}'"

    c = actions[2]
    print(f"   [2] Type: {c.action_type}, Tag: {c.element_tag}, Input: {c.input_value}")
    assert c.action_type == "type", f"Expected 'type', got '{c.action_type}'"
    assert c.input_value == "my-export", f"Expected 'my-export', got '{c.input_value}'"

    print("\n✅ All assertions passed!")
    return True


if __name__ == "__main__":
    success = asyncio.run(test_extraction())
    exit(0 if success else 1)
