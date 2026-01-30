# Clippi Documentation

> **See also:** [Authoring Guides](./AUTHORING_GUIDES.md) - Comprehensive guide for creating manifest files

## Quick Start

### Installation

```bash
npm install @clippi/chat
# or
pnpm add @clippi/chat
# or
yarn add @clippi/chat
```

### Basic Usage (Widget)

The simplest way to add Clippi to your app:

```html
<script type="module">
  import { Clippi } from '@clippi/chat'

  await Clippi.init({
    manifest: '/guide.manifest.json',
    llm: { endpoint: '/api/clippi/chat' }
  })
</script>

<clippi-chat />
```

### Headless Usage

If you have your own chat UI but want Clippi's cursor guidance:

```typescript
import { createHeadlessClippi } from '@clippi/chat'

const { ask, guide, cancel, on, destroy } = await createHeadlessClippi({
  manifest: '/guide.manifest.json',
  llm: { endpoint: '/api/clippi/chat' },
  theme: 'auto'
})

// In your chat handler
const response = await ask('How do I export data?')
if (response.action === 'guide') {
  // Cursor automatically shows
}

// Clean up
destroy()
```

### Logic Only

If you want full control over the UI:

```typescript
import { Clippi } from '@clippi/core'

const clippi = await Clippi.init({
  manifest: '/guide.manifest.json'
})

clippi.on('beforeGuide', (step) => {
  // Show your own cursor/highlight
  myCustomCursor.pointTo(step.domElement)
})

await clippi.guide('export-csv')
```

---

## Integration Levels

| Level | Package | What you get |
|-------|---------|--------------|
| Widget | `@clippi/chat` | Complete chat widget + cursor |
| Headless | `@clippi/chat` + `createHeadlessClippi()` | Your chat UI + Clippi cursor |
| Logic only | `@clippi/core` | Manifest, conditions, sequencing |
| Full custom | `@clippi/core` + `@clippi/cursor` | All logic + individual visual components |

---

## Manifest Reference

### Full Schema

```json
{
  "$schema": "https://clippi.net/schema/manifest.v1.json",
  "meta": {
    "app_name": "MyApp",
    "version": "1.0.0",
    "generated_at": "2026-01-29T00:00:00Z"
  },
  "defaults": {
    "timeout_ms": 10000
  },
  "elements": [
    {
      "id": "export-csv",
      "selector": {
        "strategies": [
          { "type": "testId", "value": "export-csv-btn" },
          { "type": "aria", "value": "Export to CSV" },
          { "type": "css", "value": "#export-modal .btn-csv" }
        ]
      },
      "label": "Export to CSV",
      "description": "Export current data to CSV format",
      "keywords": ["export", "download", "csv"],
      "category": "data",
      "path": [...],
      "conditions": "plan:pro",
      "on_blocked": {
        "message": "CSV export requires Pro plan",
        "suggest": "upgrade-flow"
      }
    }
  ]
}
```

### Selector Strategies

Tried in order until one matches:

| Type | Example | Stability |
|------|---------|-----------|
| `testId` | `data-testid="export-btn"` | ⭐⭐⭐ Best |
| `aria` | `aria-label="Export"` | ⭐⭐⭐ Best |
| `css` | `#export-modal .btn` | ⭐⭐ Medium |
| `text` | Visible text + tag | ⭐ Fragile |

### Conditions DSL

```javascript
// Simple
"conditions": "plan:pro"

// AND
"conditions": "and:[plan:pro,permission:data:export]"

// OR
"conditions": "or:[plan:pro,plan:enterprise]"

// Nested
"conditions": "and:[or:[plan:pro,plan:enterprise],permission:admin]"
```

### Path Steps

For multi-step flows:

```json
{
  "path": [
    {
      "selector": { "strategies": [...] },
      "instruction": "Click the Export button",
      "success_condition": { "visible": "#export-modal" }
    },
    {
      "selector": { "strategies": [...] },
      "instruction": "Select CSV format",
      "final": true
    }
  ]
}
```

