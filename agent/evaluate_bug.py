import os
import sys

# Set up the path so we can import clippi_agent
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from clippi_agent.cli import parse_config_file
from clippi_agent.agent import ClippiAgent
import traceback
import asyncio
import json

async def test():
    try:
        config = parse_config_file("../examples/agent-demo/agent.config.json")
        agent = ClippiAgent(config)
        targets, completed_ids = agent._load_partial_manifest()
        
        print(f"Loaded {len(targets)} targets from partial")
        
        # Manually trigger the end logic of generate_manifest
        total = len(config.tasks)
        skipped = len(completed_ids)
        
        print(f"✨ Generated manifest with {len(targets)} targets", end="")
        if skipped:
            print(f" ({skipped} resumed)")
        else:
            print()

        if len(targets) == 0:
            print(f"\n⚠️  WARNING: No targets were generated!")
        elif len(targets) < total - skipped:
            failed = total - skipped - len(targets)
            print(f"\n⚠️  Partial success: {failed}/{total - skipped} task{'s' if failed != 1 else ''} failed")

        manifest = agent._build_manifest(targets)
        
        # Simulate run_agent dump
        manifest_dict = manifest.model_dump(by_alias=True, exclude_none=True)
        # Try to json dump it
        json.dumps(manifest_dict)
        print("Success! No crash.")
        
    except Exception as e:
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
