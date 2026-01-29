# Clippi - Design Document v1

> **Date:** January 2026  
> **Status:** Design complete, pending implementation  
> **Domain:** clippi.net (available)

---

## 1. Product Vision

### 1.1 The Problem

Modern SaaS applications add chatbots that are essentially documentation RAGs. When a user asks "how do I export this to CSV?", the bot responds with text: *"Go to Settings > Integrations > Export"*. The user then has to hunt for where that is in the UI.

### 1.2 The Solution

**Clippi** is an open source library that combines conversational chat with **visual cursor guidance**. Instead of responding with text, it shows a ghost cursor (Figma multiplayer style) that guides the user through the interface.

### 1.3 Key Differentiator

**No competitor combines all three capabilities:**
1. Automatic manifest generation via AI agent
2. Visual cursor guidance
3. Conversational interface

### 1.4 Name and Branding

**Clippi** - An ironic reference to Microsoft Clippy.
- Tagline: *"It looks like you want to export data. Let me show you."*
- The Clippy that actually helps.

---

## 2. Architecture

### 2.1 Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        SETUP (one-time)                      │
├─────────────────────────────────────────────────────────────┤
│  Docs/videos as context                                     │
│        ↓                                                    │
│  AI Agent + Browser Use (generates automatically)           │
│        ↓                                                    │
│  Chrome Extension (manual recording for edge cases)         │
│        ↓                                                    │
│  guide.manifest.json                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      RUNTIME (production)                    │
├─────────────────────────────────────────────────────────────┤
│  User asks                                                  │
│        ↓                                                    │
│  1. Manifest match → cursor guides visually                 │
│        ↓ (no match)                                         │
│  2. Vision fallback (screenshot + LLM) → cursor guides      │
│        ↓ (not actionable / conceptual)                      │
│  3. Docs RAG → text response                                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Decision: Guide Only, Don't Execute

**Decision:** v1 only guides the user, doesn't execute actions.

**Reason:** Eliminates all the complexity of:
- Permissions and authorizations
- Action rollback
- Confirmations
- Unexpected side effects

**Future:** v2 could add optional execution with explicit confirmation.

---

## 3. Manifest

### 3.1 Files

```
/public
  guide.manifest.json     # Full schema (selectors, paths, conditions)
  guide.context.json      # Reduced version for LLM (auto-generated)
```

### 3.2 Full Schema (`guide.manifest.json`)

```javascript
{
  "$schema": "https://clippi.net/schema/manifest.v1.json",
  
  "meta": {
    "app_name": "MyApp",
    "generated_at": "2026-01-28T12:00:00Z",
    "generator": "clippi-agent/1.0"
  },
  
  "defaults": {
    "timeout_ms": 10000  // Global for all paths
  },
  
  "elements": [
    {
      "id": "export-csv",
      
      // Selectors with fallback strategy (priority order)
      "selector": {
        "strategies": [
          { "type": "testId", "value": "export-csv-btn" },
          { "type": "aria", "value": "Export to CSV" },
          { "type": "css", "value": "#export-modal .btn-csv" },
          { "type": "text", "value": "Export CSV", "tag": "button" }
        ]
      },
      
      "label": "Export to CSV",
      "description": "Export current data to CSV format",
      "keywords": ["export", "download", "csv", "descargar"],
      "category": "data",
      
      "path": [
        {
          "selector": {
            "strategies": [
              { "type": "testId", "value": "nav-data" },
              { "type": "css", "value": "[data-nav='data']" }
            ]
          },
          "instruction": "Go to the Data section",
          "success_condition": { "url_contains": "/data" }
        },
        {
          "selector": {
            "strategies": [
              { "type": "testId", "value": "export-btn" },
              { "type": "css", "value": "#export-btn" }
            ]
          },
          "instruction": "Click Export",
          "success_condition": { "visible": "#export-modal" }
        },
        {
          "selector": {
            "strategies": [
              { "type": "testId", "value": "format-csv" },
              { "type": "css", "value": "#export-modal [data-format='csv']" }
            ]
          },
          "instruction": "Select CSV format",
          "final": true
        }
      ],
      
      // Conditions as JS function → boolean
      // Allows AND, OR, arbitrary nesting
      "conditions": "({ plan, permissions, state }) => (plan === 'pro' || plan === 'enterprise') && permissions.includes('data:export') && state.has_data",
      
      "on_blocked": {
        "message": "CSV export requires Pro plan and export permissions",
        "suggest": "upgrade-flow"
      }
    }
  ]
}
```

### 3.3 LLM Context (`guide.context.json`)

Reduced version sent to the model. **Auto-generated** by CLI from the manifest.

```javascript
{
  "elements": [
    {
      "id": "export-csv",
      "label": "Export to CSV",
      "description": "Export current data to CSV format",
      "keywords": ["export", "download", "csv", "descargar"],
      "category": "data"
    },
    {
      "id": "create-dataset",
      "label": "Create Dataset",
      "description": "Create a new dataset from scratch or import",
      "keywords": ["create", "new", "dataset", "import"],
      "category": "data"
    },
    {
      "id": "upgrade-flow",
      "label": "Upgrade Plan",
      "description": "Upgrade to Pro or Enterprise plan",
      "keywords": ["upgrade", "pro", "enterprise", "plan", "pricing"],
      "category": "account"
    }
  ]
}
```

**The model only sees:** id, label, description, keywords, category.  
**The model does NOT see:** selectors, paths, conditions, success_condition.

### 3.4 Selector Strategies

| Type | Example | Stability |
|------|---------|-----------|
| `testId` | `data-testid="export-btn"` | ⭐⭐⭐ Very stable |
| `aria` | `aria-label="Export to CSV"` | ⭐⭐⭐ Very stable |
| `css` | `#export-modal .btn-csv` | ⭐⭐ Medium |
| `text` | Visible text + tag | ⭐ Fragile |

The runtime tries them in order until one matches.

### 3.5 Conditions as Functions

```javascript
// Simple AND
"({ plan }) => plan === 'pro'"

// OR
"({ plan, permissions }) => plan === 'enterprise' || permissions.includes('admin')"

// Complex nesting
"({ plan, state, permissions }) => 
  (plan !== 'free' && state.has_data) || permissions.includes('superadmin')"

// With feature flags
"({ flags }) => flags.new_export_v2 === true"
```

**Runtime evaluation:**
```javascript
const conditionFn = new Function('ctx', `return (${element.conditions})(ctx)`)
const canAccess = conditionFn(await getContext())
```

**Security consideration:** `new Function()` evaluates arbitrary code. Manifests must be:
- Served from same-origin or trusted CDN with SRI (Subresource Integrity)
- Never derived from user input
- Validated at build time with `clippi validate`

**Safe DSL alternative (recommended for v0.1):**

For common cases, use the declarative DSL instead of JS functions:

```javascript
// Instead of: "({ plan }) => plan === 'pro'"
"conditions": "plan:pro"

// Instead of: "({ permissions }) => permissions.includes('data:export')"
"conditions": "permission:data:export"

// Instead of: "({ state }) => state.has_data"
"conditions": "state:has_data"

// Logical AND
"conditions": "and:[plan:pro,permission:admin]"

// Logical OR
"conditions": "or:[plan:pro,plan:enterprise]"

// Nested
"conditions": "and:[or:[plan:pro,plan:enterprise],permission:data:export]"
```

The DSL covers ~90% of use cases safely. Full JS functions remain available for complex logic but are marked as "advanced" in documentation.

### 3.6 Initial Step Detection

Before starting a path, we check which steps have already been completed:

