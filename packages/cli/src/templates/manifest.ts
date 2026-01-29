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
  "elements": [
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