### Success Conditions

```json
// URL contains
{ "url_contains": "/data" }

// URL regex
{ "url_matches": "^/app/data/\\d+$" }

// Element visible
{ "visible": "#export-modal" }

// Element exists
{ "exists": ".success-toast" }

// Attribute
{ "attribute": { "selector": "#checkbox", "name": "checked", "value": "true" } }
```

---

## CLI Reference

### Initialize Project

```bash
npx clippi init
```

Creates:
- `guide.manifest.json` - Starter manifest
- `clippi.config.js` - Configuration file

### Development Server

```bash
npx clippi serve [options]
```

Options:
- `-p, --port <port>` - Port (default: 3001)
- `-m, --manifest <path>` - Manifest path
- `-o, --open` - Open browser

Features:
- Serves manifest and mock chat endpoint
- Hot reload on manifest changes
- CORS enabled

### Validate Manifest

```bash
npx clippi validate [options]
```

Options:
- `-m, --manifest <path>` - Manifest path
- `-c, --conditions` - Validate condition syntax
- `-f, --flows` - Validate flow paths
- `-u, --url <url>` - Validate selectors against URL (requires Playwright)

---

## Backend Contract

Your backend must implement:

```typescript
// POST /api/clippi/chat
interface Request {
  messages: { role: 'user' | 'assistant', content: string }[]
  context: { plan?: string, permissions?: string[], state?: object }
  manifest: { id, label, description, keywords, category }[]
}

interface Response {
  action: 'guide' | 'blocked' | 'text'
  elementId?: string      // For 'guide'
  instruction?: string    // For 'guide'
  reason?: {              // For 'blocked'
    type: 'plan' | 'permission' | 'state'
    missing?: string
    message?: string
  }
  content?: string        // For 'text'
}
```

See `examples/backend-node/` for a reference implementation.

---

## Theming

### CSS Custom Properties

```css
:root {
  --clippi-primary: #6366f1;
  --clippi-primary-foreground: #ffffff;
  --clippi-background: #ffffff;
  --clippi-foreground: #1f2937;
  --clippi-muted: #f3f4f6;
  --clippi-muted-foreground: #6b7280;
  --clippi-border: #e5e7eb;
  --clippi-radius: 8px;
  --clippi-font: system-ui, sans-serif;
}
```

### Theme Presets

```typescript
Clippi.init({
  theme: 'light' | 'dark' | 'auto'
})
```

### Custom Theme

```typescript
Clippi.init({
  theme: {
    primary: '#10b981',
    background: '#0f172a',
    // ... other properties
  }
})
```

---

## Event Hooks

```typescript
const clippi = await Clippi.init({ ... })

clippi.on('beforeGuide', (step) => {
  console.log('Guiding to', step.element.label)
})

clippi.on('stepCompleted', (step) => {
  analytics.track('step_completed', { elementId: step.element.id })
})

clippi.on('flowCompleted', (flow, duration) => {
  analytics.track('flow_completed', { flowId: flow.elementId, duration })
})

clippi.on('blocked', (element, result) => {
  if (result.reason === 'plan') {
    showUpsellModal()
  }
})

clippi.on('fallback', (type, query) => {
  // type: 'vision' | 'docs'
  // Track manifest coverage gaps
})
```

---

## Testing

### Mock Clippi

```typescript
import { createMockClippi } from '@clippi/core/testing'

const clippi = createMockClippi({
  manifest: mockManifest,
  responses: {
    'export data': { action: 'guide', elementId: 'export-csv' }
  }
})

await clippi.ask('How do I export data?')
expect(clippi.getCurrentFlow()?.elementId).toBe('export-csv')
```

### Manifest Validation

```bash
# Validate structure
npx clippi validate

# Validate conditions syntax
npx clippi validate --conditions

# Validate flow paths
npx clippi validate --flows
```
