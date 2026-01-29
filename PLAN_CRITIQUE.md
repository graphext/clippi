# Critique of Clippi Design Document

This document provides a critical analysis of PLAN.md, identifying potential issues, gaps, and areas requiring further consideration.

---

## Strengths

Before diving into critiques, the plan has several notable strengths:

- **Clear problem statement** - The gap between text-based help and visual guidance is real
- **Well-reasoned technical decisions** - Each choice includes rationale and rejected alternatives
- **Pragmatic v1 scope** - "Guide only, don't execute" is a smart complexity reduction
- **Zero-dependency browser packages** - Reduces conflicts and bundle size concerns
- **Backend proxy requirement** - Correct security decision for API keys

---

## Architecture Concerns

### 1. Manifest Staleness Problem

The manifest is generated once during setup but UIs change constantly. The plan mentions `clippi validate` for CI but doesn't address:

- **How often should manifests be regenerated?** After every UI change? Weekly?
- **Partial regeneration** - Can you update just one flow without re-running the entire agent?
- **Version drift detection** - How do you know your manifest is stale before users hit broken selectors?

**Suggestion:** Consider a manifest versioning strategy and automated staleness detection (e.g., hash UI components, detect selector failures in production).

### 2. Vision Fallback is Expensive and Slow

The fallback chain (Manifest → Vision → Docs RAG) assumes vision fallback is viable for production. However:

- **Cost:** $0.01-0.05 per query adds up at scale
- **Latency:** Screenshot capture + LLM round-trip adds 1-3 seconds
- **Accuracy:** Vision models can misidentify elements, especially in complex UIs

If many queries hit vision fallback, the UX degrades significantly. The plan treats vision as a safety net, but doesn't define acceptable fallback rates.

**Suggestion:** Define target metrics (e.g., <5% vision fallback rate) and provide tooling to identify manifest gaps causing fallbacks.

### 3. MutationObserver Limitations

The step sequencer relies on MutationObserver to detect step completion. This has edge cases:

- **SPA route changes** may not trigger mutations if using virtual DOM diffing
- **Canvas/WebGL elements** are invisible to MutationObserver
- **CSS-only state changes** (e.g., `:checked` pseudo-class) may not be detected
- **Async state** - What if the mutation happens before the observer is attached?

The 10-second manual confirmation fallback helps, but relying on it frequently creates poor UX.

**Suggestion:** Document known limitations. Consider additional detection strategies (URL polling, custom events API for integrators).

### 4. Conditions Evaluation Security

Conditions use `new Function()` to evaluate:

```javascript
const conditionFn = new Function('ctx', `return (${element.conditions})(ctx)`)
```

This is essentially `eval()`. If the manifest can be modified by an attacker (XSS, compromised CDN), they can execute arbitrary code.

**Suggestion:** Either:
- Restrict conditions to a safe DSL (not arbitrary JS)
- Require manifests to be served from same-origin with integrity checks
- Document this as a security consideration

---

## Developer Experience Gaps

### 5. Backend Implementation Burden

The plan explicitly excludes backend implementation, but the "simple contract" still requires developers to:

- Set up an LLM integration
- Implement intent classification
- Handle the guide/blocked/text response types
- Manage rate limiting and caching
- Handle the manifest context injection

For a library promising quick setup, this is significant work. Many developers will want a reference implementation or hosted option.

**Suggestion:** Provide a reference backend implementation (even if minimal) in Node.js/Python. The "no hosted service" decision is fine for v1, but the backend burden is real.

### 6. Testing Strategy is Undefined

How do developers test their Clippi integration?

- **Unit tests:** How do you mock Clippi's behavior?
- **E2E tests:** How do you verify flows work without hitting LLM costs?
- **Manifest validation:** `clippi validate` checks selectors exist, but not that flows are correct

**Suggestion:** Define testing utilities (mock mode, recorded fixtures, flow assertion helpers).

### 7. Error Handling and Debugging

The plan doesn't describe:

- What happens when a selector matches multiple elements?
- What errors are surfaced to developers vs. users?
- How do you debug why a flow isn't working?
- Logging/observability strategy

**Suggestion:** Add a debugging section covering error taxonomy, logging levels, and troubleshooting guides.

---

## Technical Decisions to Reconsider

### 8. Web Components May Limit React/Vue Adoption

While Web Components are framework-agnostic in theory, in practice:

