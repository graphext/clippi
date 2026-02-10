/**
 * Content script - runs in the context of web pages
 * Captures user interactions and sends them to the service worker
 */

import {
  extractSelectors,
  describeElement,
} from "../recorder/selector-extractor.js";
import { StepSequencer, resolveSelector } from "@clippi/core";
import { Cursor } from "@clippi/cursor";
import { convertTarget } from "../recorder/manifest-builder.js";
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  RecordedTarget,
  Selector,
} from "../types/messages.js";

// State
let isRecording = false;
let highlightedElement: Element | null = null;
let highlightOverlay: HTMLElement | null = null;
let contextInvalidated = false;

// Track last URL for change detection
let lastUrl = window.location.href;

// Preview state
let previewCursor: Cursor | null = null;
let previewSequencer: StepSequencer | null = null;

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
  stopPreview();
}

// Track recent clicks to deduplicate between pointerdown and click
let lastRecordedClick = { target: null as Element | null, time: 0 };

/**
 * Record a click on an interactive element.
 * Shared by both handleClick and handlePointerDown.
 */
function recordClick(rawTarget: Element): void {
  if (!isRecording || contextInvalidated) return;

  // Don't capture clicks on extension UI
  if (isExtensionElement(rawTarget)) return;

  // Find the interactive element: use the click target itself, or walk up
  // the DOM to find the nearest interactive ancestor (handles clicks on
  // text/icons inside custom components like select triggers)
  const target = findInteractiveElement(rawTarget);
  if (!target) return;

  // Deduplicate: skip if we recorded the same element very recently
  // (handles pointerdown + click firing on the same interaction)
  const now = Date.now();
  if (
    lastRecordedClick.target === target &&
    now - lastRecordedClick.time < 500
  ) {
    return;
  }
  lastRecordedClick = { target, time: now };

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
 * Handle click events during recording
 */
function handleClick(event: MouseEvent): void {
  const rawTarget = event.target as Element;
  if (rawTarget) recordClick(rawTarget);
}

/**
 * Handle pointerdown events during recording
 * Catches interactions that some frameworks (e.g. Radix) intercept
 * before a click event fires (via preventDefault on pointerdown)
 */
function handlePointerDown(event: PointerEvent): void {
  // Only handle primary button (left click)
  if (event.button !== 0) return;
  const rawTarget = event.target as Element;
  if (rawTarget) recordClick(rawTarget);
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
    (
      target as Element & {
        _clippiInputTimeout?: ReturnType<typeof setTimeout>;
      }
    )._clippiInputTimeout,
  );
  (
    target as Element & { _clippiInputTimeout?: ReturnType<typeof setTimeout> }
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
    "combobox",
    "listbox",
    "switch",
    "treeitem",
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
 * Walk up the DOM from the clicked element to find the nearest interactive element.
 * Returns the element itself if it's interactive, or the first interactive ancestor,
 * stopping at <body>. Returns null if no interactive element is found.
 */
function findInteractiveElement(element: Element): Element | null {
  let current: Element | null = element;

  while (current && current !== document.body) {
    if (isInteractiveElement(current)) return current;
    current = current.parentElement;
  }

  return null;
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

  const result = resolveSelector(selector);
  if (result.element) {
    highlightedElement = result.element;
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

// ============================================================
// Preview Player - Uses @clippi/cursor to play target steps
// ============================================================

/**
 * Preview a target's steps using StepSequencer + Cursor
 * (same flow as production - waits for real success conditions)
 */
async function previewTarget(target: RecordedTarget): Promise<void> {
  stopPreview();

  if (target.steps.length === 0) return;

  // Wait for viewport to stabilize after sidepanel interaction
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Convert to ManifestTarget (same format production uses)
  const manifestTarget = convertTarget(target);

  previewCursor = Cursor.init({ theme: "auto" });
  previewSequencer = new StepSequencer({ confirmationTimeout: 10000 });

  // Wire cursor to sequencer events
  previewSequencer.on("beforeGuide", (step) => {
    previewCursor?.pointTo(step.domElement, {
      instruction: step.instruction,
      stepIndex: step.stepIndex,
      totalSteps: step.totalSteps,
      onCancel: () => stopPreview(),
      onConfirm: () => previewSequencer?.confirmStep(),
    });
  });

  previewSequencer.on("flowCompleted", () => {
    stopPreview();
    notifyPreviewEnded();
  });

  previewSequencer.on("flowAbandoned", () => {
    stopPreview();
    notifyPreviewEnded();
  });

  // Start the flow
  previewSequencer.start(manifestTarget);
}

/**
 * Notify background that preview has ended (so sidepanel can reset UI)
 */
function notifyPreviewEnded(): void {
  if (!isContextValid()) return;
  chrome.runtime.sendMessage({ type: "PREVIEW_ENDED" }).catch(() => {});
}

/**
 * Stop any running preview
 */
function stopPreview(): void {
  if (previewSequencer) {
    previewSequencer.destroy();
    previewSequencer = null;
  }
  if (previewCursor) {
    previewCursor.destroy();
    previewCursor = null;
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

    case "PREVIEW_TARGET":
      previewTarget(
        (
          message as {
            type: "PREVIEW_TARGET";
            payload: { target: RecordedTarget };
          }
        ).payload.target,
      );
      break;

    case "STOP_PREVIEW":
      stopPreview();
      break;
  }
  return false;
}

// Initialize
function init(): void {
  // Event listeners
  document.addEventListener("click", handleClick, { capture: true });
  document.addEventListener("pointerdown", handlePointerDown, {
    capture: true,
  });
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
