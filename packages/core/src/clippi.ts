import type { Manifest, ManifestTarget } from './types/manifest.js'
import type { UserContext } from './types/conditions.js'
import type { ClippiConfig, ChatRequest, ChatResponse, ChatMessage } from './types/config.js'
import type { StepInfo, FlowInfo } from './types/events.js'
import { EventEmitter } from './events/emitter.js'
import { loadManifest, getContextTargets, findById, findBestMatch } from './manifest/index.js'
import { evaluateCondition } from './conditions/index.js'
import { StepSequencer, type SequencerConfig } from './sequencer/index.js'
import { createPersistence, type SessionPersistence, type NullPersistence } from './persistence/session-storage.js'

/**
 * Clippi initialization state
 */
export type ClippiState = 'uninitialized' | 'initializing' | 'ready' | 'error'

/**
 * Clippi - Visual cursor guidance library
 *
 * Main class that orchestrates manifest loading, condition checking,
 * step sequencing, and event handling.
 */
export class Clippi extends EventEmitter {
  private config: ClippiConfig | null = null
  private manifest: Manifest | null = null
  private sequencer: StepSequencer | null = null
  private persistence: SessionPersistence | NullPersistence | null = null
  private state: ClippiState = 'uninitialized'
  private messages: ChatMessage[] = []
  private debug: boolean = false

  constructor() {
    super()
  }

  /**
   * Get current state
   */
  getState(): ClippiState {
    return this.state
  }

  /**
   * Get loaded manifest
   */
  getManifest(): Manifest | null {
    return this.manifest
  }

  /**
   * Get conversation history
   */
  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  /**
   * Get current flow info
   */
  getCurrentFlow(): FlowInfo | null {
    return this.sequencer?.getCurrentFlow() ?? null
  }

  /**
   * Get current step info
   */
  getCurrentStep(): StepInfo | null {
    return this.sequencer?.getCurrentStep() ?? null
  }

  /**
   * Initialize Clippi with configuration
   *
   * @param config Clippi configuration
   * @returns Promise resolving to this Clippi instance
   */
  async init(config: ClippiConfig): Promise<this> {
    if (this.state === 'initializing') {
      throw new Error('Clippi is already initializing')
    }

    this.state = 'initializing'
    this.config = config
    this.debug = config.debug ?? false

    try {
      // Load manifest
      this.log('Loading manifest...')
      this.manifest = await loadManifest(config.manifest)
      this.log(`Loaded ${this.manifest.targets.length} targets`)

      // Set up persistence
      const persistenceType = config.persistence?.storage ?? 'session'
      this.persistence = createPersistence(persistenceType, config.persistence?.ttl)

      // Set up sequencer
      const sequencerConfig: SequencerConfig = {
        confirmationTimeout: config.timeout ?? 10000,
        onStep: (step) => this.emit('beforeGuide', step),
        onConfirmationNeeded: (step) => {
          // Subclasses or cursor package will handle this
          this.log('Confirmation needed for step', step.instruction)
        },
        onComplete: (flow, duration) => {
          this.persistence?.clear()
          this.emit('flowCompleted', flow, duration)
        },
        onCancel: (flow, step, reason) => {
          this.persistence?.clear()
          this.emit('flowAbandoned', flow, step, reason)
        },
        onDebug: this.debug ? (msg, data) => this.log(msg, data) : undefined,
      }

      this.sequencer = new StepSequencer(sequencerConfig)

      // Forward sequencer events
      this.sequencer.on('flowStarted', (flow) => {
        this.persistence?.save({
          flowId: flow.targetId,
          currentStep: 0,
          startedAt: flow.startedAt,
        })
        this.emit('flowStarted', flow)
      })

      this.sequencer.on('stepCompleted', (step) => {
        this.persistence?.updateStep(step.stepIndex + 1)
        this.emit('stepCompleted', step)
      })

      // Check for saved session
      this.checkSavedSession()

      this.state = 'ready'
      this.log('Clippi initialized')
      return this
    } catch (error) {
      this.state = 'error'
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit('error', err)
      throw err
    }
  }

  /**
   * Check for and potentially recover a saved session
   */
  private checkSavedSession(): void {
    if (!this.persistence || !this.manifest) return

    const session = this.persistence.load()
    if (!session) return

    const target = findById(this.manifest, session.flowId)
    if (!target) {
      this.persistence.clear()
      return
    }

    this.log(`Found saved session for ${session.flowId} at step ${session.currentStep}`)
    this.emit('sessionRecovered', {
      targetId: target.id,
      target,
      startedAt: session.startedAt,
    }, session.currentStep)
  }

  /**
   * Get current user context
   */
  private async getContext(): Promise<UserContext> {
    if (!this.config?.context) return {}
    return this.config.context()
  }

