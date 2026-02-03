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

from .agent import run_agent
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
    content = Path(path).read_text()
    data = json.loads(content)

    # Convert tasks if they're strings
    if "tasks" in data:
        tasks = []
        for item in data["tasks"]:
            if isinstance(item, str):
                tasks.append(AgentTask(description=item))
            elif isinstance(item, dict):
                tasks.append(AgentTask(**item))
        data["tasks"] = tasks

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

Tasks file format (tasks.json):
  [
    {"description": "export data to CSV", "category": "data"},
    {"description": "create dataset", "keywords": ["new", "import"]}
  ]

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
        # Allow CLI overrides
        if args.url:
            config.url = args.url
        if args.output:
            config.output_path = args.output
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
        )

    # Check for API key
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
        asyncio.run(run_agent(config))
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