```javascript
async function findStartStep(path) {
  // Search from end to beginning
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i]
    if (step.success_condition && await checkCondition(step.success_condition)) {
      return i + 1  // Start at next step
    }
  }
  return 0  // Start from the beginning
}
```

If the user already has the modal open → starts at step 3.

### 3.7 Success Conditions

```javascript
// URL
{ "url_contains": "/data" }
{ "url_matches": "^/app/data/\\d+$" }

// Element visible
{ "visible": "#export-modal" }
{ "visible": { "strategies": [...] } }

// Element exists in DOM
{ "exists": "#success-toast" }

// Multiple (implicit AND)
{ "url_contains": "/data", "visible": "#data-table" }
```

### 3.8 CLI: Generate Context

```bash
npx clippi build
# → Reads guide.manifest.json
# → Generates guide.context.json (reduced version)
# → Validates selectors
```

### 3.9 Manifest Maintenance

**Version tracking:**
```json
{
  "meta": {
    "version": "2024-01-28-001",
    "app_version": "2.3.0",
    "generated_at": "2024-01-28T12:00:00Z"
  }
}
```

**Staleness detection (v1.0):**
- `clippi validate` in CI catches broken selectors on every deploy
- Runtime: log selector failures to analytics
- Dashboard shows "selector health" over time

**Partial regeneration (v1.0):**
```bash
npx clippi generate --element export-csv  # Regenerates single flow
npx clippi generate --category data       # Regenerates category
```
Preserves manual edits in other flows.

**Recommended workflow:**
1. Run `clippi validate` in CI on every deploy
2. Review selector failure logs weekly
3. Regenerate broken flows with `clippi generate --element <id>`

---

## 4. Runtime: Core Modules

The Clippi runtime is what runs in production inside the end user's browser. Its job is to receive a user intent (via chat or API), determine which UI element corresponds to it, verify the user can access it, and visually guide step by step until completing the task.

The design prioritizes three things: **performance** (most operations are local, no network calls), **resilience** (works even if the DOM changes or user deviates), and **compatibility** (works in all modern browsers, including Mobile Safari).

### 4.1 Actionability Checks

Before pointing to an element with the cursor, we need to verify that the element is actually interactable. There's no point pointing to a button that's behind a modal, disabled, or off-screen.

This concept comes directly from Playwright, Microsoft's testing framework. They solved exactly this problem: how do you know if an element is ready to receive a click? Their solution is a set of checks that we apply in sequence.

**The checks are:**

