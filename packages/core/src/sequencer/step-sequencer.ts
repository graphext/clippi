import type { ManifestElement, PathStep } from '../types/manifest.js'
import type { StepInfo, FlowInfo } from '../types/events.js'
import { EventEmitter } from '../events/emitter.js'
import { resolveSelector } from '../selectors/resolver.js'
import { isActionable, scrollIntoViewIfNeeded } from '../actionability/checks.js'
import { StepObserver, checkSuccessCondition } from './observer.js'

/**
 * Sequencer state
 */
export type SequencerState = 'idle' | 'active' | 'paused' | 'completed' | 'cancelled'

/**
 * Sequencer configuration
 */
export interface SequencerConfig {
  /** Confirmation timeout in ms (shows "Did you do it?" after this) */
  confirmationTimeout?: number
  /** Callback when step is ready to be shown */
  onStep?: (step: StepInfo) => void
  /** Callback when confirmation is needed */
  onConfirmationNeeded?: (step: StepInfo) => void
  /** Callback when flow completes */
  onComplete?: (flow: FlowInfo, duration: number) => void
  /** Callback when flow is cancelled */
  onCancel?: (flow: FlowInfo, step: StepInfo, reason: string) => void
  /** Callback for debug logging */
  onDebug?: (message: string, data?: unknown) => void
}

/**
 * Step Sequencer - orchestrates multi-step flows
 *
 * Handles:
 * 1. Detecting which steps are already complete (initial step detection)
 * 2. Showing the current step
 * 3. Detecting when steps are completed via MutationObserver
 * 4. Advancing to the next step automatically
 * 5. Showing confirmation fallback if auto-detection fails
 */
