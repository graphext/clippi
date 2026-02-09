/**
 * Background service worker - manages extension state and coordinates
 * communication between content script and side panel
 */

import type {
  RecorderState,
  RecordedTarget,
  RecordedStep,
  ContentToBackgroundMessage,
  SidePanelToBackgroundMessage,
  BackgroundToSidePanelMessage,
  BackgroundToContentMessage,
} from "../types/messages.js";
import { buildManifest } from "../recorder/manifest-builder.js";

// State
let state: RecorderState = {
  recordingState: "idle",
  currentTargetId: null,
  currentDomain: null,
  targets: [],
};

// Promise that resolves when state is loaded
let stateLoaded: Promise<void>;

// Load state from storage on startup
async function loadState(): Promise<void> {
  const stored = await chrome.storage.local.get("clippiRecorderState");
  if (stored.clippiRecorderState) {
    state = stored.clippiRecorderState;
    // Reset recording state on reload (don't persist active recording)
    state.recordingState = "idle";
    state.currentTargetId = null;
  }
}

// Save state to storage
async function saveState(): Promise<void> {
  await chrome.storage.local.set({ clippiRecorderState: state });
}

// Broadcast state to side panel
function broadcastState(): void {
  const message: BackgroundToSidePanelMessage = {
    type: "STATE_UPDATED",
    payload: state,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be open
  });
}

// Inject content script into a tab if not already injected
async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    // Try to ping the content script to see if it's already loaded
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return true;
  } catch {
    // Content script not loaded, inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content-script.js"],
      });
      return true;
    } catch (error) {
      console.error("[Clippi] Failed to inject content script:", error);
      return false;
    }
  }
}

// Send message to content script in active tab
async function sendToContentScript(
  message: BackgroundToContentMessage,
): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {
      // Content script might not be loaded
    });
  }
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Handle messages from content script
function handleContentMessage(
  message: ContentToBackgroundMessage,
  _sender: chrome.runtime.MessageSender,
): void {
  if (state.recordingState !== "recording" || !state.currentTargetId) {
    return;
  }

  const target = state.targets.find((t) => t.id === state.currentTargetId);
  if (!target) return;

  if (message.type === "ELEMENT_CLICKED") {
    const step: RecordedStep = {
      id: generateId(),
      selector: message.payload.selector,
      action: "click",
      instruction: `Click on "${message.payload.innerText.slice(0, 50) || message.payload.tagName}"`,
      timestamp: Date.now(),
    };

    target.steps.push(step);
    target.updatedAt = Date.now();
    saveState();
    broadcastState();

    // Notify side panel of new step
    const stepMessage: BackgroundToSidePanelMessage = {
      type: "STEP_RECORDED",
      payload: { targetId: target.id, step },
    };
    chrome.runtime.sendMessage(stepMessage).catch(() => {});
  }

  if (message.type === "ELEMENT_INPUT") {
    const step: RecordedStep = {
      id: generateId(),
      selector: message.payload.selector,
      action: "type",
      input: message.payload.value,
      instruction: `Type "${message.payload.value.slice(0, 30)}" in the ${message.payload.tagName.toLowerCase()} field`,
      timestamp: Date.now(),
    };

    target.steps.push(step);
    target.updatedAt = Date.now();
    saveState();
    broadcastState();

    const stepMessage: BackgroundToSidePanelMessage = {
      type: "STEP_RECORDED",
      payload: { targetId: target.id, step },
    };
    chrome.runtime.sendMessage(stepMessage).catch(() => {});
  }

  if (message.type === "URL_CHANGED") {
    // Add URL change as success condition to last step
    const lastStep = target.steps[target.steps.length - 1];
    if (lastStep) {
      lastStep.successCondition = {
        urlContains: new URL(message.payload.url).pathname,
      };
      saveState();
      broadcastState();
    }
  }
}