1. **Attached:** The element exists in the DOM (wasn't dynamically removed)
2. **Visible:** Doesn't have `display: none`, `visibility: hidden`, or `opacity: 0`
3. **Has size:** Has real dimensions (width and height > 0)
4. **Enabled:** Doesn't have the `disabled` attribute
5. **In viewport:** At least partially visible on current screen
6. **Not covered:** No other element (modal, overlay, tooltip) is covering it

The "covered" check is the most subtle. We use `document.elementFromPoint()` to ask the browser "what element is at these coordinates?" If the answer isn't our target element, something is covering it.

```javascript
function isActionable(el) {
  if (!el?.isConnected) return { ok: false, reason: 'not_attached' }
  if (getComputedStyle(el).display === 'none') return { ok: false, reason: 'hidden' }
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return { ok: false, reason: 'no_size' }
  if (el.disabled) return { ok: false, reason: 'disabled' }
  const inViewport = rect.top < window.innerHeight && rect.bottom > 0
  if (!inViewport) return { ok: false, reason: 'out_of_viewport' }
  const center = { x: rect.x + rect.width/2, y: rect.y + rect.height/2 }
  const topEl = document.elementFromPoint(center.x, center.y)
  if (!el.contains(topEl) && topEl !== el) return { ok: false, reason: 'covered' }
  return { ok: true, rect, center }
}
```

When an element isn't actionable, Clippi can make intelligent decisions: if it's out of viewport, scroll first; if it's covered by a modal, inform the user they need to close it first.

### 4.2 Step Sequencer

Many tasks aren't a single click, but a sequence: open menu → select option → configure modal → confirm. The Step Sequencer orchestrates these multi-step flows.

**The problem it solves:** The user asks "how do I export to CSV?" The answer isn't a single element, but a 4-step path. The sequencer must:

1. Show the current step
2. Detect when the user completed it
3. Advance to the next step
4. Handle cases where the user deviates or abandons

**Advance detection:** We use `MutationObserver` to detect DOM changes. Each step defines a `success_condition` (for example, "the export modal is visible"). When the observer detects it's satisfied, it automatically advances to the next step.

```javascript
// Each step has:
{
  selector: "...",
  action: "click" | "target",
  success_condition: { "visible": "#export-modal" },
  instruction: "Click on Export"
}
```

**Deviation handling:** Users don't always follow the expected path. They might click elsewhere, navigate to another page, or simply get distracted. The sequencer detects these deviations by comparing the current DOM state with the expected state. When it detects a deviation, it pauses the flow and offers options: "Continue where you left off?" or "Cancel".

**MutationObserver** is the key piece here. It's a native browser API that notifies when the DOM changes. We configure it to observe `document.body` with `{ childList: true, subtree: true }`, which gives us visibility of any element that appears or disappears.

**Known limitations:**

| Scenario | Detection Issue | Workaround |
|----------|-----------------|------------|
| SPA virtual DOM | May miss if no real DOM change | Use `success_condition.url_contains` |
| Canvas/WebGL | Elements not in DOM | Manual confirmation fallback |
| CSS-only state (`:checked`) | Attribute change not detected | Use `success_condition.attribute` |
| Async race condition | Observer attached after change | Check condition immediately on step start |

**Additional detection strategies:**
- URL polling (500ms interval) for route changes in SPAs
- `success_condition.attribute` for form state changes
- Custom events: app can call `Clippi.confirmStep()` programmatically for complex cases

### 4.3 Conditions Checker

Not all users can do everything. A user on the free plan can't export to CSV. A user without admin permissions can't delete data. The Conditions Checker verifies these restrictions before guiding.

**Why it matters:** If we guide a user toward a button they can't use, the experience is frustrating. Worse, it could reveal features they shouldn't see. The Conditions Checker prevents this by verifying the user's context against conditions defined in the manifest.

**Types of conditions:**

1. **Plan:** Does the user have the required plan? (free, pro, enterprise)
2. **Permissions:** Do they have the necessary permissions? (data:export, admin:delete)
3. **Business state:** Are prerequisites met? (has_dataset, has_payment_method)
4. **Feature flags:** Is this feature enabled for this user?

```javascript
const context = await getContext() // From SaaS host

// Plan
if (element.conditions.plan && !element.conditions.plan.includes(context.plan)) {
  return { blocked: true, reason: 'plan', message: element.conditions.plan.message }
}

// Permissions
if (element.conditions.permissions) {
  const missing = element.conditions.permissions.filter(p => !context.permissions.includes(p))
  if (missing.length) return { blocked: true, reason: 'permissions', missing }
}

// Business state
if (element.conditions.requires_state) {
  for (const state of element.conditions.requires_state) {
    if (!context.state[state]) return { blocked: true, reason: 'state', missing: state }
  }
}
```

**When access is blocked:** Instead of simply saying "you can't do that", Clippi offers alternatives. If the Pro plan is missing, it can guide toward the upgrade flow. If a prerequisite is missing (like having data), it can guide toward how to create data first.

### 4.4 Session Persistence

Multi-step flows can be interrupted. The user might refresh the page, navigate to another section, or simply close the browser. Session Persistence saves flow state so it can be resumed.

**The technical decision:** We use `sessionStorage`, not `beforeunload`.

The `beforeunload` event seems like the obvious choice for saving state before the user leaves. But it has a critical problem: **it doesn't work on Mobile Safari**. Apple disabled it for performance and battery reasons. Since we want to support all browsers, we discarded this option.

Instead, we persist state **continuously** after each completed step. It's a bit more writing to storage, but guarantees we never lose more than one step of progress.

```javascript
// After each step
sessionStorage.setItem('clippi_session', JSON.stringify({
  flowId: 'export-csv',
  currentStep: 2,
  startedAt: timestamp
}))
```

**Why sessionStorage and not localStorage:** `sessionStorage` clears when the user closes the tab, which is the desired behavior. We don't want an abandoned flow from a week ago appearing next time the user visits the app. `localStorage` would persist indefinitely.

**Recovery:** When Clippi initializes, it checks if there's a saved session. If there is and it's not too old (configurable, default 30 minutes), it offers to resume: "You were exporting to CSV. Continue where you left off?"

**Configuration:**
```javascript
Clippi.init({
  persistence: {
    storage: 'session',       // 'session' | 'local' | 'none'
    ttl: 30 * 60 * 1000,      // 30 minutes (only for localStorage)
    crossTab: false           // Future: BroadcastChannel sync
  }
})
```

`localStorage` mode is useful for long flows where user might accidentally close the tab. The TTL prevents stale flows from appearing weeks later.

### 4.5 User Controls

The tooltip that accompanies the cursor needs minimal controls. After several iterations, we decided on a very simple design: just progress indicator and close button.

**Decision:** No manual navigation buttons (Back/Next).

**Why we discarded Back/Next:**

- **"Next"** would imply that Clippi executes the click for the user. This contradicts v1's fundamental principle: only guide, never execute. Also, executing actions opens a Pandora's box of edge cases (what if the click fails? what if there's a captcha?).

- **"Back"** would imply undoing the previous action. But Clippi didn't execute that action, the user did. We can't "undo" a click that someone else made. We'd have to implement a rollback system that understands application state, which is out of scope for v1.

**The final flow:**

1. The cursor points to the element, the tooltip shows the instruction
2. The user clicks (or performs the indicated action)
3. MutationObserver detects the change and advances automatically
4. If it doesn't detect advancement in 10 seconds, shows a manual confirmation fallback

```
┌─────────────────────────────────────────────┐
│  Click on "Export"                  [2/4] ✕ │
└─────────────────────────────────────────────┘

(if no advancement in 10s)

┌─────────────────────────────────────────────┐
│  Click on "Export"                  [2/4] ✕ │
│                       Did you do it? [Yes]  │
└─────────────────────────────────────────────┘
```

**The "Yes" button** doesn't execute anything. It only confirms that the user completed the step manually. This is useful when MutationObserver doesn't detect the change (for example, if the target element doesn't change visually but the action did occur).

**The [2/4] indicator** shows progress: step 2 of 4. This gives the user context of how much is left and reduces anxiety in long flows.

**The ✕ button** cancels the entire flow. It must always be available; we never trap the user in a flow they can't abandon.

### 4.6 Error Handling

**Error taxonomy:**

| Error | Surfaced to | Action |
|-------|-------------|--------|
| Selector not found | Developer (console) | Log warning, skip step |
| Element not actionable | User (tooltip) | Show reason, offer retry |
| Condition blocked | User (chat) | Show message, suggest alternative |
| Backend unreachable | User (chat) | "I'm having trouble, try again" |
| Manifest load failed | Developer (console) | Error with instructions |

**Debug mode:**
```javascript
Clippi.init({ debug: true })
// Logs: selector resolution, actionability checks, condition evaluation, step transitions
```

**Production logging:**
- Errors sent to `onError` hook for integration with your error tracking
- No PII in error payloads
- Structured format for log aggregation

```javascript
Clippi.on('error', (error) => {
  Sentry.captureException(error)
})
```

### 4.7 Vision Fallback (v1.0)

**Primary purpose:** Manifest development tool. Identifies gaps in manifest coverage.

**Configuration:**
```javascript
Clippi.init({
  vision: {
    enabled: false,           // Default: disabled
    mode: 'development',      // 'development' | 'production'
    maxPerSession: 5,         // Rate limit per user session
    logToAnalytics: true      // Track for manifest improvement
  }
})
```

**Development mode:**
- Enabled by default when `NODE_ENV !== 'production'`
- Logs all vision queries for manifest gap analysis
- No rate limiting

**Production mode (opt-in):**
- Disabled by default
- Rate limited (maxPerSession)
- Cost monitoring via `onVisionFallback` hook

```javascript
Clippi.on('visionFallback', (query, cost) => {
  analytics.track('clippi_vision_used', { query, cost })
})
```

**Target metric:** <5% of queries should hit vision fallback. Higher rates indicate manifest gaps.

**Gap identification workflow:**
1. Enable vision in development
2. Run through common user queries
3. Run `clippi analyze-fallbacks` to generate report of missing flows
4. Add flows to manifest
5. Re-test until fallback rate is acceptable

---

## 5. Integration (DX)

Developer experience is critical for any library's adoption. Clippi is designed to be progressive: you can start with 3 lines of code and a widget, or integrate deeply with your existing architecture. This section describes the different levels of integration, from simplest to most customized.

The guiding principle is **convention over configuration**: defaults work for 80% of cases, but everything is configurable for the remaining 20%.

### 5.1 Minimal Setup (Widget)

The fastest path to get Clippi working. Ideal for prototypes, demos, or applications that don't have an existing chat.

```bash
npm install @clippi/chat
```

```javascript
import { Clippi } from '@clippi/chat'

Clippi.init({
  manifest: '/guide.manifest.json',
  llm: { endpoint: '/api/clippi/chat' }
})
```

```html
<clippi-chat />
```

**What `@clippi/chat` includes:** It's the "all-inclusive" package. Internally it imports `@clippi/core` for logic and `@clippi/cursor` for visuals. It also includes the `<clippi-chat />` Web Component that renders a chat bubble in the corner of the screen.

**The Web Component:** We use Web Components (Custom Elements + Shadow DOM) because they're browser-native and work in any framework: React, Vue, Svelte, Angular, or vanilla JS. There are no style conflicts because Shadow DOM encapsulates the CSS.

**Why only two config options:** `manifest` and `llm.endpoint` are the only required fields. The manifest defines what Clippi can guide, and the endpoint is where Clippi sends user queries. Everything else has sensible defaults.

### 5.2 Headless with Cursor

For applications that already have a chat (Intercom, Zendesk, custom chat) but want to add Clippi's visual cursor.

```bash
npm install @clippi/core @clippi/cursor
```

```javascript
import { Clippi } from '@clippi/core'
import { Cursor } from '@clippi/cursor'

const guide = Clippi.init({
  manifest: '/guide.manifest.json',
  llm: { endpoint: '/api/clippi/chat' },
  context: () => ({
    plan: user.plan,
    permissions: user.permissions,
    state: { has_dataset: datasets.length > 0 }
  })
})

const cursor = Cursor.init({ container: document.body })

// Connect your chat with the cursor
guide.on('guide', (step) => {
  cursor.pointTo(step.element, step.instruction)
})

guide.on('stepCompleted', () => {
  cursor.hide()
})
```

**The pattern:** Your existing chat receives the user's message, sends it to your backend (which uses Clippi internally to decide what to do), and when the response is "guide", you activate Clippi's cursor.

**Why separate `@clippi/cursor`:** Some teams will want to use just the cursor, without any other part of Clippi. For example, for static product tours or code-controlled onboarding. The `@clippi/cursor` package is standalone and can be used independently.

**The `context` callback:** It's a function, not a static object. This allows Clippi to get fresh context every time it needs it. The user's plan can change mid-session (if they upgrade), permissions can change, app state changes constantly.

### 5.3 Logic Only (Your Own Cursor)

For teams that want total control over UI, or that already have their own visual guidance system.

```bash
npm install @clippi/core
```

```javascript
import { Clippi } from '@clippi/core'

const guide = Clippi.init({ manifest: '/guide.manifest.json' })

guide.on('guide', (step) => {
  // Your cursor/UI implementation
  myCustomCursor.show(step.element, step.instruction)
})
```

**What you get with just `@clippi/core`:** Manifest parsing, conditions checking, step sequencing, session persistence, and all events. Basically all the logic of "deciding what to guide and when", without any visual elements.

**Typical use case:** An application with a very specific design system where Clippi's cursor doesn't fit visually. Or an app using canvas/WebGL where DOM overlays don't work well.

### 5.4 Full Configuration

All available options when you need fine control:

```javascript
Clippi.init({
  // Required: where the manifest is
  manifest: '/guide.manifest.json',
  
  // Required: your backend endpoint (NEVER API key in browser)
  llm: {
    endpoint: '/api/clippi/chat',
  },
  
  // Optional: user context for conditions
  context: () => ({
    plan: user.plan,
    permissions: user.permissions,
    state: {
      has_dataset: datasets.length > 0
    }
  }),
  
  // Optional: docs for RAG fallback when no manifest match
  docs: {
    source: '/docs-embeddings.json',
  }
})
```

**About `docs`:** When the manifest doesn't have a match for the user's question, Clippi can fall back to searching your documentation. The `docs-embeddings.json` file contains your documentation pre-processed with embeddings. This allows answering questions that aren't "how do I do X" but "what is X" or "why does it work this way".

### 5.5 Custom Widget (React)

The Web Component is framework-agnostic, but for deeper React integrations we offer a hook.

```html
<!-- Web Component (framework-agnostic) -->
<clippi-chat position="bottom-right" />
```

```jsx
// Or headless for custom UI
import { useClippi } from '@clippi/chat/react'

function MyChat() {
  const { ask, messages, isGuiding, currentStep } = useClippi()
  // ...
}
```

**`useClippi` hook:** Exposes Clippi's internal state as React state. `messages` is the conversation history, `isGuiding` indicates if there's an active flow, `currentStep` is the current step. `ask()` is the function to send messages.

**When to use hook vs Web Component:** Use the Web Component if you just want to "add Clippi" without changes to your code. Use the hook if you want to integrate Clippi within an existing UI, or if you need programmatic access to state.

**Framework packages (v1.0):**

| Package | What it provides |
|---------|------------------|
| `@clippi/react` | `useClippi` hook, `<ClippiChat />` component |
| `@clippi/vue` | `useClippi` composable, `<ClippiChat />` component |

These wrap the Web Component with framework-idiomatic APIs:
- Proper React event handling (no manual `addEventListener`)
- Vue reactivity integration
- TypeScript types for props/events

**Web Component remains the core** — framework packages are thin wrappers (~50 lines each). This keeps maintenance burden low while providing first-class DX for the two most popular frameworks.

### 5.6 Backend Contract

Clippi doesn't include a backend. The developer implements their own endpoint following a simple contract.

**Why this decision:**

1. **Security:** LLM API keys should never be in the browser. They're visible in the Network tab, in source code, in any malicious extension. The backend is the only safe place.

2. **Cost control:** The developer can implement rate limiting, caching, or circuit breakers. They can decide which users have access and how many queries they can make.

3. **Flexibility:** Today you use OpenAI, tomorrow you want to switch to Anthropic. Or you want to use a self-hosted model. The backend abstracts this decision from Clippi.

4. **Auth:** The backend can verify the user is authenticated before processing the query. Clippi knows nothing about your auth system.

```typescript
// POST /api/clippi/chat
interface Request {
  messages: Message[]      // Conversation history
  context: UserContext     // Plan, permissions, state
  manifest: ManifestElement[]  // Guidable elements (reduced version)
}

interface Response {
  action: 'guide' | 'blocked' | 'text'
  elementId?: string      // For 'guide': which element to show
  instruction?: string    // For 'guide': what to tell the user
  reason?: BlockedReason  // For 'blocked': why they can't
  content?: string        // For 'text': conversational response
}
```

**The three response types:**

- **`guide`:** The LLM determined the user wants to do something that's in the manifest. Includes the `elementId` to guide to and the `instruction` to show.

- **`blocked`:** The user wants to do something but doesn't meet the conditions (plan, permissions, state). Includes the `reason` so Clippi can offer alternatives.

- **`text`:** The LLM determined it's a conversational question, not an action. Includes the response `content`.

**Reference implementation:**

`/examples/backend-node/` provides a working Express server (~150 lines):

- OpenAI/Anthropic/Gemini provider support (configurable)
- Intent classification prompt
- Manifest context injection
- Rate limiting middleware
- Error handling

```bash
cd examples/backend-node
cp .env.example .env  # Add your API key
npm install && npm start
```

Developers can use as-is for prototypes or as reference for their own stack (Python, Go, etc.).

### 5.7 Hooks

Hooks allow extending Clippi without modifying its code. They're especially useful for analytics, logging, and customized UX.

```javascript
Clippi.on('beforeGuide', (step) => {
  analytics.track('guide_started', { step: step.id })
})

Clippi.on('stepCompleted', (step) => {
  // User completed a step
})

Clippi.on('blocked', (step, reason) => {
  // Condition not met
  if (reason.type === 'plan') showUpsellModal()
})

Clippi.on('fallback', (type) => {
  // 'vision' | 'docs'
  // Useful for measuring manifest coverage
})
```

**`beforeGuide`:** Fires before showing the cursor. Useful for analytics ("user asked for help with X") or to prepare the UI (close modals, scroll to position).

**`stepCompleted`:** Fires when the user completes a step in a multi-step flow. Useful for funnel tracking ("how many users complete the export flow").

**`blocked`:** Fires when the user tries something they can't do. This is a golden moment for upselling. If `reason.type === 'plan'`, the user just expressed interest in a paid feature.

**`fallback`:** Fires when Clippi had to use vision or docs because there was no manifest match. This indicates gaps in your manifest you should fill. If you see many vision fallbacks for "export", that flow is probably missing from the manifest.

### 5.8 CLI

The CLI is the main interface for manifest setup and maintenance.

```bash
npx clippi init
# → Creates clippi.config.js with sensible defaults
# → Creates folder structure

npx clippi generate --tasks ./tasks.txt
# → Reads the tasks file (one per line)
# → Runs the Browser Use agent for each task
# → Generates guide.manifest.json

npx clippi validate
# → Loads the app in headless browser
# → Verifies each manifest selector resolves to an element
# → Reports broken selectors

npx clippi serve
# → Starts local server with chat + cursor preview
# → Hot reload when you change the manifest
# → Useful for iterating without deploying
```

**`clippi init`:** Project bootstrapping. Generates a `clippi.config.js` with your app's URL, LLM credentials (reads from env vars), and agent options.

**`clippi generate`:** The heart of setup. Takes a list of tasks in natural language ("export data to CSV", "create a new dataset", "change my plan to Pro") and uses the Browser Use agent to explore your app and generate the manifest.

**`clippi validate`:** Continuous validation. Selectors break when you change the UI. This command detects selectors that no longer work before users discover them. Ideal for running in CI.

**`clippi serve`:** Development server. Allows testing manifest changes without deploying. Includes hot reload: edit the manifest, save, and changes reflect immediately.

### 5.9 Theming

The `<clippi-chat />` widget and cursor need to visually adapt to the containing app. We implement theming with CSS Custom Properties (CSS variables), which is a browser standard with no dependencies.

**Why CSS Custom Properties:**

1. **Zero dependencies:** It's native CSS, works in all modern browsers.
2. **Works with Shadow DOM:** CSS variables pierce through Shadow DOM, unlike CSS classes.
3. **Automatic inheritance:** If the app already defines `--primary-color`, Clippi can use it.
4. **Dynamic runtime:** Can be changed at runtime (dark mode toggle) without reloading.

**Theming API:**

```javascript
Clippi.init({
  // Option 1: Preset
  theme: 'light' | 'dark' | 'auto',
  
  // Option 2: Custom
  theme: {
    primary: '#6366f1',
    primaryForeground: '#ffffff',
    background: '#ffffff',
    foreground: '#1f2937',
    muted: '#f3f4f6',
    mutedForeground: '#6b7280',
    border: '#e5e7eb',
    radius: '8px',
    font: 'inherit'
  }
})
```

**Available CSS variables:**

| Variable | Usage | Default (light) |
|----------|-------|-----------------|
| `--clippi-primary` | Buttons, links, cursor | `#6366f1` |
| `--clippi-primary-foreground` | Text on primary | `#ffffff` |
| `--clippi-background` | Chat background | `#ffffff` |
| `--clippi-foreground` | Main text | `#1f2937` |
| `--clippi-muted` | Secondary backgrounds | `#f3f4f6` |
| `--clippi-muted-foreground` | Secondary text | `#6b7280` |
| `--clippi-border` | Borders | `#e5e7eb` |
| `--clippi-radius` | Border radius | `8px` |
| `--clippi-font` | Font family | `inherit` |

That's 9 variables: enough for complete theming, few enough to document and maintain.

**Option 1: Use presets**

```javascript
Clippi.init({
  theme: 'dark'  // Uses dark mode defaults
})
```

The `light` and `dark` presets define sensible values. `auto` detects system preference with `prefers-color-scheme`.

**Option 2: Define in CSS (without touching JS)**

```css
:root {
  --clippi-primary: #6366f1;
  --clippi-background: #0f172a;
  --clippi-foreground: #f8fafc;
  /* ... */
}
```

If the variables already exist when Clippi initializes, it uses them. This allows theming to be purely CSS without passing anything in `init()`.

**Option 3: Extend a preset**

```javascript
Clippi.init({
  theme: {
    ...Clippi.themes.dark,
    primary: '#10b981',  // Only change primary
    radius: '16px'
  }
})
```

**Internal implementation:**

When Clippi initializes with a theme object, it injects variables into `:root`:

```javascript
function applyTheme(theme) {
  const root = document.documentElement
  Object.entries(theme).forEach(([key, value]) => {
    // camelCase → kebab-case
    const cssVar = `--clippi-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
    root.style.setProperty(cssVar, value)
  })
}
```

Inside Shadow DOM, styles reference variables with fallbacks:

```css
.chat-container {
  background: var(--clippi-background, #ffffff);
  color: var(--clippi-foreground, #1f2937);
  border-radius: var(--clippi-radius, 8px);
  font-family: var(--clippi-font, system-ui, sans-serif);
}

.send-button {
  background: var(--clippi-primary, #6366f1);
  color: var(--clippi-primary-foreground, #ffffff);
}
```

**CSS Shadow Parts for advanced customization:**

For users who need finer control, we expose parts of the Shadow DOM:

```javascript
// Inside the Web Component
<div part="container">
  <div part="header">...</div>
  <div part="messages">...</div>
  <div part="input-area">
    <input part="input" />
    <button part="send-button">...</button>
  </div>
</div>
```

```css
/* Users can do */
clippi-chat::part(container) {
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

clippi-chat::part(send-button) {
  border-radius: 9999px;
}
```

**Warning:** CSS parts give maximum flexibility but users can break the layout. We document them as "advanced" and recommend using CSS variables for most cases.

### 5.10 Testing

**Unit testing Clippi integrations:**

`@clippi/core` exports testing utilities:

```javascript
import { createMockClippi } from '@clippi/core/testing'

const clippi = createMockClippi({
  manifest: mockManifest,
  responses: {
    'export csv': { action: 'guide', elementId: 'export-csv' }
  }
})

// Mock mode skips LLM calls, returns deterministic responses
await clippi.ask('How do I export to CSV?')
expect(clippi.currentFlow).toBe('export-csv')
```

**E2E testing:**

```bash
npx clippi validate --e2e
# → Launches headless browser
# → Runs through each flow in manifest
# → Records success/failure for each step
# → Reports broken flows
```

Integrates with Playwright/Cypress test suites via `@clippi/testing` package.

**Manifest validation levels:**
- `clippi validate` — selectors exist in DOM
- `clippi validate --flows` — paths are completable end-to-end
- `clippi validate --conditions` — condition syntax is valid

### 5.11 Analytics (Optional)

Clippi doesn't include built-in analytics but provides hooks for integration:

```javascript
Clippi.on('flowStarted', (flow) => {
  analytics.track('clippi_flow_started', { flowId: flow.id })
})

Clippi.on('flowCompleted', (flow, duration) => {
  analytics.track('clippi_flow_completed', { flowId: flow.id, duration })
})

Clippi.on('flowAbandoned', (flow, step, reason) => {
  analytics.track('clippi_flow_abandoned', { flowId: flow.id, step, reason })
})

Clippi.on('fallback', (type, query) => {
  analytics.track('clippi_fallback', { type, query })  // Track manifest gaps
})
```

**Console analytics (development):**
```javascript
Clippi.init({ analytics: 'console' })
// Prints flow metrics to console on session end:
// - Flows started/completed/abandoned
// - Average steps per flow
// - Fallback rate
```

---

## 6. Tech Stack

Stack decisions are guided by three principles: **simplicity** (fewer dependencies = fewer problems), **universality** (works in any JS environment), and **separation of concerns** (each tool does one thing well).

The most important division is between code that runs in the end user's browser (npm packages) and code that runs during setup (Python agent). They have very different requirements: browser code must be small and fast; agent code can be heavy because it only runs on the developer's machine.

| Component | Technology | Reason |
|-----------|------------|--------|
| **@clippi/core** | Vanilla TypeScript | Pure logic, zero deps |
| **@clippi/cursor** | Vanilla TypeScript | Visual, zero deps, ~5kb |
| **@clippi/chat** | Web Components | Framework-agnostic, uses core+cursor |
| **Build** | tsup/rollup | ESM + CJS + IIFE |
| **CLI** | Node + Commander | Same ecosystem |
| **Extension** | TypeScript + Manifest V3 | Chrome standard |
| **Agent** | Python + Browser Use | Mature agent ecosystem |

### 6.1 Monorepo

We organize code in a monorepo because packages are intimately related. Changes in `@clippi/core` frequently require changes in `@clippi/cursor` and `@clippi/chat`. A monorepo allows making these changes atomically and testing integration before publishing.

```
clippi/
├── packages/
│   ├── core/          # Logic: manifest, conditions, step sequencer
│   ├── cursor/        # Visual: ghost cursor, tooltips, highlights
│   ├── chat/          # Widget <clippi-chat /> (uses core + cursor)
│   ├── cli/           # CLI (Node)
│   └── extension/     # Chrome extension
├── agent/             # Manifest generator (Python)
├── apps/
│   └── docs/          # Documentation
└── examples/
```

**The `packages/` vs `agent/` separation:** JavaScript packages live together under `packages/` and are managed with pnpm workspaces. The Python agent lives apart in `agent/` because it has its own dependency ecosystem (pip, virtualenv). This separation avoids the complexity of managing two ecosystems in one workspace.

**Dependencies between packages:**

```
@clippi/chat ──→ @clippi/core
      │
      └──→ @clippi/cursor ──→ @clippi/core
```

The dependency graph is intentionally simple and acyclic. `@clippi/core` is the base that doesn't depend on anything. `@clippi/cursor` depends on `core` to know which element to point at. `@clippi/chat` depends on both to orchestrate the complete experience.

**Use cases by package:**

```javascript
// All-inclusive (widget)
import { Clippi } from '@clippi/chat'
// → Includes core + cursor + UI

// Headless with visual cursor
import { Clippi } from '@clippi/core'
import { Cursor } from '@clippi/cursor'
// → Your own chat, but uses our cursor

// Logic only (your own cursor)
import { Clippi } from '@clippi/core'
// → You implement all UI
```

**pnpm workspaces:** We chose pnpm over npm/yarn for its efficient dependency handling (hard links instead of copies) and native workspace support. The `pnpm-workspace.yaml` file at root defines which folders are packages.

### 6.2 Vanilla TypeScript for Browser Packages

The `@clippi/core` and `@clippi/cursor` packages are written in pure TypeScript, with no runtime dependencies.

**Why zero dependencies:**

1. **Size:** Each dependency adds weight. We want `@clippi/core` to be <10kb and `@clippi/cursor` to be <5kb gzipped. With dependencies, we'd easily reach 50kb+.

2. **Conflicts:** If Clippi depends on lodash v4 and your app on lodash v3, you have a problem. Zero deps means zero conflicts.

3. **Security:** Each dependency is an attack vector (supply chain). Fewer deps = smaller attack surface.

4. **Maintenance:** Dependencies get outdated, have vulnerabilities, change APIs. Fewer deps = less maintenance work.

**What we implement ourselves:** Basic utility functions (debounce, deep merge), the event emitter, the selector system. They're few lines of code and avoid bringing in entire libraries.

### 6.3 Web Components for the Widget

The `<clippi-chat />` widget uses Web Components (Custom Elements + Shadow DOM).

**Why Web Components:**

1. **Framework-agnostic:** Works in React, Vue, Svelte, Angular, and vanilla JS without adapters. It's simply an HTML element.

2. **Style encapsulation:** Shadow DOM isolates widget styles. Your app's CSS doesn't affect Clippi, and Clippi's CSS doesn't affect your app.

3. **Browser standard:** It's not a library that can disappear. It's part of the web platform, supported by all modern browsers.

**Alternative considered:** Publishing separate components for React, Vue, etc. Discarded because it multiplies maintenance work and there are always frameworks left unsupported.

### 6.4 Build with tsup/rollup

We generate multiple distribution formats to maximize compatibility:

- **ESM:** For modern bundlers (webpack, vite, esbuild) that understand `import/export`
- **CJS:** For Node.js and legacy bundlers that use `require()`
- **IIFE:** For direct use in `<script>` tags without a bundler

**tsup vs rollup:** tsup is a wrapper over esbuild that simplifies configuration. We use it for simple packages. rollup is reserved for cases where we need specific plugins or finer control.

### 6.5 CLI with Node + Commander

The CLI is written in Node.js using Commander for argument parsing.

**Why Node:** It's the natural environment for JavaScript development tools. Developers using Clippi already have Node installed. We add no friction.

**Why Commander:** It's the de facto standard for Node CLIs. Handles arguments, flags, help text, and subcommands with minimal configuration.

**Alternatives considered:**
- **Go:** Standalone binaries, but requires user to install something extra
- **Rust:** Similar to Go, more complex to maintain for a JS team
- **Deno:** Interesting but less adopted, would add friction

### 6.6 Chrome Extension with Manifest V3

The Chrome extension for manual recording uses Manifest V3, Chrome's current standard.

**What the extension does:** Allows manually recording flows. The user activates recording, navigates through the app clicking, and the extension captures selectors and path. This generates manifest entries.

**Why Manifest V3:** Google deprecated Manifest V2 and new extensions must use V3. Although V3 has limitations (service workers instead of background pages), it's the only way forward.

**TypeScript:** The extension is written in TypeScript for consistency with the rest of the project and for type-checking benefits.

### 6.7 Browser Use for the Agent

The agent that automatically generates the manifest uses Browser Use, an open source Python library.

**Decision:** Use Browser Use (Python, MIT license) instead of building our own agent.

**What Browser Use is:** It's a framework that connects LLMs with browsers. You give it a natural language task ("export data to CSV") and it uses the LLM to decide what clicks to make, executes those clicks with Playwright, observes the result, and repeats until completing the task.

**Why Browser Use and not build from scratch:**

1. **Time savings:** Building a browser agent from scratch requires solving DOM extraction, LLM→action translation, error handling, retries, and many edge cases. Browser Use already solved all this. We estimate 1-2 weeks saved.

2. **Maintenance:** The Browser Use team maintains compatibility with new models, fixes bugs, improves performance. We don't have to do it ourselves.

3. **MIT License:** We can use it, modify it, and distribute it without restrictions.

4. **Self-hostable:** We don't depend on a cloud service. The agent runs locally with your own API key.

**Why Python and not TypeScript:** The browser agent ecosystem is dominated by Python. The best tools (Browser Use, LangChain, etc.) are Python. Trying to replicate them in TypeScript would be swimming against the current.

**We don't use Browser Use Cloud:** A Browser Use cloud service exists, but we run everything locally. The developer uses their own Gemini/OpenAI/Anthropic API key. This gives total control over costs and privacy.

**Agent abstraction (future-proofing):**

The CLI uses an `AgentProvider` interface to decouple from Browser Use:

```typescript
interface AgentProvider {
  generateFlow(task: string, context: AgentContext): Promise<ManifestElement>
  validateSelector(selector: SelectorStrategy): Promise<boolean>
}
```

v1.0 ships with `BrowserUseProvider` as the default. Future providers possible:
- `PlaywrightAgentProvider` (custom lightweight implementation)
- Alternative agent frameworks as they emerge

This abstraction protects against Browser Use abandonment or API changes. Switching providers is a config change, not a rewrite.

---

## 7. LLM Models (January 2026)

### 7.1 For Browser Agent (Setup)

| Model | Price (input/output 1M) | Quality for agents |
|-------|-------------------------|-------------------|
| **Gemini 3 Flash** ⭐ | $0.50 / $3.00 | Excellent, optimized for agents |
| DeepSeek V3.1 | ~$0.07 / $0.30 | Very cheap, open source |
| Claude Sonnet 4.5 | $3.00 / $15.00 | Excellent but 6x more expensive |

**Default:** Gemini 3 Flash
- 78% on SWE-bench (beats Gemini 3 Pro)
- Designed for agentic workflows
- 1M context

### 7.2 Setup Cost

| Model | 20 flows |
|-------|----------|
| Gemini 3 Flash | ~$0.50-1.50 |
| DeepSeek V3.1 | ~$0.10-0.30 |
| Claude Sonnet 4.5 | ~$3-6 |

### 7.3 For Runtime (Production)

The developer chooses. Clippi only defines the endpoint contract.

**Runtime cost:**
- Manifest match: $0 (local)
- Vision fallback: ~$0.01-0.05 per query
- Docs RAG: Minimal

---

## 8. Competition

### 8.1 Analysis

| Tool | What it does | Gap vs Clippi |
|------|--------------|---------------|
| **Microsoft Copilot Vision** | Highlights UI on Windows desktop | Desktop-only, not embeddable, closed source |
| **Command AI** | In-app copilot, executes actions | Executes vs guides, closed source, enterprise pricing |
| **CopilotKit** | Open source framework for AI copilots | Generic chat, no visual guidance |
| **Pendo/Userpilot/WalkMe** | Product tours | Predefined flows, not conversational |
| **Scribe/Tango** | Record workflows → static docs | Documentation only, no real-time guidance |

### 8.2 Unique Position

**Clippi is the only open source library that combines:**
1. Conversational chat
2. Visual cursor guidance
3. Automatic manifest generation via AI agent

---

## 9. Release Scope

### 9.1 Phased Approach

The original v1 scope was too large, risking a half-finished product. We now adopt a phased release:

| Phase | Focus | Risk Level |
|-------|-------|------------|
| **v0.1** | Core mechanics, manual manifest | Low - validates fundamentals |
| **v1.0** | Full automation, fallbacks | Medium - depends on Browser Use reliability |
| **v2.0** | Execution, hosted options | High - new complexity domains |

### 9.2 v0.1 - Foundation (MVP)

**Goal:** Validate core UX with minimal scope. Developers manually create manifests.

**Setup:**
- [ ] CLI: `init`, `serve` (dev server with hot reload)
- [ ] Manual manifest creation (documented schema + examples)
- [ ] `clippi validate` (selector validation in headless browser)

**Runtime (@clippi/core):**
- [ ] Manifest matching (local, no LLM)
- [ ] Actionability checks
- [ ] Step sequencer + MutationObserver
- [ ] sessionStorage persistence
- [ ] Basic conditions (plan, permissions)

**Visual (@clippi/cursor):**
- [ ] Animated ghost cursor
- [ ] Tooltips with instructions
- [ ] Element highlights
- [ ] Confirmation fallback ("Did you do it?")

**Integration (@clippi/chat):**
- [ ] `<clippi-chat />` widget
- [ ] Headless API
- [ ] Backend proxy pattern
- [ ] Event hooks (beforeGuide, stepCompleted, blocked)

**Documentation:**
- [ ] Manifest schema reference
- [ ] Integration guide (widget, headless, logic-only)
- [ ] Reference backend implementation (Node.js)
- [ ] Example app with 5-10 flows

**NOT in v0.1:**
- No AI agent / Browser Use
- No Chrome extension
- No vision fallback
- No docs RAG fallback
- No automatic manifest generation

### 9.3 v1.0 - Automation

**Goal:** Reduce manifest creation burden with AI agent. Add fallbacks for coverage gaps.

**Setup:**
- [ ] AI Agent + Browser Use (automated manifest generation)
- [ ] Chrome extension (manual recording for edge cases)
- [ ] CLI: `generate --tasks ./file`
- [ ] Docs/videos as agent context

**Runtime:**
- [ ] Vision fallback (screenshot + LLM when no manifest match)
- [ ] Docs RAG fallback (text response for conceptual questions)
- [ ] Feature flag conditions
- [ ] Business state conditions

**Integration:**
- [ ] `fallback` event hook
- [ ] Manifest coverage analytics (% queries hitting fallback)

**Metrics for v1.0 readiness:**
- v0.1 validated with 3+ production users
- Agent generates correct selectors >80% of the time
- Vision fallback latency <2s p95

### 9.4 v2.0+ - Future

- Action execution (with explicit confirmation)
- Native Intercom/Zendesk integrations
- Hosted LLM service (SaaS model)
- Local browser LLM for intent classification
- Cross-tab session persistence (optional localStorage mode)
- **Internationalization** (i18n for manifest instructions)
- **Accessibility** (WCAG 2.1 AA, screen readers, keyboard nav)
- **Mobile/Touch adaptation** (highlight rings, tap-to-confirm)
- **Offline & degraded network** (manifest caching, graceful degradation)

---

## 10. Rejected Decisions

### 10.1 Annotate Code with data-attributes

**Proposal:** Developer adds `data-guide="export-button"` to elements.

**Discarded because:**
- Requires modifying source code
- Hard to keep synchronized
- External manifest is more flexible

**Chosen alternative:** External JSON manifest with CSS selectors.

### 10.2 API Key in Browser

**Proposal:** 
```javascript
Clippi.init({ llm: { apiKey: 'sk-...' } })
```

**Discarded because:**
- Anyone can see the key in Network tab
- Risk of abuse and unexpected costs

**Chosen alternative:** Mandatory backend proxy.

### 10.3 beforeunload for Persistence

**Proposal:** Save state in `beforeunload`.

**Discarded because:**
- Doesn't work on Mobile Safari
- Not reliable in general

**Chosen alternative:** Continuously persist in `sessionStorage` after each step.

### 10.4 Integration with Google Antigravity / Claude Cowork

**Proposal:** Allow using these tools instead of Browser Use to save costs if developer already has a subscription.

**Discarded because:**
- They're interactive tools, not programmatic APIs
- Can't be called from CLI
- Output is not structured
- Basically equivalent to manual recording (already covered by Chrome extension)

**Alternative:** Chrome extension covers the manual recording case with better DX.

### 10.5 Use Consumer Subscription for Browser Use

**Proposal:** Have Browser Use use Claude Pro or Gemini Advanced subscription.

**Discarded because:**
- Consumer subscriptions are for web interface, not API
- Probably violates ToS
- Browser Use needs programmatic calls

**Chosen alternative:** Direct API keys (Gemini 3 Flash is very cheap: ~$1 for 20 flows).

### 10.6 Integration with OpenCode as Proxy

**Proposal:** If developer has OpenCode configured, use it as gateway for credentials.

**Discarded because:**
- OpenCode's OAuth (e.g., `"google": { "type": "oauth" }`) is for consumer subscriptions
- `opencode serve` exposes an API but oriented to coding sessions, not raw LLM calls
- Adds unnecessary complexity
- Direct API key cost is minimal (~$1 for complete setup)

**Chosen alternative:** Direct API keys via env vars. Simple, no magic.

### 10.7 Cheap LLM Model (GPT-4o-mini, Haiku)

**Initial proposal:** Use mini models to reduce costs.

**Discarded because:**
- Browser agents require:
  - Vision (interpreting screenshots)
  - Multi-step reasoning
  - Semantic DOM understanding
- Mini models aren't up to the task

**Chosen alternative:** Gemini 3 Flash as default (cheap but capable).

### 10.8 Hosted LLM Service (SaaS)

**Proposal:** Clippi hosts the LLM and charges for usage.

**Discarded for v1 because:**
- Requires infrastructure
- Different business model
- Complicates open source

**Possible in v2:** As additional option, maintaining self-hosted alternative.

---

## 11. LLM Configuration

### 11.1 Final Config

```javascript
// clippi.config.js
export default {
  llm: {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    // apiKey: process.env.GEMINI_API_KEY (default)
  }
}
```

### 11.2 Setup

```bash
export GEMINI_API_KEY=xxx
npx clippi generate
```

---

## 12. Future Considerations (v2+)

### 12.1 Local Browser LLM for Intent Classification

**Opportunity:** Reduce backend calls for simple queries using a local model.

**Hybrid strategy:**
```javascript
async function handleQuery(query) {
  // 1. Try to classify locally (if available)
  if (localLLM.available) {
    const intent = await localLLM.classify(query)
    const match = manifest.find(e => e.keywords.includes(intent))
    if (match && intent.confidence > 0.8) return guide(match)
  }
  
  // 2. Fallback to backend LLM
  return callBackendLLM(query)
}
```

**Estimated benefit:** Reduce backend calls by ~60-70% of cases.

### 12.2 Gemini Nano (Chrome)

Chrome exposes the Prompt API for Gemini Nano, a small model that runs locally.

**Pros:**
- $0, no network latency
- Good for: classification, summarizing, rephrasing

**Cons:**
- Chrome only
- "NOT suitable for use cases that require factual accuracy" (Google)
- Experimental API, may not launch
- Small model, doesn't replace backend LLM

**Evaluation:** Useful for intent classification, not for complex reasoning.

```javascript
// Availability detection
if (window.ai?.languageModel) {
  const session = await window.ai.languageModel.create()
  const result = await session.prompt("Classify: " + query)
}
```

### 12.3 Gemma WASM (Safari, Firefox)

**Investigate:** Running a small Gemma model (2B) via WebAssembly to cover Safari and Firefox.

**Projects to evaluate:**
- MediaPipe LLM Inference API
- llama.cpp WASM builds
- Transformers.js

**Open questions:**
- Downloadable model size? (acceptable for users?)
- Performance on mobile devices?
- Cold start time?
- Worth it vs simply calling backend?

**Decision:** Evaluate feasibility when Gemini Nano is more mature. If Chrome demonstrates value, invest in cross-browser solution.

### 12.4 Future Architecture with Local LLM

```
┌─────────────────────────────────────────────────────────────┐
│                     RUNTIME (v2)                            │
├─────────────────────────────────────────────────────────────┤
│  User asks                                                  │
│        ↓                                                    │
│  0. Local LLM (if available) → intent classification        │
│        ↓ (high confidence match)                            │
│  1. Manifest match → cursor guides [$0, ~50ms]              │
│        ↓ (no match or low confidence)                       │
│  2. Backend LLM → complex decision [$$, ~500ms]             │
│        ↓                                                    │
│  3. Vision / RAG fallbacks                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. Next Steps

### Phase 0: Validation (1-2 weeks)

1. **Code spike** to validate core architecture
   - Implement actionability checks
   - Test MutationObserver reliability across frameworks (React, Vue, vanilla)
   - Validate cursor positioning edge cases
2. **Buy domain** clippi.net
3. **Setup monorepo** with pnpm workspaces

### Phase 1: v0.1 Development

4. **Core packages** (in order):
   - `@clippi/core` - manifest parser, conditions, step sequencer, persistence
   - `@clippi/cursor` - ghost cursor, tooltips, highlights
   - `@clippi/chat` - widget Web Component, headless API
   - `@clippi/cli` - init, serve, validate commands

5. **Documentation & examples**:
   - Manifest schema reference with JSON Schema
   - Integration guide for each level (widget → headless → logic-only)
   - Reference backend implementation (Node.js + Express)
   - Example app demonstrating 5-10 common flows

6. **Validation**:
   - Internal dogfooding
   - 3+ beta users in production
   - Gather feedback on manifest authoring pain points

### Phase 2: v1.0 Development

7. **Automation tooling**:
   - Chrome extension for manual recording
   - AI Agent + Browser Use integration
   - CLI `generate` command

8. **Fallback systems**:
   - Vision fallback implementation
   - Docs RAG integration
   - Coverage analytics

### Success Criteria for v0.1 Launch

- [ ] Core runtime works in React, Vue, and vanilla JS apps
- [ ] Widget renders correctly across Chrome, Firefox, Safari
- [ ] Step sequencer handles 90%+ of common UI patterns
- [ ] Documentation sufficient for self-service integration
- [ ] At least one production deployment validated

---

## Appendix A: References

- **Browser Use:** https://github.com/browser-use/browser-use (MIT)
- **Gemini 3 Flash:** https://ai.google.dev/gemini-api/docs/gemini-3
- **Web Components:** https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- **Playwright Actionability:** https://playwright.dev/docs/actionability
- **Chrome AI (Gemini Nano):** https://goo.gle/chrome-ai-dev-preview
- **MediaPipe LLM Inference:** https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js
- **Transformers.js:** https://huggingface.co/docs/transformers.js

---

## Appendix B: v2 Feature Specifications

These features are planned for v2.0+ and are documented here for future reference.

### B.1 Internationalization

**Manifest instructions support i18n:**
```json
{
  "instruction": "Click Export",
  "instruction_i18n": {
    "es": "Haz clic en Exportar",
    "fr": "Cliquez sur Exporter",
    "de": "Klicken Sie auf Exportieren"
  }
}
```

**Runtime configuration:**
```javascript
Clippi.init({ locale: 'es' })  // Or detect from navigator.language
```

Falls back to `instruction` if locale not found.

**Keywords already support multiple languages** — include translations directly in the keywords array:
```json
"keywords": ["export", "download", "csv", "exportar", "descargar"]
```

### B.2 Mobile Adaptation

On touch devices (detected via `'ontouchstart' in window` or `navigator.maxTouchPoints > 0`):

**Visual changes:**
- No ghost cursor (there's no cursor on mobile)
- Target element gets pulsing highlight ring
- Tooltip anchored to element, not cursor position
- Larger touch targets for tooltip controls (min 44×44px)

**Interaction changes:**
- Tap target to confirm step (vs click-through on desktop)
- Swipe down on tooltip to dismiss flow
- Pull-to-refresh doesn't interfere with flows

**Viewport handling:**
- Auto-scroll to bring target into view with padding
- Respect `viewport-fit=cover` for notched devices
- Handle keyboard appearing/disappearing during flows

### B.3 Accessibility

**Screen reader support:**
- Cursor position announced via `aria-live="polite"` region
- Step instructions read aloud: "Step 2 of 4: Click the Export button"
- Flow completion announced: "Guide complete"
- Error states announced

**Keyboard navigation:**
- `Escape` cancels current flow at any time
- `Tab` focuses the current target element
- `Enter` on tooltip confirms step (alternative to clicking target)
- Chat widget fully keyboard navigable (Tab through messages, Enter to send)

**Reduced motion:**
- Respects `prefers-reduced-motion` media query
- Cursor teleports instead of animating
- No pulsing, bouncing, or continuous animation effects
- Highlight fades are instant

**WCAG 2.1 AA compliance targets:**
- Color contrast ratio ≥4.5:1 for text, ≥3:1 for UI components
- Focus indicators visible on all interactive elements
- No information conveyed by color alone
- Touch targets minimum 44×44px

### B.4 Offline & Degraded Network

**Manifest caching:**
- Manifest cached in `localStorage` after first successful load
- Stale-while-revalidate pattern: use cache, fetch update in background
- Works offline for manifest-matched queries (no LLM needed)

**Backend unreachable:**
- Local manifest matching still works
- Vision fallback disabled
- User sees: "I can help with common tasks. For other questions, please check your connection."

**Slow connection:**
- Loading states in chat UI (typing indicator)
- Timeout after 10s with retry option
- Graceful degradation: partial responses displayed as they arrive

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Manifest** | JSON file defining guidable elements, their selectors, and conditions |
| **Actionability** | Verification that an element is visible, enabled, and clickable |
| **Step Sequencer** | Module that manages multi-step flows and transitions |
| **Vision Fallback** | Using screenshot + LLM when manifest has no match |
| **Conditions** | Rules that determine if an element is accessible (plan, permissions, state) |
| **Gemini Nano** | Small Google LLM model that runs locally in Chrome |
| **Intent Classification** | Determining user's intention (e.g., "export", "configure") |
| **WASM** | WebAssembly, binary format for running native code in browsers |