export class StepSequencer extends EventEmitter {
  private state: SequencerState = 'idle'
  private element: ManifestElement | null = null
  private currentStepIndex = 0
  private startTime = 0
  private config: SequencerConfig
  private observer: StepObserver
  private confirmationTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: SequencerConfig = {}) {
    super()
    this.config = {
      confirmationTimeout: 10000,
      ...config,
    }
    this.observer = new StepObserver()
  }

  /**
   * Get current state
   */
  getState(): SequencerState {
    return this.state
  }

  /**
   * Get current flow info
   */
  getCurrentFlow(): FlowInfo | null {
    if (!this.element) return null
    return {
      elementId: this.element.id,
      element: this.element,
      startedAt: this.startTime,
    }
  }

  /**
   * Get current step info
   */
  getCurrentStep(): StepInfo | null {
    if (!this.element) return null
    const steps = this.getSteps()
    if (this.currentStepIndex >= steps.length) return null

    const step = steps[this.currentStepIndex]
    const result = resolveSelector(step.selector)

    return {
      element: this.element,
      stepIndex: this.currentStepIndex,
      totalSteps: steps.length,
      step,
      domElement: result.element,
      instruction: step.instruction,
    }
  }

  /**
   * Get all steps for current element
   */
  private getSteps(): PathStep[] {
    if (!this.element) return []

    // If element has a path, use it
    if (this.element.path && this.element.path.length > 0) {
      return this.element.path
    }

    // Otherwise, the element itself is a single step
    return [
      {
        selector: this.element.selector,
        instruction: `Click on ${this.element.label}`,
        final: true,
      },
    ]
  }

  /**
   * Find which step to start from based on already completed conditions
   */
  private findStartStep(): number {
    const steps = this.getSteps()

    // Search from end to beginning
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i]
      if (step.success_condition && checkSuccessCondition(step.success_condition)) {
        this.debug(`Step ${i} already complete, starting at ${i + 1}`)
        return i + 1 // Start at next step
      }
    }

    return 0 // Start from the beginning
  }

  /**
   * Start a flow for a manifest element
   *
   * @param element The manifest element to guide to
   */
  start(element: ManifestElement): void {
    this.stop() // Clean up any existing flow

    this.element = element
    this.startTime = Date.now()
    this.currentStepIndex = this.findStartStep()

    const steps = this.getSteps()
    if (this.currentStepIndex >= steps.length) {
      // All steps already complete
      this.debug('All steps already complete')
      this.state = 'completed'
      this.emitComplete()
      return
    }

    this.state = 'active'
    this.emit('flowStarted', this.getCurrentFlow()!)
    this.showCurrentStep()
  }

  /**
   * Show the current step
   */
  private showCurrentStep(): void {
    const stepInfo = this.getCurrentStep()
    if (!stepInfo) return

    const step = stepInfo.step
    this.debug(`Showing step ${this.currentStepIndex + 1}/${stepInfo.totalSteps}`, step.instruction)

    // Resolve selector
    const result = resolveSelector(step.selector)
    stepInfo.domElement = result.element

    if (!result.element) {
      this.debug('Selector not found', step.selector)
      // Still emit the step - cursor package can handle missing elements
    } else {
      // Check actionability and scroll into view if needed
      const actionability = isActionable(result.element)
      if (!actionability.ok && actionability.reason === 'out_of_viewport') {
        scrollIntoViewIfNeeded(result.element)
      }
    }

    // Emit step event
    this.emit('beforeGuide', stepInfo)
    this.config.onStep?.(stepInfo)

    // Set up observer for success condition
    if (step.success_condition) {
      this.observer.start(step.success_condition, {
        onSuccess: () => this.advanceStep(),
      })
    }

    // Start confirmation timer
    this.startConfirmationTimer()
  }

  /**
   * Start the confirmation timer (shows "Did you do it?" after timeout)
   */
  private startConfirmationTimer(): void {
    this.clearConfirmationTimer()

    if (this.config.confirmationTimeout && this.config.confirmationTimeout > 0) {
      this.confirmationTimer = setTimeout(() => {
        const stepInfo = this.getCurrentStep()
        if (stepInfo && this.state === 'active') {
          this.debug('Confirmation timeout reached')
          this.config.onConfirmationNeeded?.(stepInfo)
        }
      }, this.config.confirmationTimeout)
    }
  }

  /**
   * Clear the confirmation timer
   */
  private clearConfirmationTimer(): void {
    if (this.confirmationTimer) {
      clearTimeout(this.confirmationTimer)
      this.confirmationTimer = null
    }
  }

  /**
   * Advance to the next step
   */
  private advanceStep(): void {
    this.clearConfirmationTimer()
    this.observer.stop()

    const stepInfo = this.getCurrentStep()
    if (stepInfo) {
      this.emit('stepCompleted', stepInfo)
    }

    this.currentStepIndex++
    const steps = this.getSteps()

    if (this.currentStepIndex >= steps.length) {
      this.debug('Flow complete')
      this.state = 'completed'
      this.emitComplete()
      return
    }

    this.showCurrentStep()
  }

  /**
   * Emit flow completed event
   */
  private emitComplete(): void {
    const flow = this.getCurrentFlow()
    if (flow) {
      const duration = Date.now() - this.startTime
      this.emit('flowCompleted', flow, duration)
      this.config.onComplete?.(flow, duration)
    }
    this.cleanup()
  }

  /**
   * Manually confirm the current step (e.g., user clicked "Yes, I did it")
   */
  confirmStep(): void {
    if (this.state !== 'active') return
    this.debug('Step manually confirmed')
    this.advanceStep()
  }

  /**
   * Cancel the current flow
   *
   * @param reason Reason for cancellation
   */
  cancel(reason = 'user_cancelled'): void {
    if (this.state !== 'active' && this.state !== 'paused') return

    const flow = this.getCurrentFlow()
    const step = this.getCurrentStep()

    this.state = 'cancelled'
    this.debug('Flow cancelled', reason)

    if (flow && step) {
      this.emit('flowAbandoned', flow, step, reason)
      this.config.onCancel?.(flow, step, reason)
    }

    this.cleanup()
  }

  /**
   * Pause the current flow
   */
  pause(): void {
    if (this.state !== 'active') return
    this.state = 'paused'
    this.clearConfirmationTimer()
    this.observer.stop()
    this.debug('Flow paused')
  }

  /**
   * Resume a paused flow
   */
  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'active'
    this.debug('Flow resumed')
    this.showCurrentStep()
  }

  /**
   * Stop the flow and clean up
   */
  stop(): void {
    this.cleanup()
    this.state = 'idle'
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.clearConfirmationTimer()
    this.observer.stop()
    this.element = null
    this.currentStepIndex = 0
  }

  /**
   * Debug logging
   */
  private debug(message: string, data?: unknown): void {
    this.config.onDebug?.(message, data)
  }

  /**
   * Destroy the sequencer
   */
  destroy(): void {
    this.stop()
    this.removeAllListeners()
  }
}
