# Clippi Agent

AI-powered manifest generation using Browser Use + Gemini 3 Flash.

## Overview

The Clippi Agent automates the creation of `guide.manifest.json` files by:

1. Taking a list of tasks in natural language
2. Using an AI agent (Browser Use) to navigate your application
3. Recording the steps and generating selectors
4. Outputting a complete manifest

## Requirements

- Python 3.11+
- Google Gemini API key (or OpenAI/Anthropic)

## Installation

```bash
cd agent
pip install -r requirements.txt
playwright install chromium
```

## Usage

### Via CLI (recommended)

```bash
# From the project root
npx clippi generate --url https://myapp.com --tasks tasks.txt
```

### Directly with Python

```bash
cd agent
export GEMINI_API_KEY=your-api-key
python -m clippi_agent.cli --url https://myapp.com --tasks tasks.txt
```

## Input: Tasks File

Create a `tasks.txt` file with one task per line:

```
export data to CSV
create a new dataset
change my plan to Pro
invite a team member
configure notification settings
```

Or use JSON for more control:

```json
[
  {
    "description": "export data to CSV",
    "id": "export-csv",
    "category": "data",
    "keywords": ["download", "export", "csv"]
  },
  {
    "description": "create a new dataset",
    "category": "data"
  }
]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url, -u` | URL of the application | Required |
| `--tasks, -t` | Path to tasks file | Required |
| `--output, -o` | Output manifest path | `guide.manifest.json` |
| `--provider, -p` | LLM provider | `gemini` |
| `--model, -m` | Model name | `gemini-3-flash-preview` |
| `--no-headless` | Show browser UI | `false` |
| `--docs, -d` | Path to docs for context | - |
| `--timeout` | Operation timeout (ms) | `30000` |
| `--config, -c` | JSON config file | - |

## Configuration File

Instead of CLI arguments, you can use a JSON config:

```json
{
  "url": "https://myapp.com",
  "tasks": [
    { "description": "export data to CSV", "category": "data" },
    { "description": "create dataset", "category": "data" }
  ],
  "provider": "gemini",
  "model": "gemini-3-flash-preview",
  "headless": true,
  "output_path": "guide.manifest.json"
}
```

```bash
clippi-agent --config agent.config.json
```

## LLM Providers

### Gemini (default, recommended)

```bash
export GEMINI_API_KEY=your-key
```

Get a key at: https://aistudio.google.com/apikey

**Estimated cost:** ~$0.50-1.50 for 20 flows

### OpenAI

```bash
export OPENAI_API_KEY=your-key
clippi-agent --provider openai --model gpt-4o ...
```

### Anthropic

```bash
export ANTHROPIC_API_KEY=your-key
clippi-agent --provider anthropic --model claude-sonnet-4-20250514 ...
```

## Output

The agent generates a `guide.manifest.json` with:

- **Selectors** in priority order (testId > aria > css > text)
- **Multi-step paths** for complex flows
- **Success conditions** inferred from URL/DOM changes
- **Keywords** extracted from task descriptions

Example output:

```json
{
  "$schema": "https://clippi.net/schema/manifest.v1.json",
  "meta": {
    "app_name": "MyApp",
    "generated_at": "2026-02-02T10:30:00Z",
    "generator": "clippi-agent/gemini"
  },
  "targets": [
    {
      "id": "export-csv",
      "selector": {
        "strategies": [
          { "type": "testId", "value": "export-btn" },
          { "type": "aria", "value": "Export to CSV" }
        ]
      },
      "label": "Export Data To CSV",
      "description": "export data to CSV",
      "keywords": ["export", "data", "csv", "download"],
      "category": "data",
      "path": [
        {
          "selector": { "strategies": [{ "type": "testId", "value": "data-tab" }] },
          "instruction": "Click on \"Data\"",
          "success_condition": { "url_contains": "/data" }
        },
        {
          "selector": { "strategies": [{ "type": "testId", "value": "export-btn" }] },
          "instruction": "Click on \"Export\"",
          "final": true
        }
      ]
    }
  ]
}
```

## Tips

1. **Start with 3-5 tasks** to validate the setup works
2. **Use `--no-headless`** for debugging to see what the agent does
3. **Provide docs context** with `--docs` for complex apps
4. **Review and refine** the generated manifest manually
5. **Run `clippi validate`** after generation to check selectors

## Troubleshooting

### "GEMINI_API_KEY not set"

```bash
export GEMINI_API_KEY=your-key-here
```

### "browser-use not installed"

```bash
cd agent
pip install -r requirements.txt
playwright install chromium
```

### Agent gets stuck

- Try `--no-headless` to see what's happening
- Reduce task complexity
- Provide more context via `--docs`
- Some sites may have anti-bot measures

### Selectors not found

The agent generates best-effort selectors. After generation:
1. Run `clippi validate --url https://myapp.com` to check
2. Manually refine selectors that don't work
3. Add `data-testid` attributes to your app for stability
