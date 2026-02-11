# Accessibility Tree Analysis for Clippi

## Executive Summary

The accessibility tree (AX tree) is the browser's built-in mapping of DOM elements to semantic, human-readable representations. Clippi's core problem is mapping **natural language intent** ("How do I export to CSV?") to **DOM elements** (the export button). The AX tree is literally the browser's native solution to this exact mapping problem.

**Verdict:** The AX tree is not just useful — it's the most important architectural primitive Clippi isn't using yet. Its impact varies by context:

| Context | Impact | Verdict |
|---------|--------|---------|
| **Agent** (manifest generation) | Transformative | The key to reliable, cheap manifest generation |
| **Extension** (recording) | Very high | Produces the most stable selectors available |
| **Runtime** (production) | Moderate | Useful but has implementation cost in zero-dep library |

---

## What the Accessibility Tree Is

The AX tree is a parallel structure the browser maintains alongside the DOM for assistive technologies. Each node contains:

| Property | Description | Example |
|----------|-------------|---------|
| **Role** | Semantic type | `button`, `link`, `textbox`, `dialog`, `tab`, `navigation` |
| **Name** | Computed human-readable label | "Export to CSV", "Search", "Close dialog" |
| **Description** | Additional context | "Downloads your data in CSV format" |
| **State** | Current interactive state | `expanded`, `selected`, `checked`, `disabled` |
| **Value** | Current value | "john@example.com" (in a textbox) |
| **Children** | Semantic hierarchy | Dialog → Form → Textbox, Button |

The **computed accessible name** is the key concept. It's not just `aria-label` — the browser computes it from multiple sources following the [Accessible Name Computation spec](https://www.w3.org/TR/accname-1.2/), in priority order:

