# Authoring Clippi Guides

This document explains how to create effective guide manifests for Clippi. It covers the manifest structure, selector strategies, success conditions, and common pitfalls to avoid.

## Table of Contents

1. [Manifest Structure](#manifest-structure)
2. [Targets](#targets)
3. [Selector Strategies](#selector-strategies)
4. [Multi-Step Paths](#multi-step-paths)
5. [Success Conditions](#success-conditions)
6. [Common Pitfalls](#common-pitfalls)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

---

## Manifest Structure

A guide manifest is a JSON file that describes all the UI targets and flows in your application that Clippi can guide users to.

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
  "targets": [...]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `$schema` | No | JSON schema URL for validation |
| `meta.app_name` | Yes | Your application name |
| `meta.version` | Yes | Manifest version |
| `meta.generated_at` | No | ISO timestamp of generation |
| `defaults.timeout_ms` | No | Default confirmation timeout (default: 10000) |
| `targets` | Yes | Array of guidable targets |

---

## Targets

Each target represents something a user can be guided to. Targets can be simple (single-step) or complex (multi-step paths).

### Simple Target (Single-Step)

For targets that require just one action (click a button, navigate to a page):

```json
{
  "id": "nav-settings",
  "selector": {
    "strategies": [
      { "type": "testId", "value": "nav-settings" }
    ]
  },
  "label": "Settings",
  "description": "Go to Settings",
  "keywords": ["settings", "preferences", "config"],
  "category": "navigation"
}
```

When a user asks about this target, Clippi will:
1. Point the cursor to the target
2. Wait for the user to click it
3. Complete the guide

### Complex Target (Multi-Step Path)

For flows requiring multiple steps:

```json
{
  "id": "export-csv",
  "selector": {
    "strategies": [
      { "type": "testId", "value": "export-csv-btn" }
    ]
  },
  "label": "Export to CSV",
  "description": "Export your data to CSV format",
  "keywords": ["export", "download", "csv", "data"],
  "category": "data",
  "path": [
    {
      "selector": { "strategies": [{ "type": "testId", "value": "export-btn" }] },
      "instruction": "Click the Export button",
      "success_condition": { "visible": "#export-modal.open" }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "format-select" }] },
      "instruction": "Select CSV from the format dropdown",
      "success_condition": { "value": { "selector": "[data-testid='format-select']", "equals": "csv" } }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "export-confirm" }] },
      "instruction": "Click Export to download your data",
      "success_condition": { "click": true },
      "final": true
    }
  ]
}
```

### Target Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (kebab-case recommended) |
| `selector` | Yes | How to find the target's DOM element |
| `label` | Yes | Human-readable name (shown in UI) |
| `description` | Yes | What this target does |
| `keywords` | Yes | Search terms for matching user queries |
| `category` | No | Grouping for organization |
| `path` | No | Multi-step flow (if omitted, single-step with click detection) |
| `conditions` | No | Access control conditions |
| `on_blocked` | No | What to show when access is denied |

---

## Selector Strategies

Selectors tell Clippi how to find DOM elements for targets. Multiple strategies can be specified as fallbacks.

### Strategy Types (in order of preference)

#### 1. `testId` (Most Stable)

Uses `data-testid` attributes. Best for stability across UI changes.

```json
{ "type": "testId", "value": "submit-btn" }
```

Matches: `<button data-testid="submit-btn">Submit</button>`

#### 2. `aria` (Accessible & Stable)

Uses `aria-label` attributes. Good for accessible UIs.

```json
{ "type": "aria", "value": "Close dialog" }
```

Matches: `<button aria-label="Close dialog">X</button>`

#### 3. `css` (Flexible)

Standard CSS selectors. More fragile but flexible.

```json
{ "type": "css", "value": "#modal .btn-primary" }
```

#### 4. `text` (Last Resort)

Matches visible text content. Most fragile, use sparingly.

```json
{ "type": "text", "value": "Submit", "tag": "button" }
```

The optional `tag` field filters by element type.

### Fallback Strategies

Always provide multiple strategies for resilience:

```json
{
  "selector": {
    "strategies": [
      { "type": "testId", "value": "export-btn" },
      { "type": "aria", "value": "Export data" },
      { "type": "css", "value": ".toolbar .export-button" },
      { "type": "text", "value": "Export", "tag": "button" }
    ]
  }
}
```

Clippi tries strategies in order and uses the first match.

---

## Multi-Step Paths

Paths define sequences of steps to complete a flow.

### Path Step Structure

```json
{
  "selector": { "strategies": [...] },
  "instruction": "Human-readable instruction",
  "success_condition": { ... },
  "final": false
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `selector` | Yes | How to find the step's target element |
| `instruction` | Yes | What to tell the user |
| `success_condition` | No* | How to detect step completion |
| `final` | No | Mark as last step (default: false) |

*If no `success_condition` is provided, the step relies on manual confirmation timeout.

### Step Sequencing Logic

1. **Initial Step Detection**: When a flow starts, Clippi checks which steps are already complete and skips them. This allows resuming flows and handling pre-filled forms.

2. **Auto-Advancement**: When a step's `success_condition` is met, Clippi automatically advances to the next step.

3. **Confirmation Fallback**: If no condition is met within the timeout (default 10s), Clippi shows a "Did you complete this step?" confirmation.

---

## Success Conditions

Success conditions define how Clippi detects when a step is complete.

### Condition Types

#### `click` - User Clicked the Element

```json
{ "click": true }
```

Completes when the user clicks the step's target element. Use for final actions like "Click Submit".

You can also specify a different element:
```json
{ "click": "[data-testid='confirm-btn']" }
```

#### `visible` - Element Becomes Visible

```json
{ "visible": "#modal.open" }
```

Completes when the specified element is visible in the DOM. Use for detecting modals, dropdowns, or dynamic content.

#### `exists` - Element Exists in DOM

```json
{ "exists": ".success-message" }
```

Completes when the element exists (even if not visible).

#### `value` - Form Field Value

```json
{
  "value": {
    "selector": "[data-testid='email-input']",
    "equals": "user@example.com"
  }
}
```

Value condition options:
- `equals`: Exact match
- `contains`: Partial match
- `not_empty`: Any non-empty value

```json
{ "value": { "selector": "#name", "not_empty": true } }
{ "value": { "selector": "#url", "contains": "http" } }
```

#### `attribute` - Element Attribute Value

```json
{
  "attribute": {
    "selector": "[data-testid='dark-mode-toggle']",
    "name": "aria-checked",
    "value": "true"
  }
}
```

Use for checkboxes, toggles, tabs, and other stateful elements.

#### `url_contains` / `url_matches` - URL Change

```json
{ "url_contains": "/dashboard" }
{ "url_matches": "^/app/project/\\d+$" }
```

Use for navigation steps.

### Combining Conditions

Multiple conditions in the same object are AND-ed:

```json
{
  "visible": "#modal.open",
  "attribute": {
    "selector": "#terms-checkbox",
    "name": "checked",
    "value": "true"
  }
}
```

This completes when the modal is visible AND the checkbox is checked.

---

## Common Pitfalls

### 1. `value.not_empty` on `<select>` Elements

**Problem**: Select elements with options always have a value (the first option is selected by default).

```json
// BAD - Always true for selects with options!
{ "value": { "selector": "select#country", "not_empty": true } }
```

**Solution**: Use `click` for interaction detection, or `equals` for specific values:

```json
// GOOD - Detects user interaction
{ "click": true }

// GOOD - Checks for specific non-default value
{ "value": { "selector": "select#country", "equals": "es" } }
```

### 2. `attribute` Conditions with Default States

**Problem**: Tabs or toggles may have attributes set by default.

```json
// Might be already satisfied if General is the default tab
{
  "attribute": {
    "selector": "[data-testid='general-tab']",
    "name": "aria-selected",
    "value": "true"
  }
}
```

**Solution**: This is actually correct behavior - if the user is already on the right tab, Clippi skips that step. Just be aware of this when designing flows.

### 3. Missing `success_condition` on Non-Final Steps

**Problem**: Steps without conditions only complete via manual confirmation (timeout).

```json
// BAD - User has to wait for confirmation timeout
{
  "selector": { "strategies": [...] },
  "instruction": "Enter your name"
}
```

**Solution**: Add appropriate conditions:

```json
// GOOD - Auto-advances when user types
{
  "selector": { "strategies": [...] },
  "instruction": "Enter your name",
  "success_condition": { "value": { "selector": "#name", "not_empty": true } }
}
```

### 4. Selectors That Don't Exist Yet

**Problem**: Selecting elements inside modals/dropdowns that aren't in DOM yet.

The selector is resolved when the step is shown. If the modal isn't open yet, elements inside it might not be found.

**Solution**: Use `visible` condition on the previous step to ensure the container is open:

```json
[
  {
    "instruction": "Click to open modal",
    "success_condition": { "visible": "#modal.open" }
  },
  {
    "instruction": "Click the button inside",
    "selector": { "strategies": [{ "type": "css", "value": "#modal .action-btn" }] }
  }
]
```

### 5. Click Conditions on Wrong Elements

**Problem**: `{ "click": true }` listens on the step's target element. If users click elsewhere, it won't detect.

**Solution**: Either:
1. Make sure the instruction clearly indicates what to click
2. Use a specific selector: `{ "click": "#actual-button" }`

---

## Best Practices

### 1. Use Descriptive IDs

```json
// GOOD
"id": "export-data-to-csv"
"id": "create-new-project"
"id": "invite-team-member"

// BAD
"id": "btn1"
"id": "action"
"id": "modal-flow"
```

### 2. Write Clear Instructions

```json
// GOOD - Specific and actionable
"instruction": "Click the blue 'Export' button in the toolbar"
"instruction": "Select 'CSV' from the Format dropdown"
"instruction": "Enter your project name in the text field"

// BAD - Vague
"instruction": "Click the button"
"instruction": "Select an option"
"instruction": "Fill in the field"
```

### 3. Include Rich Keywords

```json
// GOOD - Multiple ways users might ask
"keywords": ["export", "download", "csv", "spreadsheet", "data", "file", "save"]

// BAD - Too few keywords
"keywords": ["export"]
```

### 4. Group by Category

```json
"category": "data"        // Data operations
"category": "navigation"  // Navigation items
"category": "settings"    // Configuration
"category": "account"     // User account
```

### 5. Test Your Flows

1. **Fresh state**: Test from a clean page load
2. **Pre-filled state**: Test when some steps are already complete
3. **Error state**: Test what happens when selectors fail
4. **Mobile**: Test on different viewport sizes

---

## Examples

### Example 1: Simple Navigation

```json
{
  "id": "nav-dashboard",
  "selector": {
    "strategies": [
      { "type": "testId", "value": "nav-dashboard" },
      { "type": "aria", "value": "Dashboard" }
    ]
  },
  "label": "Dashboard",
  "description": "Go to the main Dashboard",
  "keywords": ["dashboard", "home", "main", "overview"],
  "category": "navigation"
}
```

### Example 2: Form Submission Flow

```json
{
  "id": "submit-contact-form",
  "selector": {
    "strategies": [{ "type": "testId", "value": "contact-form" }]
  },
  "label": "Submit Contact Form",
  "description": "Fill out and submit the contact form",
  "keywords": ["contact", "form", "submit", "message", "email"],
  "category": "forms",
  "path": [
    {
      "selector": { "strategies": [{ "type": "testId", "value": "contact-name" }] },
      "instruction": "Enter your name",
      "success_condition": { "value": { "selector": "[data-testid='contact-name']", "not_empty": true } }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "contact-email" }] },
      "instruction": "Enter your email address",
      "success_condition": { "value": { "selector": "[data-testid='contact-email']", "contains": "@" } }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "contact-message" }] },
      "instruction": "Type your message",
      "success_condition": { "value": { "selector": "[data-testid='contact-message']", "not_empty": true } }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "contact-submit" }] },
      "instruction": "Click 'Send Message' to submit",
      "success_condition": { "click": true },
      "final": true
    }
  ]
}
```

### Example 3: Settings with Tabs

```json
{
  "id": "enable-dark-mode",
  "selector": {
    "strategies": [{ "type": "testId", "value": "theme-toggle" }]
  },
  "label": "Enable Dark Mode",
  "description": "Switch to dark theme",
  "keywords": ["dark", "theme", "dark mode", "night", "appearance"],
  "category": "settings",
  "path": [
    {
      "selector": { "strategies": [{ "type": "testId", "value": "nav-settings" }] },
      "instruction": "Open Settings",
      "success_condition": { "visible": "#settings-modal.open" }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "appearance-tab" }] },
      "instruction": "Click the 'Appearance' tab",
      "success_condition": {
        "attribute": {
          "selector": "[data-testid='appearance-tab']",
          "name": "aria-selected",
          "value": "true"
        }
      }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "theme-select" }] },
      "instruction": "Select 'Dark' from the theme dropdown",
      "success_condition": {
        "value": {
          "selector": "[data-testid='theme-select']",
          "equals": "dark"
        }
      }
    },
    {
      "selector": { "strategies": [{ "type": "testId", "value": "save-settings" }] },
      "instruction": "Click 'Save' to apply changes",
      "success_condition": { "click": true },
      "final": true
    }
  ]
}
```

### Example 4: Conditional Access

```json
{
  "id": "advanced-analytics",
  "selector": {
    "strategies": [{ "type": "testId", "value": "analytics-advanced" }]
  },
  "label": "Advanced Analytics",
  "description": "View advanced analytics dashboard",
  "keywords": ["analytics", "advanced", "metrics", "statistics"],
  "category": "analytics",
  "conditions": "plan:pro",
  "on_blocked": {
    "message": "Advanced Analytics requires a Pro subscription",
    "suggest": "upgrade-to-pro"
  }
}
```

---

## Checklist for New Guides

- [ ] Unique, descriptive `id`
- [ ] Multiple selector strategies (testId + fallbacks)
- [ ] Clear, actionable `instruction` text
- [ ] Appropriate `success_condition` for each step
- [ ] `final: true` on the last step
- [ ] Rich `keywords` for search matching
- [ ] Tested from fresh state
- [ ] Tested with pre-filled data
- [ ] Works on mobile viewports
