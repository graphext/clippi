import type { ManifestTarget, PathStep } from './manifest.js'
import type { ConditionResult } from './conditions.js'

/**
 * Information about the current step being guided
 */
export interface StepInfo {
  /** The manifest target being guided to */
  target: ManifestTarget
  /** Current step index (0-based) */
  stepIndex: number
  /** Total number of steps */
  totalSteps: number
  /** The current path step */
  step: PathStep
  /** The DOM element resolved */
  domElement: Element | null
  /** Instruction to display */
  instruction: string
}

/**
 * Information about a flow (multi-step guidance)
 */
export interface FlowInfo {
  /** The manifest target ID */
  targetId: string
  /** The manifest target */
  target: ManifestTarget
  /** When the flow started */
  startedAt: number
}

/**
 * Event types and their payloads
 */
export interface ClippiEvents {
  /** Before starting to guide to a target */
  beforeGuide: (step: StepInfo) => void
  /** After a step is completed */
  stepCompleted: (step: StepInfo) => void
  /** When a flow starts */
  flowStarted: (flow: FlowInfo) => void
  /** When a flow completes all steps */
  flowCompleted: (flow: FlowInfo, duration: number) => void
  /** When a flow is abandoned/cancelled */
  flowAbandoned: (flow: FlowInfo, step: StepInfo, reason: string) => void
  /** When access is blocked due to conditions */
  blocked: (target: ManifestTarget, result: ConditionResult) => void
  /** When a fallback is used (vision or docs) */
  fallback: (type: 'vision' | 'docs', query: string) => void
  /** When an error occurs */
  error: (error: Error) => void
  /** When the session is recovered */
  sessionRecovered: (flow: FlowInfo, stepIndex: number) => void
}

/**
 * Event handler type
 */
export type ClippiEventHandler<K extends keyof ClippiEvents> = ClippiEvents[K]