1. `aria-labelledby` (references another element's text)
2. `aria-label` (explicit label attribute)
3. `<label for="id">` association
4. Text content (for buttons, links)
5. `alt` attribute (for images)
6. `title` attribute
7. `placeholder` attribute

Clippi currently only checks #2 (`aria-label`). The computed name catches all seven sources.

---

## Current State: What Clippi Does Today

### Selector Priority

```
testId → aria → css → text
```

### Extension Recording (`selector-extractor.ts`)

```typescript
// Only reads explicit aria-label attribute
function extractAriaLabel(element: Element): string | null {
  return element.getAttribute("aria-label");
}
```

**What it misses:**
- `<label for="email">Email address</label><input id="email">` → name is "Email address" but Clippi sees `null`
- `<button><svg aria-label="Download"/> Export</button>` → name is "Export" from text content, Clippi gets `null` from aria-label
- `aria-labelledby="title"` references → completely invisible
- Implicit roles: `<button>` has role `button`, `<nav>` has role `navigation` — Clippi doesn't capture these

### Element Description (`describeElement()`)

```typescript
// Manual priority chain, misses computed name
if (ariaLabel) return ariaLabel;
if (text) return text;
if (placeholder) return placeholder;
if (title) return title;
return tagName;
```

This is a poor approximation of the accessible name computation. It doesn't handle `aria-labelledby`, `<label>` associations, or the correct priority order from the spec.

### Interactive Element Detection (`isInteractiveElement()`)

```typescript
// Hardcoded list of tags and roles
const interactiveTags = ["a", "button", "input", "select", "textarea", "label", "summary"];
const interactiveRoles = ["button", "link", "checkbox", "radio", "tab", ...];
```

The AX tree inherently knows what's interactive. This hardcoded list will always be incomplete.

---

## Analysis by Context

### 1. Agent (Manifest Generation) — Transformative Impact

This is where the AX tree matters most. The planned agent uses Browser Use + Playwright to navigate pages and generate manifests.

**Page understanding:**

A typical page might have 500+ DOM nodes. The AX tree for the same page has ~50-100 meaningful nodes. Consider a navigation bar:

```html
<!-- DOM: 47 elements -->
<nav class="sc-hKMtZM iSGPQr" data-v-4a8b9c2d>
  <div class="sc-bdnxRM jNMOcE nav-container">
    <div class="sc-gsnTZi bSgKFN">
      <a href="/dashboard" class="sc-dkzDqf gRPNMT active">
        <svg class="sc-hHLeRK cJYYjg" viewBox="0 0 24 24">
          <path d="M3 13h8V3H3v10zm0..."/>
        </svg>
        <span class="sc-bczRLJ dQHmPG">Dashboard</span>
      </a>
      <!-- ... 40 more elements ... -->
    </div>
  </div>
</nav>
```

```
// AX tree: 6 nodes
navigation "Main"
  link "Dashboard" [current=page]
  link "Datasets"
  link "Exports"
  link "Settings"
  link "Help"
```

The AX tree is 10-50x more compact, contains only semantically meaningful elements, and uses natural language labels. This means:

- **Fewer tokens** → cheaper LLM calls (directly impacts the $0.50-1.50 per 20 flows estimate)
- **Higher accuracy** → the LLM sees "button: Export to CSV" not `<div class="sc-dkzDqf gRPNMT" data-v-4a8b9c2d>`
- **Better flow discovery** → hierarchical roles reveal UI structure (dialog → form → submit)

**Selector generation:**

When the agent identifies an element to include in the manifest, the AX tree provides the most stable identifier: **role + accessible name**.

```json
// Current approach (from DOM scraping):
{ "type": "css", "value": "button.sc-dkzDqf.gRPNMT" }  // breaks on rebuild

// With AX tree:
{ "type": "role", "value": "button", "name": "Export to CSV" }  // survives redesigns
```

This is the same approach Playwright recommends with `getByRole('button', { name: 'Export to CSV' })` — their highest-priority selector strategy.

**State-aware success conditions:**

The AX tree exposes states that are hard to detect via DOM:

| UI change | DOM approach (fragile) | AX tree approach (stable) |
|-----------|----------------------|--------------------------|
| Tab selected | `attribute: { name: "aria-selected", value: "true" }` | State: `selected` |
| Menu expanded | `visible: ".menu-dropdown"` (class-dependent) | State: `expanded` |
| Checkbox checked | `attribute: { name: "checked" }` (only works for native) | State: `checked` |
| Dialog opened | `exists: "[role=dialog]"` | New `dialog` node in tree |

**How to implement in Browser Use:**

Playwright (which Browser Use wraps) already has `page.accessibility.snapshot()`:

```python
# In the agent's page analysis step:
ax_tree = await page.accessibility.snapshot()
# Returns compact JSON tree with roles, names, states

# Feed to LLM instead of (or alongside) DOM
prompt = f"""
Given this page structure:
{json.dumps(ax_tree, indent=2)}

Identify the steps to: "export data to CSV"
"""
```

Browser Use may already do something like this internally. The opportunity is to ensure our agent prompt engineering is built around AX tree snapshots, and that selector output uses role+name pairs.

---

### 2. Chrome Extension (Recording) — Very High Impact

The extension records user interactions to generate manifests. The AX tree improves every aspect of this.

**New selector strategy: `role`**

Add a strategy that combines role + accessible name:

```json
{
  "strategies": [
    { "type": "testId", "value": "export-csv" },
    { "type": "role", "value": "button", "name": "Export to CSV" },
    { "type": "aria", "value": "Export to CSV" },
    { "type": "css", "value": "button.export-btn" },
    { "type": "text", "value": "Export to CSV", "tag": "button" }
  ]
}
```

The `role` strategy sits between `testId` and `aria` in stability because:
- It uses the **computed** name (not just explicit `aria-label`)
- It combines role + name (more specific than name alone)
- It matches how testing frameworks find elements (Playwright `getByRole`, Testing Library `getByRole`)

**Better `describeElement()` for instructions:**

With the computed accessible name, the auto-generated `instruction` field in manifest steps becomes more accurate:

```
// Current: "Click Export to CSV" (from textContent, gets it right sometimes)
// Current: "Click button" (when text is in a child span, falls through to tagName)

// With AX tree: "Click the 'Export to CSV' button" (always correct)
```

**Accessing the AX tree from the extension:**

There are three approaches, each with trade-offs:

| Approach | Pros | Cons |
|----------|------|------|
| **A. `chrome.debugger` + CDP** | Full AX tree, accurate | Shows "debugging" banner, bad UX |
| **B. `chrome.automation` API** | Clean API | ChromeOS only (or requires flags) |
| **C. Content-script computation** | No permission issues, no banner | Must implement name computation ourselves |

**Recommendation: Approach C** — compute accessible name and role in the content script. This is what `@testing-library/dom` does with `getByRole`. The algorithm:

```typescript
function computeAccessibleName(element: Element): string | null {
  // 1. aria-labelledby (resolve referenced elements)
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const names = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref?.textContent?.trim();
    }).filter(Boolean);
    if (names.length) return names.join(' ');
  }

  // 2. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // 3. <label> association (for form controls)
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return label.textContent?.trim() || null;
  }

  // 4. Text content (for buttons, links)
  const role = getImplicitRole(element);
  if (['button', 'link', 'tab', 'menuitem'].includes(role || '')) {
    return element.textContent?.trim() || null;
  }

  // 5. alt (for images)
  if (element instanceof HTMLImageElement) {
    return element.alt || null;
  }

  // 6. title, placeholder
  return element.getAttribute('title')
    || (element as HTMLInputElement).placeholder
    || null;
}

function getImplicitRole(element: Element): string | null {
  // Explicit role takes precedence
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;

  // Implicit roles from HTML semantics
  const tag = element.tagName.toLowerCase();
  const implicitRoles: Record<string, string> = {
    button: 'button',
    a: 'link',        // when has href
    input: 'textbox', // varies by type
    select: 'combobox',
    textarea: 'textbox',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    dialog: 'dialog',
    details: 'group',
    summary: 'button',
    table: 'table',
    // ... etc
  };
  return implicitRoles[tag] || null;
}
```

This is simplified — the full spec has more rules — but covers 90%+ of real-world cases. The implementation adds ~2-3KB to the extension and requires no special permissions.

---

### 3. Runtime (Production) — Moderate Impact

At runtime, Clippi resolves selectors and checks actionability. The AX tree helps here but the implementation cost is higher because `@clippi/core` is a zero-dependency ~10KB library.

**New `role` selector type in the resolver:**

```typescript
// In resolver.ts
function resolveRole(value: string, name?: string): Element | null {
  // Find by explicit role attribute
  const byRole = document.querySelectorAll(`[role="${value}"]`);

  // Also check implicit roles
  const implicitTagMap: Record<string, string[]> = {
    button: ['button', 'summary'],
    link: ['a[href]'],
    textbox: ['input:not([type])', 'input[type="text"]', 'input[type="email"]', 'textarea'],
    // ... etc
  };

  const candidates = [...byRole];
  const implicitSelectors = implicitTagMap[value] || [];
  for (const sel of implicitSelectors) {
    candidates.push(...document.querySelectorAll(sel));
  }

  if (!name) return candidates[0] || null;

  // Match by computed accessible name
  for (const el of candidates) {
    if (computeAccessibleName(el) === name) return el;
  }
  return null;
}
```

**Updated priority order:**

```
testId → role → aria → css → text
```

**Better actionability: `aria-disabled` and `aria-hidden`**

The current `isEnabled()` check only looks at the native `disabled` attribute. Many component libraries use `aria-disabled="true"` instead (particularly for non-native elements with ARIA roles):

```typescript
function isEnabled(el: Element): boolean {
  if ('disabled' in el && (el as HTMLInputElement).disabled) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;  // NEW
  return true;
}
```

Similarly, `aria-hidden="true"` subtrees should be considered invisible:

```typescript
function isVisible(el: Element): boolean {
  // ... existing checks ...
  if (el.closest('[aria-hidden="true"]')) return false;  // NEW
  return true;
}
```

**Trade-off:** Adding `computeAccessibleName()` to `@clippi/core` adds ~1-2KB. This is significant for a 10KB library but arguably worth it since the `role` strategy will be the second-most-stable selector type after `testId`.

---

## How This Connects to Clippi's Existing Architecture

### Selector Stability Ranking (Updated)

```
1. testId  ⭐⭐⭐  (developer-instrumented, most intentional)
2. role    ⭐⭐⭐  (semantic identity, survives redesigns)    ← NEW
3. aria    ⭐⭐½  (explicit label only, good when present)
4. css     ⭐⭐   (structural, breaks on refactors)
5. text    ⭐     (fragile, breaks on copy changes)
```

The `role` strategy is almost as stable as `testId` because:
- Roles rarely change (a button stays a button)
- Accessible names are tied to user-facing text (changes require translation updates)
- The combination of role+name is highly specific
- This is why Playwright made `getByRole` their #1 recommended selector

### Manifest Schema Change

The `SelectorStrategyType` union would expand:

```typescript
// Current
export type SelectorStrategyType = 'testId' | 'aria' | 'css' | 'text'

// Proposed
export type SelectorStrategyType = 'testId' | 'role' | 'aria' | 'css' | 'text'

export interface SelectorStrategy {
  type: SelectorStrategyType
  value: string
  /** For role strategy: the accessible name to match */
  name?: string
  /** For text strategy: which HTML tag to match */
  tag?: string
}
```

This is backward-compatible. Existing manifests without `role` strategies continue to work.

### Success Condition Enhancement

AX states could power more reliable success conditions:

```json
{
  "success_condition": {
    "aria_state": {
      "selector": { "strategies": [{ "type": "role", "value": "tab", "name": "Exports" }] },
      "state": "selected"
    }
  }
}
```

This is cleaner than the current `attribute` approach and doesn't require knowing the specific ARIA attribute name.

---

## Risks and Limitations

### 1. Not All Apps Are Accessible

Many web apps have poor or missing accessibility markup. The AX tree will be incomplete or inaccurate for these apps.

**Mitigation:** The `role` strategy is just one option in the fallback chain. If there's no meaningful role or name, Clippi falls through to `css` and `text` as it does today. The system degrades gracefully.

### 2. Computing Accessible Names Is Non-Trivial

The full [Accessible Name Computation spec](https://www.w3.org/TR/accname-1.2/) has many edge cases: CSS-generated content, `display:none` referenced elements, recursive `aria-labelledby`, etc.

**Mitigation:** Implement the 80/20 version. The simplified algorithm (aria-labelledby → aria-label → label[for] → text content → alt → title) covers the vast majority of real-world cases. Libraries like `dom-accessibility-api` (2.4KB gzipped, used by Testing Library) could serve as reference or even be vendored.

### 3. Browser API Limitations at Runtime

There's no standard browser API to get the full computed AX tree from JavaScript. `element.computedRole` and `element.computedName` exist in some browsers but have limited support.

**Mitigation:** The content-script computation approach works everywhere. For the agent (Playwright), `page.accessibility.snapshot()` is fully supported. The limitation only affects runtime, where the simplified computation is good enough.

### 4. Accessible Name Instability

Accessible names derived from visible text change when copy changes. If a button's label changes from "Export CSV" to "Download CSV", the `role` selector breaks.

**Mitigation:** This is the same fragility as the `text` strategy, but mitigated by:
- Role + name together is more specific (reduces false matches after text changes)
- `testId` remains the most stable strategy
- Manifests should be re-validated when UI text changes (`clippi validate` catches this)

---

## Implementation Recommendation

### Phase 1: Extension (Low Effort, High Value)

Add to the Chrome extension:
1. `computeAccessibleName()` function in `selector-extractor.ts` (~100 lines)
2. `getImplicitRole()` function (~50 lines)
3. New `role` strategy in `extractSelectors()`: `{ type: "role", value: role, name: computedName }`
4. Update `describeElement()` to use computed name
5. No new permissions needed, no chrome.debugger required

### Phase 2: Core Runtime (Medium Effort, Medium Value)

Add to `@clippi/core`:
1. `resolveRole()` in `resolver.ts` — resolve by role + computed name
2. Add `'role'` to `SelectorStrategyType`
3. Add `aria-disabled` and `aria-hidden` checks to actionability
4. Size budget: aim for <2KB addition

### Phase 3: Agent (Depends on v1.0 Timeline)

When building the Browser Use agent:
1. Use `page.accessibility.snapshot()` as the primary page representation for LLM prompts
2. Generate `role` selectors as the preferred strategy (after testId)
3. Use AX tree state changes for success condition detection
4. Use tree hierarchy for multi-step flow discovery

---

## Conclusion

The accessibility tree is the browser's answer to the question "what's on this page and what can the user do with it?" — which is exactly the question Clippi needs to answer. Currently, Clippi approximates this answer by scraping DOM attributes and maintaining hardcoded lists of interactive elements. The AX tree provides this answer directly, accurately, and in natural language.

The strongest case is for the **agent**: feeding AX tree snapshots to the LLM instead of raw DOM is cheaper, more accurate, and produces more stable selectors. This alone justifies building around the AX tree.

For the **extension**, computing accessible names in the content script is a targeted improvement that produces significantly better selectors with no new permissions or UX issues.

For **runtime**, the new `role` selector type and improved actionability checks are valuable but should be weighed against the zero-dependency size budget.
