import type { Manifest, ManifestTarget } from '../types/manifest.js'
import type { UserContext } from '../types/conditions.js'
import type { ChatResponse } from '../types/config.js'
import type { StepInfo, FlowInfo } from '../types/events.js'
import { EventEmitter } from '../events/emitter.js'
import { findById, findBestMatch } from '../manifest/matcher.js'
import { evaluateCondition } from '../conditions/evaluator.js'

/**
 * Mock response configuration
 */
export interface MockResponse {
  action: 'guide' | 'blocked' | 'text'
  targetId?: string
  instruction?: string
  content?: string
}

/**
 * Mock Clippi configuration
 */
export interface MockClippiConfig {
  /** Manifest to use */
  manifest: Manifest
  /** Predefined responses for queries (query -> response) */
  responses?: Record<string, MockResponse>
  /** User context */
  context?: UserContext
  /** Whether to auto-advance steps */
  autoAdvance?: boolean
}

/**
 * Mock Clippi for testing
 *
 * Provides deterministic responses without LLM calls.
 */
export class MockClippi extends EventEmitter {
  private manifest: Manifest
  private responses: Record<string, MockResponse>
  private context: UserContext
  private autoAdvance: boolean
  private currentFlow: FlowInfo | null = null
  private currentStep: number = 0

  constructor(config: MockClippiConfig) {
    super()
    this.manifest = config.manifest
    this.responses = config.responses ?? {}
    this.context = config.context ?? {}
    this.autoAdvance = config.autoAdvance ?? true
  }

  /**
   * Get current flow info
   */
  getCurrentFlow(): FlowInfo | null {
    return this.currentFlow
  }

  /**
   * Get current step index
   */
  getCurrentStepIndex(): number {
    return this.currentStep
  }

  /**
   * Guide to a specific target by ID
   *
   * @param targetId Target ID to guide to
   * @returns Target or null if not found/blocked
   */
  async guide(targetId: string): Promise<ManifestTarget | null> {
    const target = findById(this.manifest, targetId)
    if (!target) {
      return null
    }

    // Check conditions
    if (target.conditions) {
      const result = evaluateCondition(target.conditions, this.context)
      if (!result.allowed) {
        this.emit('blocked', target, result)
        return null
      }
    }

    // Start flow
    this.currentFlow = {
      targetId: target.id,
      target,
      startedAt: Date.now(),
    }
    this.currentStep = 0

    this.emit('flowStarted', this.currentFlow)

    // Emit step event
    const steps = target.path ?? [{ selector: target.selector, instruction: `Click on ${target.label}`, final: true }]
    const stepInfo: StepInfo = {
      target,
      stepIndex: 0,
      totalSteps: steps.length,
      step: steps[0],
      domElement: null, // Mock doesn't have real DOM
      instruction: steps[0].instruction,
    }

    this.emit('beforeGuide', stepInfo)

    if (this.autoAdvance) {
      // Auto-complete all steps
      for (let i = 0; i < steps.length; i++) {
        this.currentStep = i
        const info: StepInfo = {
          target,
          stepIndex: i,
          totalSteps: steps.length,
          step: steps[i],
          domElement: null,
          instruction: steps[i].instruction,
        }
        this.emit('stepCompleted', info)
      }

      this.emit('flowCompleted', this.currentFlow!, Date.now() - this.currentFlow!.startedAt)
      this.currentFlow = null
    }

    return target
  }

  /**
   * Ask a question (simulates chat)
   *
   * @param query User query
   * @returns Chat response
   */
  async ask(query: string): Promise<ChatResponse> {
    // Check for predefined response
    const normalizedQuery = query.toLowerCase().trim()
    const predefinedResponse = this.responses[normalizedQuery] ?? this.responses[query]
    if (predefinedResponse) {
      if (predefinedResponse.action === 'guide' && predefinedResponse.targetId) {
        await this.guide(predefinedResponse.targetId)
      }
      return predefinedResponse as ChatResponse
    }

    // Try to match against manifest
    const target = findBestMatch(this.manifest, query)
    if (target) {
      // Check conditions
      if (target.conditions) {
        const result = evaluateCondition(target.conditions, this.context)
        if (!result.allowed) {
          return {
            action: 'blocked',
            reason: {
              type: result.reason ?? 'permission',
              missing: result.missing,
              message: result.message ?? target.on_blocked?.message,
            },
          }
        }
      }

      await this.guide(target.id)
      return {
        action: 'guide',
        targetId: target.id,
        instruction: target.description,
      }
    }

    // Fallback to text response
    this.emit('fallback', 'docs', query)
    return {
      action: 'text',
      content: `I couldn't find a specific guide for "${query}". How can I help you?`,
    }
  }

  /**
   * Cancel current flow
   */
  cancel(): void {
    if (this.currentFlow) {
      const steps = this.currentFlow.target.path ?? [
        { selector: this.currentFlow.target.selector, instruction: '', final: true },
      ]
      const stepInfo: StepInfo = {
        target: this.currentFlow.target,
        stepIndex: this.currentStep,
        totalSteps: steps.length,
        step: steps[this.currentStep],
        domElement: null,
        instruction: steps[this.currentStep].instruction,
      }
      this.emit('flowAbandoned', this.currentFlow, stepInfo, 'user_cancelled')
      this.currentFlow = null
      this.currentStep = 0
    }
  }

  /**
   * Set user context
   *
   * @param context New context
   */
  setContext(context: UserContext): void {
    this.context = context
  }

  /**
   * Add predefined response
   *
   * @param query Query string
   * @param response Response to return
   */
  addResponse(query: string, response: MockResponse): void {
    this.responses[query.toLowerCase().trim()] = response
  }

  /**
   * Destroy mock
   */
  destroy(): void {
    this.removeAllListeners()
    this.currentFlow = null
  }
}

/**
 * Create a mock Clippi instance for testing
 *
 * @param config Mock configuration
 * @returns MockClippi instance
 */
export function createMockClippi(config: MockClippiConfig): MockClippi {
  return new MockClippi(config)
}