- React has poor Web Component support (event handling, refs)
- Many teams have existing component libraries they'd prefer to extend
- Shadow DOM makes styling integration harder than the plan suggests

The plan mentions a `useClippi` React hook, but it's positioned as secondary.

**Suggestion:** Consider React/Vue wrapper packages as first-class citizens, not afterthoughts. Many successful libraries (Radix, Headless UI) prove that framework-specific packages drive adoption.

### 9. Browser Use Dependency Risk

The agent depends heavily on Browser Use. Risks:

- **Maintenance:** What if Browser Use is abandoned or changes direction?
- **Quality:** Browser agents are still unreliable for complex flows
- **Debugging:** When the agent generates wrong selectors, how do users fix them?

The Chrome extension provides a fallback, but manual recording defeats the "automatic generation" value proposition.

**Suggestion:**
- Document Browser Use failure modes and manual correction workflows
- Consider abstracting the agent interface to support alternative implementations
- Set realistic expectations about agent accuracy (it won't be 100%)

### 10. sessionStorage Scope Limitations

Using `sessionStorage` means:

- Flow state doesn't persist across tabs (user opens new tab, loses progress)
- State is lost on browser crash
- No cross-device continuity

For long, complex flows this could be frustrating.

**Suggestion:** Consider optional `localStorage` mode with configurable TTL, or document this as a known limitation.

---

## Scope and Prioritization

### 11. v1 Scope May Be Too Large

The v1 "included" list contains:

- AI Agent with Browser Use
- Chrome extension
- 4 CLI commands
- Full runtime (manifest matching, vision fallback, docs RAG, actionability, step sequencer, conditions, persistence)
- Complete visual package (cursor, tooltips, highlights, confirmation UI)
- Widget with headless API and hooks

This is a substantial amount of work. There's risk of shipping a half-finished product.

**Suggestion:** Consider a more minimal v0.1:
1. Core runtime + cursor (no vision/RAG fallback)
2. Manual manifest creation (no agent/extension)
3. Basic CLI (init, serve)

Then iterate. The agent and extension could be v1.1.

### 12. No Analytics/Telemetry Strategy

How do Clippi users understand:

- Which flows are most used?
- Where users abandon flows?
- Which queries hit fallbacks?
- Flow completion rates?

The hooks enable custom analytics, but there's no built-in solution.

**Suggestion:** Consider optional, privacy-respecting analytics (even if just console reports) to help users optimize their manifests.

---

## Missing Considerations

### 13. Accessibility

The plan doesn't address:

- Screen reader compatibility for the cursor and tooltips
- Keyboard navigation during guided flows
- Reduced motion preferences
- ARIA announcements for step changes

Visual guidance inherently creates accessibility challenges.

**Suggestion:** Add an accessibility section addressing WCAG compliance and alternative modalities for visually-impaired users.

### 14. Internationalization

- Are instructions translatable?
- How do manifests handle multi-language apps?
- Do keywords support multiple languages?

The manifest shows Spanish keywords (`"descargar"`) suggesting awareness, but no systematic approach.

**Suggestion:** Define i18n strategy for manifests and runtime messages.

### 15. Mobile/Touch Considerations

A "cursor" metaphor is desktop-centric. On mobile:

- There's no cursor to show
- Touch targets are different from click targets
- Screen real estate for tooltips is limited

**Suggestion:** Define how visual guidance adapts to touch devices (highlight rings? pulsing elements? overlay arrows?).

### 16. Offline Behavior

What happens when:

- The backend is unreachable?
- The manifest fails to load?
- The user is on a slow connection?

**Suggestion:** Define graceful degradation behavior and offline-capable features (manifest caching, queued queries).

---

## Conclusion

The Clippi design document is thorough and well-reasoned for a v1 specification. The core concept is sound and addresses a real gap in the market.

The main risks are:

1. **Scope creep** - v1 includes a lot; consider phasing
2. **Backend burden** - Developers need more support here
3. **Manifest maintenance** - The ongoing cost of keeping manifests current is undersold
4. **Edge cases** - MutationObserver, security, accessibility need more depth

The "guide only, don't execute" principle is the right call for v1 and should remain firm. The temptation to add "just click for them" will be strong but should be resisted until the core experience is solid.

**Recommended immediate actions:**

1. Build a minimal spike (core + cursor + manual manifest) to validate assumptions
2. Define success metrics for manifest coverage and fallback rates
3. Create a reference backend implementation
4. Add accessibility requirements to the spec
