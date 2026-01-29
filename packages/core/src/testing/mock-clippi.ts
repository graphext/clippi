import type { Manifest, ManifestElement } from '../types/manifest.js'
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
  elementId?: string
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
   * Guide to a specific element by ID
   *
   * @param elementId Element ID to guide to
   * @returns Element or null if not found/blocked
   */
  async guide(elementId: string): Promise<ManifestElement | null> {
    const element = findById(this.manifest, elementId)
    if (!element) {
      return null
    }

    // Check conditions
    if (element.conditions) {
      const result = evaluateCondition(element.conditions, this.context)
      if (!result.allowed) {
        this.emit('blocked', element, result)
        return null
      }
    }

    // Start flow
    this.currentFlow = {
      elementId: element.id,
      element,
      startedAt: Date.now(),
    }
    this.currentStep = 0

    this.emit('flowStarted', this.currentFlow)

    // Emit step event
    const steps = element.path ?? [{ selector: element.selector, instruction: `Click on ${element.label}`, final: true }]
    const stepInfo: StepInfo = {
      element,
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
          element,
          stepIndex: i,
          totalSteps: steps.length,
          step: steps[i],
          domElement: null,
          instruction: steps[i].instruction,
        }
        this.emit('stepCompleted', info)
      }

      this.emit('flowCompleted', this.currentFlow, Date.now() - this.currentFlow.startedAt)
      this.currentFlow = null
    }

    return element
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
      if (predefinedResponse.action === 'guide' && predefinedResponse.elementId) {
        await this.guide(predefinedResponse.elementId)
      }
      return predefinedResponse as ChatResponse
    }

    // Try to match against manifest
    const element = findBestMatch(this.manifest, query)
    if (element) {
      // Check conditions
      if (element.conditions) {
        const result = evaluateCondition(element.conditions, this.context)
        if (!result.allowed) {
          return {
            action: 'blocked',
            reason: {
              type: result.reason ?? 'permission',
              missing: result.missing,
              message: result.message ?? element.on_blocked?.message,
            },
          }
        }
      }

      await this.guide(element.id)
      return {
        action: 'guide',
        elementId: element.id,
        instruction: element.description,
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
      const steps = this.currentFlow.element.path ?? [
        { selector: this.currentFlow.element.selector, instruction: '', final: true },
      ]
      const stepInfo: StepInfo = {
        element: this.currentFlow.element,
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