// Handle messages from side panel
async function handleSidePanelMessage(
  message: SidePanelToBackgroundMessage,
): Promise<BackgroundToSidePanelMessage | void> {
  // Ensure state is loaded before processing any message
  await stateLoaded;

  switch (message.type) {
    case "GET_STATE": {
      // Update current domain from active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      state.currentDomain = tab?.url ? new URL(tab.url).hostname : null;
      return { type: "STATE_UPDATED", payload: state };
    }

    case "START_RECORDING": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        return { type: "ERROR", payload: { message: "No active tab found" } };
      }

      const injected = await ensureContentScriptInjected(tab.id);
      if (!injected) {
        return {
          type: "ERROR",
          payload: { message: "Failed to inject content script" },
        };
      }

      state.recordingState = "recording";
      state.currentTargetId = message.payload.targetId;
      await saveState();
      broadcastState();
      await sendToContentScript({ type: "START_RECORDING" });
      break;
    }

    case "STOP_RECORDING": {
      state.recordingState = "idle";
      state.currentTargetId = null;
      await saveState();
      broadcastState();
      await sendToContentScript({ type: "STOP_RECORDING" });
      break;
    }

    case "PAUSE_RECORDING": {
      state.recordingState = "paused";
      await saveState();
      broadcastState();
      await sendToContentScript({ type: "PAUSE_RECORDING" });
      break;
    }

    case "RESUME_RECORDING": {
      state.recordingState = "recording";
      await saveState();
      broadcastState();
      await sendToContentScript({ type: "START_RECORDING" });
      break;
    }

    case "CREATE_TARGET": {
      // Get current tab's domain
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const domain = tab?.url ? new URL(tab.url).hostname : "unknown";

      const newTarget: RecordedTarget = {
        id: message.payload.id || generateId(),
        label: message.payload.label || "New Target",
        description: message.payload.description || "",
        keywords: message.payload.keywords || [],
        category: message.payload.category || "general",
        domain: message.payload.domain || domain,
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.targets.push(newTarget);
      await saveState();
      broadcastState();
      return { type: "STATE_UPDATED", payload: state };
    }

    case "UPDATE_TARGET": {
      const target = state.targets.find((t) => t.id === message.payload.id);
      if (target) {
        Object.assign(target, message.payload.updates, {
          updatedAt: Date.now(),
        });
        await saveState();
        broadcastState();
      }
      break;
    }

    case "DELETE_TARGET": {
      state.targets = state.targets.filter((t) => t.id !== message.payload.id);
      if (state.currentTargetId === message.payload.id) {
        state.currentTargetId = null;
        state.recordingState = "idle";
      }
      await saveState();
      broadcastState();
      break;
    }

    case "UPDATE_STEP": {
      const target = state.targets.find(
        (t) => t.id === message.payload.targetId,
      );
      if (target) {
        const step = target.steps.find((s) => s.id === message.payload.stepId);
        if (step) {
          Object.assign(step, message.payload.updates);
          target.updatedAt = Date.now();
          await saveState();
          broadcastState();
        }
      }
      break;
    }

    case "DELETE_STEP": {
      const target = state.targets.find(
        (t) => t.id === message.payload.targetId,
      );
      if (target) {
        target.steps = target.steps.filter(
          (s) => s.id !== message.payload.stepId,
        );
        target.updatedAt = Date.now();
        await saveState();
        broadcastState();
      }
      break;
    }

    case "EXPORT_MANIFEST": {
      const manifest = buildManifest(state.targets);
      return {
        type: "EXPORT_READY",
        payload: { json: JSON.stringify(manifest, null, 2) },
      };
    }

    case "IMPORT_MANIFEST": {
      try {
        const imported = JSON.parse(message.payload.json);
        // TODO: Convert imported manifest targets to RecordedTarget format
        // For now, just validate it's a valid manifest
        if (!imported.targets || !Array.isArray(imported.targets)) {
          return {
            type: "ERROR",
            payload: { message: "Invalid manifest: missing targets array" },
          };
        }
        // Import logic would go here
        return { type: "STATE_UPDATED", payload: state };
      } catch {
        return { type: "ERROR", payload: { message: "Invalid JSON" } };
      }
    }
  }
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Determine message source and handle appropriately
  if (sender.tab) {
    // Message from content script
    handleContentMessage(message as ContentToBackgroundMessage, sender);
  } else {
    // Message from side panel
    handleSidePanelMessage(message as SidePanelToBackgroundMessage).then(
      (response) => {
        if (response) {
          sendResponse(response);
        }
      },
    );
    return true; // Keep channel open for async response
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Update current domain when tab changes and broadcast to sidepanel
async function updateCurrentDomain(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const newDomain = tab?.url ? new URL(tab.url).hostname : null;
  if (newDomain !== state.currentDomain) {
    state.currentDomain = newDomain;
    broadcastState();
  }
}

chrome.tabs.onActivated.addListener(() => {
  updateCurrentDomain();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url) {
    updateCurrentDomain();
  }
});

// Initialize
stateLoaded = loadState();
