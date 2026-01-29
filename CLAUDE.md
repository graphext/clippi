# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clippi is an open-source library combining conversational chat with visual cursor guidance. Instead of text-based documentation responses, it shows a ghost cursor (Figma multiplayer style) that guides users through the interface.

**Current Status:** Design complete (see PLAN.md), pending implementation. Using phased release: v0.1 (core + manual manifest) → v1.0 (automation + fallbacks).

## Architecture

### Three-Phase Design

1. **Setup (one-time):** AI Agent + Browser Use generates manifest automatically; Chrome Extension for manual recording fallback
2. **Runtime (production):** User asks → Manifest match → cursor guides visually → Vision fallback → Docs RAG fallback
3. **v1 Principle:** Guide only, never execute (no action execution, permissions, or rollback complexity)

### Package Structure (Monorepo)

```
clippi/
├── packages/
│   ├── core/          # Logic: manifest, conditions, step sequencer (~10kb, zero deps)
│   ├── cursor/        # Visual: ghost cursor, tooltips (~5kb, zero deps)
│   ├── chat/          # <clippi-chat /> Web Component (uses core + cursor)
│   ├── cli/           # Node CLI (Commander)
│   └── extension/     # Chrome extension (Manifest V3)
├── agent/             # Python manifest generator (Browser Use)
├── apps/docs/         # Documentation
└── examples/
```

**Dependency graph:** `@clippi/chat` → `@clippi/core`, `@clippi/chat` → `@clippi/cursor` → `@clippi/core`

### Key Technical Decisions

- **Vanilla TypeScript** for browser packages (zero runtime dependencies)
- **Web Components** for the chat widget (framework-agnostic, Shadow DOM encapsulation)
- **pnpm workspaces** for monorepo management
- **tsup/rollup** for builds (ESM + CJS + IIFE)
- **sessionStorage** for persistence (not beforeunload - Mobile Safari incompatible)
- **Backend proxy mandatory** - never put LLM API keys in browser

## Build Commands (Planned)

```bash
# Package manager
pnpm install

# CLI commands (v0.1)
npx clippi init                     # Bootstrap project
npx clippi validate                 # Validate selectors (CI-friendly)
npx clippi serve                    # Dev server with hot reload

# CLI commands (v1.0+)
npx clippi generate --tasks ./file  # Auto-generate manifest via agent
npx clippi build                    # Generate guide.context.json from manifest
```

## Core Concepts

### Manifest Files

- `guide.manifest.json` - Full schema (selectors, paths, conditions)
- `guide.context.json` - Reduced version for LLM (auto-generated, contains only id/label/description/keywords/category)

### Selector Strategies (priority order)

1. `testId` (most stable) - `data-testid="..."`
2. `aria` - `aria-label="..."`
3. `css` - CSS selectors
4. `text` - Visible text + tag (fragile fallback)

### Actionability Checks (Playwright-inspired)

1. Attached (exists in DOM)
2. Visible (not display:none, visibility:hidden, opacity:0)
3. Has size (width/height > 0)
4. Enabled (not disabled)
5. In viewport
6. Not covered (elementFromPoint check)

### Conditions System

**Safe DSL (recommended):**
```javascript
"conditions": "plan:pro"                              // Simple
"conditions": "and:[plan:pro,permission:data:export]" // Logical AND
"conditions": "or:[plan:pro,plan:enterprise]"         // Logical OR
```

**JS functions (advanced):** Available but manifests must be served from trusted sources (same-origin or CDN with SRI).

Context includes: plan, permissions, business state, feature flags.

### Integration Levels

1. **Widget:** `<clippi-chat />` + manifest + endpoint
2. **Headless:** Your chat + `@clippi/core` + `@clippi/cursor`
3. **Logic only:** `@clippi/core` with custom cursor
4. **Full custom:** All hooks and options

### Backend Contract

```typescript
// POST /api/clippi/chat
Response: { action: 'guide' | 'blocked' | 'text', ... }
```

## LLM Configuration

- **Setup (agent):** Gemini 3 Flash default (~$0.50-1.50 for 20 flows)
- **Runtime:** Developer's choice via backend proxy
- API key via environment: `GEMINI_API_KEY`

## Event Hooks

```javascript
Clippi.on('beforeGuide', (step) => { })
Clippi.on('stepCompleted', (step) => { })
Clippi.on('blocked', (step, reason) => { })  // Upsell opportunity
Clippi.on('fallback', (type) => { })         // 'vision' | 'docs'
```

## Theming

9 CSS custom properties: `--clippi-primary`, `--clippi-background`, `--clippi-foreground`, etc.
Presets: `'light'`, `'dark'`, `'auto'` (prefers-color-scheme).

## Testing

```javascript
import { createMockClippi } from '@clippi/core/testing'
// Mock mode for unit tests - no LLM calls, deterministic responses
```

CLI validation: `clippi validate`, `clippi validate --flows`, `clippi validate --e2e`

## Reference Backend

`/examples/backend-node/` provides a working Express implementation (~150 lines) with OpenAI/Anthropic/Gemini support.
