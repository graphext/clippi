/**
 * CSS styles as template literal (zero dependencies)
 *
 * Uses CSS custom properties for theming.
 * Includes animations and transitions.
 */
export const cursorStyles = `
/* Clippi Cursor Base Styles */

.clippi-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 24px;
  height: 24px;
  pointer-events: none;
  z-index: 999999;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.clippi-cursor.visible {
  opacity: 1;
}

.clippi-cursor svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.clippi-cursor.animating {
  /* Animation handled by JavaScript */
}

/* Tooltip */

.clippi-tooltip {
  position: fixed;
  max-width: 300px;
  padding: 12px 16px;
  background: var(--clippi-background, #ffffff);
  color: var(--clippi-foreground, #1f2937);
  border: 1px solid var(--clippi-border, #e5e7eb);
  border-radius: var(--clippi-radius, 8px);
  font-family: var(--clippi-font, system-ui, -apple-system, sans-serif);
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1),
              0 8px 10px -6px rgba(0, 0, 0, 0.1);
  z-index: 999998;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: auto;
}

.clippi-tooltip.visible {
  opacity: 1;
  transform: translateY(0);
}

.clippi-tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.clippi-tooltip-progress {
  font-size: 12px;
  color: var(--clippi-muted-foreground, #6b7280);
  font-weight: 500;
}

.clippi-tooltip-close {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--clippi-muted-foreground, #6b7280);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.clippi-tooltip-close:hover {
  background-color: var(--clippi-muted, #f3f4f6);
  color: var(--clippi-foreground, #1f2937);
}

.clippi-tooltip-instruction {
  color: var(--clippi-foreground, #1f2937);
  font-weight: 500;
}

.clippi-tooltip-confirmation {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--clippi-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.clippi-tooltip-confirmation-text {
  font-size: 13px;
  color: var(--clippi-muted-foreground, #6b7280);
}

.clippi-tooltip-confirm-btn {
  background: var(--clippi-primary, #6366f1);
  color: var(--clippi-primary-foreground, #ffffff);
  border: none;
  padding: 6px 12px;
  border-radius: calc(var(--clippi-radius, 8px) - 2px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.clippi-tooltip-confirm-btn:hover {
  opacity: 0.9;
}

/* Highlight */

.clippi-highlight {
  position: fixed;
  pointer-events: none;
  z-index: 999997;
  border: 2px solid var(--clippi-primary, #6366f1);
  border-radius: calc(var(--clippi-radius, 8px) + 2px);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.clippi-highlight.visible {
  opacity: 1;
}

.clippi-highlight.pulse {
  animation: clippi-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes clippi-pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.1);
  }
}

/* Reduced motion */

@media (prefers-reduced-motion: reduce) {
  .clippi-tooltip,
  .clippi-highlight {
    transition: opacity 0.2s ease !important;
  }

  .clippi-highlight.pulse {
    animation: none;
  }
}
`

/**
 * Cursor SVG icon (Figma multiplayer style)
 */
export const cursorSvg = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M5.5 3.21L19.5 12.21L12.49 13.73L9.5 21.21L5.5 3.21Z"
        fill="var(--clippi-primary, #6366f1)"
        stroke="white"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"/>
</svg>
`

/**
 * Close icon SVG
 */
export const closeIconSvg = `
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

/**
 * Inject styles into document head (idempotent)
 */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('clippi-styles')) return

  const style = document.createElement('style')
  style.id = 'clippi-styles'
  style.textContent = cursorStyles
  document.head.appendChild(style)
}
