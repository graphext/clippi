/**
 * Starter manifest template
 */
export const manifestTemplate = `{
  "$schema": "https://clippi.net/schema/manifest.v1.json",
  "meta": {
    "app_name": "{{appName}}",
    "version": "1.0.0",
    "generated_at": "{{timestamp}}"
  },
  "defaults": {
    "timeout_ms": 10000
  },
  "targets": [
    {
      "id": "example-button",
      "selector": {
        "strategies": [
          { "type": "testId", "value": "example-btn" },
          { "type": "aria", "value": "Example Button" },
          { "type": "css", "value": "#example-btn" }
        ]
      },
      "label": "Example Button",
      "description": "Click this button to see an example action",
      "keywords": ["example", "demo", "button"],
      "category": "general"
    }
  ]
}
`

/**
 * Starter config template
 */
export const configTemplate = `// clippi.config.js
export default {
  // Manifest file location
  manifest: './guide.manifest.json',

  // Development server options
  serve: {
    port: 3001,
    open: false,
  },

  // Validation options
  validate: {
    // URL to validate selectors against (requires playwright)
    // url: 'http://localhost:3000',
  },

  // AI Agent configuration (for clippi generate)
  agent: {
    // LLM provider: 'gemini' (default), 'openai', or 'anthropic'
    provider: 'gemini',

    // Model to use (default: gemini-2.0-flash)
    // Gemini 2.0 Flash is recommended for best cost/performance ratio
    // Estimated cost: ~$0.50-1.50 for 20 flows
    model: 'gemini-2.0-flash',

    // Run browser in headless mode (default: true)
    headless: true,

    // Timeout for browser operations in ms (default: 30000)
    timeout: 30000,
  },
}
`

/**
 * Generate manifest with placeholders replaced
 */
export function generateManifest(appName: string): string {
  return manifestTemplate
    .replace('{{appName}}', appName)
    .replace('{{timestamp}}', new Date().toISOString())
}

/**
 * Generate config file
 */
export function generateConfig(): string {
  return configTemplate
}
