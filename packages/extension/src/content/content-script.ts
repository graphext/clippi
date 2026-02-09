/**
 * Content script - runs in the context of web pages
 * Captures user interactions and sends them to the service worker
 */

import {
  extractSelectors,
  describeElement,
} from "../recorder/selector-extractor.js";
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  Selector,
} from "../types/messages.js";

// State
let isRecording = false;
let highlightedElement: Element | null = null;
let highlightOverlay: HTMLElement | null = null;
let contextInvalidated = false;

// Track last URL for change detection
let lastUrl = window.location.href;

/**
 * Check if extension context is still valid
 */
function isContextValid(): boolean {
  try {
    return !contextInvalidated && !!chrome.runtime?.id;
  } catch {
    contextInvalidated = true;
    return false;
  }
}

/**
 * Send message to background service worker
 */
function sendToBackground(message: ContentToBackgroundMessage): void {
  if (!isContextValid()) return;

  chrome.runtime.sendMessage(message).catch((error) => {
    if (error?.message?.includes("Extension context invalidated")) {
      contextInvalidated = true;
      cleanup();
    }
  });
}

/**
 * Cleanup when context is invalidated
 */
function cleanup(): void {
  isRecording = false;
  document.body.style.cursor = "";
  clearHighlight();
}

/**
 * Handle click events during recording
 */
function handleClick(event: MouseEvent): void {
  if (!isRecording || contextInvalidated) return;

  const target = event.target as Element;
  if (!target || !isInteractiveElement(target)) return;

  // Don't capture clicks on extension UI
  if (isExtensionElement(target)) return;

  const selector = extractSelectors(target);
  const rect = target.getBoundingClientRect();

  sendToBackground({
    type: "ELEMENT_CLICKED",
    payload: {
      selector,
      tagName: target.tagName,
      innerText: describeElement(target),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    },
  });

  // Visual feedback
  flashElement(target);
}

/**
 * Handle input events (for text fields)
 */
function handleInput(event: Event): void {
  if (!isRecording || contextInvalidated) return;

  const target = event.target as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;
  if (!target) return;

  // Debounce input events
  clearTimeout(
    (target as Element & { _clippiInputTimeout?: NodeJS.Timeout })
      ._clippiInputTimeout,
  );
  (
    target as Element & { _clippiInputTimeout?: NodeJS.Timeout }
  )._clippiInputTimeout = setTimeout(() => {
    const selector = extractSelectors(target);

    sendToBackground({
      type: "ELEMENT_INPUT",
      payload: {
        selector,
        tagName: target.tagName,
        value: target.value,
        inputType: (target as HTMLInputElement).type,
      },
    });
  }, 500);
}

/**
 * Monitor URL changes (for SPAs)
 */
function monitorUrlChanges(): void {
  const intervalId = setInterval(() => {
    if (contextInvalidated) {
      clearInterval(intervalId);
      return;
    }
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (isRecording) {
        sendToBackground({
          type: "URL_CHANGED",
          payload: { url: lastUrl },
        });
      }
    }
  }, 500);
}

/**
 * Check if an element is interactive
 */
function isInteractiveElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const interactiveTags = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "label",
    "summary",
  ];

  if (interactiveTags.includes(tagName)) return true;

  // Check for role
  const role = element.getAttribute("role");
  const interactiveRoles = [
    "button",
    "link",
    "checkbox",
    "radio",
    "tab",
    "menuitem",
    "option",
  ];
  if (role && interactiveRoles.includes(role)) return true;

  // Check for click handlers or cursor style
  const style = getComputedStyle(element);
  if (style.cursor === "pointer") return true;

  // Check for tabindex
  if (element.hasAttribute("tabindex")) return true;

  return false;
}

/**
 * Check if element belongs to extension UI
 */
function isExtensionElement(element: Element): boolean {
  return element.closest("[data-clippi-extension]") !== null;
}

/**
 * Flash an element to provide visual feedback
 */
function flashElement(element: Element): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: rgba(99, 102, 241, 0.3);
    border: 2px solid rgb(99, 102, 241);
    border-radius: 4px;
    z-index: 999999;
    transition: opacity 0.3s;
  `;

  const rect = element.getBoundingClientRect();
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;

  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 300);
  }, 200);
}

/**
 * Highlight an element (for preview)
 */
function highlightElement(selector: Selector): void {
  clearHighlight();

  // Try each strategy until one works
  for (const strategy of selector.strategies) {
    let cssSelector: string;

    switch (strategy.type) {
      case "testId":
        cssSelector = `[data-testid="${strategy.value}"]`;
        break;
      case "aria":
        cssSelector = `[aria-label="${strategy.value}"]`;
        break;
      case "css":
        cssSelector = strategy.value;
        break;
      case "text":
        // Text selectors require manual search
        const elements = document.querySelectorAll(strategy.tag || "*");
        for (const el of elements) {
          if (el.textContent?.includes(strategy.value)) {
            highlightedElement = el;
            break;
          }
        }
        continue;
      default:
        continue;
    }

    try {
      const element = document.querySelector(cssSelector);
      if (element) {
        highlightedElement = element;
        break;
      }
    } catch {
      // Invalid selector
    }
  }

  if (highlightedElement) {
    showHighlightOverlay(highlightedElement);
  }
}

/**
 * Show highlight overlay on element
 */
function showHighlightOverlay(element: Element): void {
  highlightOverlay = document.createElement("div");
  highlightOverlay.setAttribute("data-clippi-extension", "true");
  highlightOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: rgba(99, 102, 241, 0.2);
    border: 2px dashed rgb(99, 102, 241);
    border-radius: 4px;
    z-index: 999998;
  `;

  const rect = element.getBoundingClientRect();
  highlightOverlay.style.left = `${rect.left - 2}px`;
  highlightOverlay.style.top = `${rect.top - 2}px`;
  highlightOverlay.style.width = `${rect.width + 4}px`;
  highlightOverlay.style.height = `${rect.height + 4}px`;

  document.body.appendChild(highlightOverlay);
}

/**
 * Clear highlight
 */
function clearHighlight(): void {
  highlightedElement = null;
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
}

/**
 * Handle messages from service worker
 * Returns true if the message requires an async response
 */
function handleMessage(
  message: BackgroundToContentMessage | { type: "PING" },
  sendResponse: (response: unknown) => void,
): boolean {
  switch (message.type) {
    case "PING":
      sendResponse({ type: "PONG" });
      return false;

    case "START_RECORDING":
      isRecording = true;
      document.body.style.cursor = "crosshair";
      break;

    case "STOP_RECORDING":
      isRecording = false;
      document.body.style.cursor = "";
      clearHighlight();
      break;

    case "PAUSE_RECORDING":
      isRecording = false;
      document.body.style.cursor = "";
      break;

    case "HIGHLIGHT_ELEMENT":
      highlightElement(message.payload.selector);
      break;

    case "CLEAR_HIGHLIGHT":
      clearHighlight();
      break;
  }
  return false;
}

// Initialize
function init(): void {
  // Event listeners
  document.addEventListener("click", handleClick, { capture: true });
  document.addEventListener("input", handleInput, { capture: true });
  document.addEventListener("change", handleInput, { capture: true });

  // Message listener
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    return handleMessage(
      message as BackgroundToContentMessage | { type: "PING" },
      sendResponse,
    );
  });

  // URL monitoring
  monitorUrlChanges();

  console.log("[Clippi] Content script loaded");
}

init();
