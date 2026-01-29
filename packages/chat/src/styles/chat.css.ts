/**
 * Chat widget styles with CSS custom properties for theming
 * Uses Shadow DOM encapsulation with ::part() for customization
 */
export const chatStyles = `
:host {
  --clippi-primary: #6366f1;
  --clippi-primary-foreground: #ffffff;
  --clippi-background: #ffffff;
  --clippi-foreground: #1f2937;
  --clippi-muted: #f3f4f6;
  --clippi-muted-foreground: #6b7280;
  --clippi-border: #e5e7eb;
  --clippi-radius: 8px;
  --clippi-font: system-ui, -apple-system, sans-serif;

  font-family: var(--clippi-font);
  font-size: 14px;
  line-height: 1.5;
}

/* Container */
.clippi-chat-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999990;
}

/* FAB Button */
.clippi-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--clippi-primary);
  color: var(--clippi-primary-foreground);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.clippi-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.clippi-fab:active {
  transform: scale(0.98);
}

.clippi-fab svg {
  width: 24px;
  height: 24px;
}

.clippi-fab.hidden {
  display: none;
}

/* Panel */
.clippi-panel {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 380px;
  max-width: calc(100vw - 48px);
  height: 500px;
  max-height: calc(100vh - 120px);
  background: var(--clippi-background);
  border: 1px solid var(--clippi-border);
  border-radius: calc(var(--clippi-radius) + 4px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.clippi-panel.open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

/* Header */
.clippi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--clippi-border);
  background: var(--clippi-muted);
}

.clippi-header-title {
  font-weight: 600;
  color: var(--clippi-foreground);
}

.clippi-header-close {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--clippi-muted-foreground);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.clippi-header-close:hover {
  background-color: var(--clippi-border);
  color: var(--clippi-foreground);
}

/* Messages */
.clippi-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.clippi-message {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: var(--clippi-radius);
  word-wrap: break-word;
}

.clippi-message.user {
  align-self: flex-end;
  background: var(--clippi-primary);
  color: var(--clippi-primary-foreground);
}

.clippi-message.assistant {
  align-self: flex-start;
  background: var(--clippi-muted);
  color: var(--clippi-foreground);
}

/* Typing indicator */
.clippi-typing {
  align-self: flex-start;
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: var(--clippi-muted);
  border-radius: var(--clippi-radius);
}

.clippi-typing-dot {
  width: 8px;
  height: 8px;
  background: var(--clippi-muted-foreground);
  border-radius: 50%;
  animation: clippi-typing-bounce 1.4s infinite ease-in-out both;
}

.clippi-typing-dot:nth-child(1) { animation-delay: -0.32s; }
.clippi-typing-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes clippi-typing-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Input area */
.clippi-input-area {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--clippi-border);
  background: var(--clippi-background);
}

.clippi-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--clippi-border);
  border-radius: var(--clippi-radius);
  background: var(--clippi-background);
  color: var(--clippi-foreground);
  font-family: inherit;
  font-size: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.clippi-input:focus {
  border-color: var(--clippi-primary);
}

.clippi-input::placeholder {
  color: var(--clippi-muted-foreground);
}

.clippi-send {
  padding: 10px 16px;
  background: var(--clippi-primary);
  color: var(--clippi-primary-foreground);
  border: none;
  border-radius: var(--clippi-radius);
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.clippi-send:hover {
  opacity: 0.9;
}

.clippi-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Welcome message */
.clippi-welcome {
  text-align: center;
  padding: 24px;
  color: var(--clippi-muted-foreground);
}

.clippi-welcome-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  color: var(--clippi-primary);
}

.clippi-welcome-title {
  font-weight: 600;
  color: var(--clippi-foreground);
  margin-bottom: 8px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .clippi-fab,
  .clippi-panel,
  .clippi-input {
    transition: opacity 0.15s ease !important;
  }

  .clippi-typing-dot {
    animation: none;
    opacity: 0.5;
  }
}
`

/**
 * Chat icon SVG
 */
export const chatIconSvg = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

/**
 * Close icon SVG
 */
export const closeIconSvg = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

/**
 * Clippi logo icon SVG
 */
export const clippiIconSvg = `
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="20" fill="currentColor" fill-opacity="0.1"/>
  <path d="M14 12L34 24L24 26L20 36L14 12Z" fill="currentColor"/>
</svg>
`
