# Agent Demo Example

This example demonstrates how to use the Clippi Agent to automatically generate a `guide.manifest.json` for the demo-app.

## What This Example Shows

- How to use the agent to analyze an application and generate guidance manifests
- How to define tasks inline in the config
- How to configure the agent for optimal results

## Prerequisites

1. **Set up the Clippi Agent**
   ```bash
   cd ../../agent
   uv sync
   uv run playwright install chromium
   ```

2. **Get a Gemini API key**
   - Visit https://aistudio.google.com/apikey
   - Create a new API key
   - Set it via a `.env` file (recommended). The agent loads `.env` from the current working directory:
     ```bash
     # If running with uv from agent/
     # agent/.env
     GEMINI_API_KEY=your-api-key-here

     # If installed globally and running from examples/agent-demo/
     # examples/agent-demo/.env
     GEMINI_API_KEY=your-api-key-here
     ```
   - Or export it in your shell:
     ```bash
     export GEMINI_API_KEY=your-api-key-here
     ```

3. **Start the demo-app**
   ```bash
   cd ../demo-app
   npm start
   # The app will be available at http://localhost:3000
   ```

## Running the Agent

### Option 1: Using the Config File (Recommended)

The easiest way is to use the provided `agent.config.json`:

```bash
# From the project root
cd agent
uv run clippi-agent --config ../examples/agent-demo/agent.config.json

# The manifest will be generated in examples/agent-demo/guide.manifest.json
```

Or if you installed the agent with pip:

```bash
cd examples/agent-demo
clippi-agent --config agent.config.json
```

This will:
- Navigate to http://localhost:3000 (the demo-app)
- Run each task defined in the config
- Generate `guide.manifest.json` with selectors and paths

## Files in This Example

### `agent.config.json`
Complete configuration file with tasks inline, pre-configured for the demo-app.

## Understanding the Output

After running the agent, you'll get a `guide.manifest.json` file containing:

```json
{
  "$schema": "https://clippi.net/schema/manifest.v1.json",
  "meta": {
    "app_name": "Demo App",
    "generated_at": "2026-02-19T...",
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
      "path": [...]
    }
  ]
}
```

## Next Steps

1. **Validate the manifest**
   ```bash
   # Note: The Node.js CLI isn't implemented yet
   # For now, manually verify selectors work in the demo-app
   ```

2. **Test in the demo-app**
   - Copy `guide.manifest.json` to `../demo-app/`
   - Refresh the demo-app
   - Try asking questions that match your tasks

3. **Refine the manifest**
   - Review generated selectors
   - Add conditions for feature flags or permissions
   - Adjust keywords for better matching

## Tips

- Start with 3-5 tasks to validate everything works
- Use `--no-headless` to watch the agent in action
- Review and manually refine the generated manifest
- Add `data-testid` attributes to your app for more stable selectors

## Troubleshooting

### Agent gets stuck
Try running with `--no-headless` to see what's happening:
```bash
cd agent
uv run clippi-agent --config ../examples/agent-demo/agent.config.json --no-headless
```

### Selectors not found
1. Manually test selectors in the demo-app
2. Update selectors in the manifest as needed
3. Consider adding `data-testid` attributes to your demo-app

### Demo-app not running
Make sure the demo-app is running on port 3000:
```bash
cd ../demo-app
npm start
```

If it's running on a different port, update the `url` in `agent.config.json`.
