"""
CLI for Clippi Agent.

Usage:
    clippi-agent --url https://myapp.com --tasks tasks.txt
    clippi-agent --config agent.config.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from .agent import rebuild_manifest_from_actions, run_agent
from .schemas import AgentConfig, AgentTask


def parse_tasks_file(path: str) -> list[AgentTask]:
    """Parse a tasks file (one task per line, or JSON)."""
    content = Path(path).read_text().strip()

    # Try JSON first
    try:
        data = json.loads(content)
        if isinstance(data, list):
            tasks = []
            for item in data:
                if isinstance(item, str):
                    tasks.append(AgentTask(description=item))
                elif isinstance(item, dict):
                    tasks.append(AgentTask(**item))
            return tasks
    except json.JSONDecodeError:
        pass

    # Treat as plain text (one task per line)
    lines = [line.strip() for line in content.split("\n") if line.strip()]
    return [AgentTask(description=line) for line in lines]


def parse_config_file(path: str) -> AgentConfig:
    """Parse a JSON config file."""
    config_path = Path(path)
    config_dir = config_path.parent
    content = config_path.read_text()
    data = json.loads(content)

    # Handle tasks: either inline array or file path
    if "tasks" in data:
        tasks_value = data["tasks"]

        # If tasks is a string, treat it as a file path relative to config
        if isinstance(tasks_value, str):
            tasks_file = config_dir / tasks_value
            tasks = parse_tasks_file(str(tasks_file))
        # If tasks is an array, parse each item
        elif isinstance(tasks_value, list):
            tasks = []
            for item in tasks_value:
                if isinstance(item, str):
                    tasks.append(AgentTask(description=item))
                elif isinstance(item, dict):
                    tasks.append(AgentTask(**item))
        else:
            raise ValueError(f"tasks must be a string (file path) or array, got {type(tasks_value)}")

        data["tasks"] = tasks

    # Resolve output_path relative to config file if it's a relative path
    if "output_path" in data:
        output_path = Path(data["output_path"])
        if not output_path.is_absolute():
            data["output_path"] = str(config_dir / output_path)

    return AgentConfig(**data)


def main():
    """Main CLI entry point."""
    # Load .env file if present
    load_dotenv()

    parser = argparse.ArgumentParser(
        prog="clippi-agent",
        description="Generate Clippi manifests using AI agent + Browser Use",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate from a tasks file
  clippi-agent --url https://myapp.com --tasks tasks.txt

  # Generate from a JSON config
  clippi-agent --config agent.config.json

  # With options
  clippi-agent --url https://myapp.com --tasks tasks.txt --output manifest.json --headless

Tasks file format (tasks.txt):
  export data to CSV
  create a new dataset
  change my plan to Pro

Inline tasks in config (agent.config.json):
  {
    "url": "https://myapp.com",
    "tasks": ["export data to CSV", "create dataset"]
  }

Environment variables:
  GEMINI_API_KEY     Google Gemini API key (required for default provider)
  OPENAI_API_KEY     OpenAI API key (if using --provider openai)
  ANTHROPIC_API_KEY  Anthropic API key (if using --provider anthropic)
""",
    )

    # Config file option (alternative to CLI args)
    parser.add_argument(
        "--config",
        "-c",
        type=str,
        help="Path to JSON config file (alternative to CLI args)",
    )

    # Required arguments (unless using --config)
    parser.add_argument(
        "--url",
        "-u",
        type=str,
        help="URL of the application to explore",
    )
    parser.add_argument(
        "--tasks",
        "-t",
        type=str,
        help="Path to tasks file (one task per line, or JSON array)",
    )
    
    # Fast path argument
    parser.add_argument(
        "--rebuild-from-actions",
        type=str,
        help="Path to an existing .actions.json file to rebuild the manifest from, bypassing the LLM",
    )

    # Optional arguments
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default="guide.manifest.json",
        help="Output path for manifest (default: guide.manifest.json)",
    )
    parser.add_argument(
        "--provider",
        "-p",
        type=str,
        choices=["gemini", "openai", "anthropic"],
        default="gemini",
        help="LLM provider (default: gemini)",
    )
    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default="gemini-3-flash-preview",
        help="Model name (default: gemini-3-flash-preview)",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=True,
        help="Run browser in headless mode (default: true)",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Run browser with visible UI (for debugging)",
    )
    parser.add_argument(
        "--docs",
        "-d",
        type=str,
        help="Path to documentation file to provide context",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30000,
        help="Timeout for operations in ms (default: 30000)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args()

    # Build config
    if args.config:
        config = parse_config_file(args.config)
        # CLI flags override config file values
        if args.url:
            config.url = args.url
        if args.no_headless:
            config.headless = False
        if args.output != "guide.manifest.json":
            config.output_path = args.output
        if args.provider != "gemini":
            config.provider = args.provider
        if args.model != "gemini-3-flash-preview":
            config.model = args.model
        if args.timeout != 30000:
            config.timeout_ms = args.timeout
        if args.docs:
            config.docs_context = Path(args.docs).read_text()
        # Always override verbose flag from CLI
        config.verbose = args.verbose
    else:
        # Require url and tasks
        if not args.url:
            parser.error("--url is required (or use --config)")
        if not args.tasks:
            parser.error("--tasks is required (or use --config)")

        tasks = parse_tasks_file(args.tasks)

        # Read docs context if provided
        docs_context = None
        if args.docs:
            docs_context = Path(args.docs).read_text()

        config = AgentConfig(
            url=args.url,
            tasks=tasks,
            provider=args.provider,
            model=args.model,
            headless=not args.no_headless,
            timeout_ms=args.timeout,
            output_path=args.output,
            docs_context=docs_context,
            verbose=args.verbose,
        )

    # Check for API key (not needed for rebuild)
    if not args.rebuild_from_actions:
        api_key_var = {
            "gemini": "GEMINI_API_KEY",
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
        }[config.provider]

        if not os.environ.get(api_key_var):
            print(f"❌ Error: {api_key_var} environment variable is required")
            print(f"\nSet it with: export {api_key_var}=your-api-key")
            if config.provider == "gemini":
                print("Get a key at: https://aistudio.google.com/apikey")
            sys.exit(1)

    # Print config summary
    print("🤖 Clippi Agent")
    print("=" * 50)
    print(f"URL:      {config.url}")
    print(f"Tasks:    {len(config.tasks)}")
    print(f"Provider: {config.provider}")
    print(f"Model:    {config.model}")
    print(f"Headless: {config.headless}")
    print(f"Output:   {config.output_path}")
    print("=" * 50)

    # Run the agent
    try:
        if args.rebuild_from_actions:
            asyncio.run(rebuild_manifest_from_actions(config, args.rebuild_from_actions))
        else:
            asyncio.run(run_agent(config))
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        print("\n" + "=" * 60)
        print("Full traceback:")
        print("=" * 60)
        traceback.print_exc()
        print("\n" + "=" * 60)
        print("Diagnostics:")
        print("=" * 60)
        print(f"  Python: {sys.version}")
        print(f"  Working directory: {os.getcwd()}")
        try:
            import browser_use
            print(f"  Browser Use version: {browser_use.__version__}")
        except Exception:
            print(f"  Browser Use: (could not determine version)")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    main()
