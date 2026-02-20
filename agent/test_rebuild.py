import asyncio
import os
import sys
import json

# Adjust path to find clippi_agent
sys.path.insert(0, os.path.abspath('.'))

from clippi_agent.agent import rebuild_manifest_from_actions
from clippi_agent.schemas import AgentConfig

async def test():
    config = AgentConfig(
        url="http://localhost:3000",
        tasks=[],
        output_path="test_rebuild.manifest.json"
    )
    
    dummy_actions = [
        {
            "task": {"description": "test task"},
            "actions": [
                {
                    "action_type": "click",
                    "element_tag": "button",
                    "element_text": "Click Me",
                    "element_attributes": {"id": "btn"},
                    "url_before": "http://localhost:3000",
                    "url_after": "http://localhost:3000",
                    "timestamp": 12345.0
                }
            ],
            "success": True,
            "error": None
        }
    ]
    with open("test.actions.json", "w") as f:
        json.dump(dummy_actions, f)

    await rebuild_manifest_from_actions(config, "test.actions.json")

if __name__ == "__main__":
    asyncio.run(test())
