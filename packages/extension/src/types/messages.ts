/**
 * Message types for communication between extension components
 * (content script <-> service worker <-> side panel)
 */

// Selector strategy types (matching @clippi/core)
export type SelectorType = "testId" | "aria" | "css" | "text";

export interface SelectorStrategy {
  type: SelectorType;
  value: string;
  tag?: string; // For 'text' strategy
}

export interface Selector {
  strategies: SelectorStrategy[];
}

// Step types
export type ActionType = "click" | "type" | "select" | "clear";

export interface RecordedStep {
  id: string;
  selector: Selector;
  action: ActionType;
  input?: string; // For 'type' and 'select' actions
  instruction: string;
  timestamp: number;
  // Success condition (auto-generated during recording, user can edit)
  successCondition?: {
    urlContains?: string;
    visible?: string | Selector;
    exists?: string;
    click?: boolean;
    value?: {
      selector: string | Selector;
      equals?: string;
      contains?: string;
      not_empty?: boolean;
    };
  };
}

// Target (flow) types
export interface RecordedTarget {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  category: string;
  domain: string; // The domain this target belongs to (e.g., "example.com")
  steps: RecordedStep[];
  createdAt: number;
  updatedAt: number;
}

// Recording state
export type RecordingState = "idle" | "recording" | "paused";

export interface RecorderState {
  recordingState: RecordingState;
  currentTargetId: string | null;
  currentDomain: string | null; // The domain of the active tab
  targets: RecordedTarget[];
}

// Messages from content script to service worker
export type ContentToBackgroundMessage =
  | { type: "ELEMENT_CLICKED"; payload: ElementClickedPayload }
  | { type: "ELEMENT_INPUT"; payload: ElementInputPayload }
  | { type: "URL_CHANGED"; payload: { url: string } }
  | { type: "PREVIEW_ENDED" };

export interface ElementClickedPayload {
  selector: Selector;
  tagName: string;
  innerText: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface ElementInputPayload {
  selector: Selector;
  tagName: string;
  value: string;
  inputType?: string;
}

// Messages from service worker to content script
export type BackgroundToContentMessage =
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "PAUSE_RECORDING" }
  | { type: "HIGHLIGHT_ELEMENT"; payload: { selector: Selector } }
  | { type: "CLEAR_HIGHLIGHT" }
  | { type: "PREVIEW_TARGET"; payload: { target: RecordedTarget } }
  | { type: "STOP_PREVIEW" };

// Messages from side panel to service worker
export type SidePanelToBackgroundMessage =
  | { type: "GET_STATE" }
  | { type: "START_RECORDING"; payload: { targetId: string } }
  | { type: "STOP_RECORDING" }
  | { type: "PAUSE_RECORDING" }
  | { type: "RESUME_RECORDING" }
  | { type: "CREATE_TARGET"; payload: Partial<RecordedTarget> }
  | {
      type: "UPDATE_TARGET";
      payload: { id: string; updates: Partial<RecordedTarget> };
    }
  | { type: "DELETE_TARGET"; payload: { id: string } }
  | {
      type: "UPDATE_STEP";
      payload: {
        targetId: string;
        stepId: string;
        updates: Partial<RecordedStep>;
      };
    }
  | { type: "DELETE_STEP"; payload: { targetId: string; stepId: string } }
  | { type: "EXPORT_MANIFEST" }
  | { type: "IMPORT_MANIFEST"; payload: { json: string } }
  | { type: "PREVIEW_TARGET"; payload: { targetId: string } }
  | { type: "STOP_PREVIEW" };

// Messages from service worker to side panel
export type BackgroundToSidePanelMessage =
  | { type: "STATE_UPDATED"; payload: RecorderState }
  | { type: "STEP_RECORDED"; payload: { targetId: string; step: RecordedStep } }
  | { type: "EXPORT_READY"; payload: { json: string } }
  | { type: "ERROR"; payload: { message: string } }
  | { type: "PREVIEW_ENDED" };

// Union type for all messages
export type ExtensionMessage =
  | ContentToBackgroundMessage
  | BackgroundToContentMessage
  | SidePanelToBackgroundMessage
  | BackgroundToSidePanelMessage;