  /**
   * Guide to a specific target by ID
   *
   * @param targetId Target ID from manifest
   * @returns Target if found and allowed, null otherwise
   */
  async guide(targetId: string): Promise<ManifestTarget | null> {
    this.ensureReady()

    const target = findById(this.manifest!, targetId)
    if (!target) {
      this.log(`Target not found: ${targetId}`)
      return null
    }

    // Check conditions
    if (target.conditions) {
      const context = await this.getContext()
      const result = evaluateCondition(target.conditions, context)
      if (!result.allowed) {
        this.log(`Access blocked for ${targetId}`, result)
        this.emit('blocked', target, result)
        return null
      }
    }

    // Start the sequencer
    this.sequencer!.start(target)
    return target
  }

  /**
   * Ask a question via chat
   *
   * @param query User's question
   * @returns Chat response
   */
  async ask(query: string): Promise<ChatResponse> {
    this.ensureReady()

    // Add user message to history
    this.messages.push({ role: 'user', content: query })

    // If we have a backend endpoint, use it
    if (this.config?.llm?.endpoint) {
      const response = await this.callBackend(query)

      // Add assistant message to history
      const content = response.action === 'text'
        ? response.content ?? ''
        : response.action === 'blocked'
        ? response.reason?.message ?? 'Access blocked'
        : `Guiding you to ${response.targetId}`
      this.messages.push({ role: 'assistant', content })

      // Handle guide response
      if (response.action === 'guide' && response.targetId) {
        await this.guide(response.targetId)
      } else if (response.action === 'blocked') {
        const target = response.targetId ? findById(this.manifest!, response.targetId) : null
        if (target) {
          this.emit('blocked', target, {
            allowed: false,
            reason: response.reason?.type,
            missing: response.reason?.missing,
            message: response.reason?.message,
          })
        }
      }

      return response
    }

    // Local matching fallback
    const target = findBestMatch(this.manifest!, query)
    if (target) {
      // Check conditions
      if (target.conditions) {
        const context = await this.getContext()
        const result = evaluateCondition(target.conditions, context)
        if (!result.allowed) {
          const response: ChatResponse = {
            action: 'blocked',
            targetId: target.id,
            reason: {
              type: result.reason ?? 'permission',
              missing: result.missing,
              message: result.message ?? target.on_blocked?.message,
            },
          }
          this.messages.push({ role: 'assistant', content: result.message ?? 'Access blocked' })
          this.emit('blocked', target, result)
          return response
        }
      }

      await this.guide(target.id)
      const response: ChatResponse = {
        action: 'guide',
        targetId: target.id,
        instruction: target.description,
      }
      this.messages.push({ role: 'assistant', content: target.description })
      return response
    }

    // No match found - emit fallback
    this.emit('fallback', 'docs', query)
    const response: ChatResponse = {
      action: 'text',
      content: `I couldn't find a specific guide for that. Could you try rephrasing your question?`,
    }
    this.messages.push({ role: 'assistant', content: response.content! })
    return response
  }

  /**
   * Call backend endpoint for chat
   */
  private async callBackend(_query: string): Promise<ChatResponse> {
    if (!this.config?.llm?.endpoint) {
      throw new Error('No LLM endpoint configured')
    }

    const context = await this.getContext()
    const request: ChatRequest = {
      messages: this.messages,
      context,
      manifest: getContextTargets(this.manifest!),
    }

    const response = await fetch(this.config.llm.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Manually confirm the current step
   */
  confirmStep(): void {
    this.sequencer?.confirmStep()
  }

  /**
   * Cancel the current flow
   */
  cancel(): void {
    this.sequencer?.cancel()
    this.persistence?.clear()
  }

  /**
   * Clear conversation history
   */
  clearMessages(): void {
    this.messages = []
  }

  /**
   * Destroy Clippi instance and clean up resources
   */
  destroy(): void {
    this.sequencer?.destroy()
    this.removeAllListeners()
    this.config = null
    this.manifest = null
    this.sequencer = null
    this.persistence = null
    this.messages = []
    this.state = 'uninitialized'
  }

  /**
   * Ensure Clippi is initialized
   */
  private ensureReady(): void {
    if (this.state !== 'ready') {
      throw new Error(`Clippi is not ready. Current state: ${this.state}`)
    }
  }

  /**
   * Debug logging
   */
  private log(message: string, data?: unknown): void {
    if (this.debug) {
      console.log(`[Clippi] ${message}`, data !== undefined ? data : '')
    }
  }

  /**
   * Static factory method for initialization
   *
   * @param config Clippi configuration
   * @returns Promise resolving to initialized Clippi instance
   */
  static async init(config: ClippiConfig): Promise<Clippi> {
    const clippi = new Clippi()
    await clippi.init(config)
    return clippi
  }
}
