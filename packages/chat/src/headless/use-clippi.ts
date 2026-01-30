import {
  Clippi,
  type ClippiConfig,
  type ChatMessage,
  type ChatResponse,
  type StepInfo,
  type FlowInfo,
  type ManifestTarget,
  type ClippiEventHandler,
  type ClippiEvents,
} from '@clippi/core'
import { Cursor, type CursorConfig, type ThemeOption } from '@clippi/cursor'

/**
 * Headless Clippi configuration
 */
export interface HeadlessClippiConfig extends ClippiConfig {
  /** Cursor configuration */
  cursor?: CursorConfig
  /** Theme for cursor */
  theme?: ThemeOption
}

/**
 * Headless Clippi API
 */
export interface HeadlessClippi {
  /** The underlying Clippi instance */
  clippi: Clippi
  /** The Cursor instance */
  cursor: Cursor
  /** Ask a question */
  ask: (query: string) => Promise<ChatResponse>
  /** Guide to a target by ID */
  guide: (targetId: string) => Promise<ManifestTarget | null>
  /** Cancel the current flow */
  cancel: () => void
  /** Manually confirm the current step */
  confirmStep: () => void
  /** Get conversation history */
  getMessages: () => ChatMessage[]
  /** Clear conversation history */
  clearMessages: () => void
  /** Get current flow info */
  getCurrentFlow: () => FlowInfo | null
  /** Get current step info */
  getCurrentStep: () => StepInfo | null
  /** Subscribe to events */
  on: <K extends keyof ClippiEvents>(event: K, handler: ClippiEventHandler<K>) => () => void
  /** Destroy and clean up */
  destroy: () => void
}

/**
 * Create a headless Clippi instance
 *
 * Use this when you want to use your own chat UI but still leverage
 * Clippi's core logic and cursor.
 *
 * @param config Headless configuration
 * @returns Promise resolving to HeadlessClippi API
 *
 * @example
 * ```ts
 * const { ask, guide, cancel, on, destroy } = await createHeadlessClippi({
 *   manifest: '/guide.manifest.json',
 *   llm: { endpoint: '/api/clippi/chat' },
 *   theme: 'auto',
 * })
 *
 * // In your chat UI
 * const response = await ask('How do I export data?')
 * if (response.action === 'guide') {
 *   // Cursor is automatically shown
 * }
 *
 * on('flowCompleted', (flow, duration) => {
 *   console.log(`Flow ${flow.targetId} completed in ${duration}ms`)
 * })
 * ```
 */
export async function createHeadlessClippi(config: HeadlessClippiConfig): Promise<HeadlessClippi> {
  // Initialize cursor
  const cursor = Cursor.init({
    theme: config.theme ?? 'auto',
    ...config.cursor,
  })

  // Initialize Clippi
  const clippi = await Clippi.init(config)

  // Wire up cursor to Clippi events
  clippi.on('beforeGuide', (step) => {
    cursor.pointTo(step.domElement, {
      instruction: step.instruction,
      stepIndex: step.stepIndex,
      totalSteps: step.totalSteps,
      onCancel: () => {
        clippi.cancel()
        cursor.hide()
      },
      onConfirm: () => {
        clippi.confirmStep()
      },
    })
  })

  clippi.on('flowCompleted', () => {
    cursor.hide()
  })

  clippi.on('flowAbandoned', () => {
    cursor.hide()
  })

  return {
    clippi,
    cursor,
    ask: (query: string) => clippi.ask(query),
    guide: (targetId: string) => clippi.guide(targetId),
    cancel: () => {
      clippi.cancel()
      cursor.hide()
    },
    confirmStep: () => clippi.confirmStep(),
    getMessages: () => clippi.getMessages(),
    clearMessages: () => clippi.clearMessages(),
    getCurrentFlow: () => clippi.getCurrentFlow(),
    getCurrentStep: () => clippi.getCurrentStep(),
    on: (event, handler) => clippi.on(event, handler),
    destroy: () => {
      clippi.destroy()
      cursor.destroy()
    },
  }
}
