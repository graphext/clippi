"""Test action extraction with mock Browser Use v0.11.9 history."""
import asyncio
from unittest.mock import Mock
from clippi_agent.agent import ClippiAgent
from clippi_agent.schemas import AgentConfig, AgentTask


def create_mock_history():
    """Create mock history matching Browser Use v0.11.9."""
    # Mock action (in a list!)
    mock_action = Mock(spec=["__class__"])  # Only has __class__, no text/value attributes
    mock_action.__class__.__name__ = "ClickElement"

    # Mock element (in a list!)
    mock_element = Mock()
    mock_element.node_name = "button"
    mock_element.node_value = "Export to CSV"
    mock_element.attributes = {"data-testid": "export-btn"}
    mock_element.ax_name = None

    # Mock step
    step = Mock()
    step.model_output = Mock()
    step.model_output.action = [mock_action]  # List!
    step.state = Mock()
    step.state.url = "http://localhost:3000"
    step.state.interacted_element = [mock_element]  # List!
    step.result = []

    # Mock history
    history = Mock()
    history.history = [step]

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

    if actions:
        a = actions[0]
        print(f"   Type: {a.action_type}")
        print(f"   Element: {a.element_tag}")
        print(f"   Text: {a.element_text}")
        print(f"   Attributes: {a.element_attributes}")

        assert a.action_type == "click", f"Expected 'click', got '{a.action_type}'"
        assert a.element_tag == "button", f"Expected 'button', got '{a.element_tag}'"
        assert a.element_text == "Export to CSV", f"Expected 'Export to CSV', got '{a.element_text}'"
        assert a.element_attributes.get("data-testid") == "export-btn", f"Expected data-testid='export-btn', got {a.element_attributes}"

        print("\n✅ All assertions passed!")
        return True
    else:
        print("\n❌ FAILED: No actions extracted")
        return False


if __name__ == "__main__":
    success = asyncio.run(test_extraction())
    exit(0 if success else 1)
