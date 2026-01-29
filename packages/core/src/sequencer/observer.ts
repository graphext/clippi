import type { SuccessCondition, Selector, ValueCondition } from '../types/manifest.js'
import { resolveSelector, resolveSelectorString } from '../selectors/resolver.js'

/**
 * Get the value of a form element (works with input, select, textarea, and custom elements)
 */
function getElementValue(element: Element): string {
  // Standard form elements
  if (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) {
    return element.value
  }

  // Custom comboboxes often use these attributes
  const ariaValueNow = element.getAttribute('aria-valuenow')
  if (ariaValueNow !== null) return ariaValueNow

  const ariaValueText = element.getAttribute('aria-valuetext')
  if (ariaValueText !== null) return ariaValueText

  // data-value is common in custom components
  const dataValue = element.getAttribute('data-value')
  if (dataValue !== null) return dataValue

  // Fallback to textContent for custom elements that display their value
  return element.textContent?.trim() ?? ''
}

/**
 * Check if a value condition is satisfied
 */
export function checkValueCondition(valueCondition: ValueCondition): boolean {
  const element = typeof valueCondition.selector === 'string'
    ? resolveSelectorString(valueCondition.selector)
    : resolveSelector(valueCondition.selector as Selector).element

  if (!element) return false

  const value = getElementValue(element)

  // Check equals
  if (valueCondition.equals !== undefined) {
    if (value !== valueCondition.equals) return false
  }

  // Check contains
  if (valueCondition.contains !== undefined) {
    if (!value.includes(valueCondition.contains)) return false
  }

  // Check not_empty
  if (valueCondition.not_empty) {
    if (value === '') return false
  }

  return true
}

/**
 * Check a success condition against current DOM/URL state
 *
 * Note: This function returns false for click-only conditions since
 * clicks require user action and cannot be pre-checked.
 */
export function checkSuccessCondition(condition: SuccessCondition): boolean {
  // Click conditions require user action - cannot be pre-checked
  // Check this FIRST to avoid false positives
  if (condition.click) {
    // If there are other conditions besides click, check those
    // But if it's click-only, return false
    const hasOtherConditions = condition.url_contains ||
      condition.url_matches ||
      condition.visible ||
      condition.exists ||
      condition.attribute ||
      condition.value

    if (!hasOtherConditions) {
      return false
    }
  }

  // URL contains
  if (condition.url_contains) {
    if (!window.location.href.includes(condition.url_contains)) {
      return false
    }
  }

  // URL matches regex
  if (condition.url_matches) {
    try {
      const regex = new RegExp(condition.url_matches)
      if (!regex.test(window.location.href)) {
        return false
      }
    } catch {
      // Invalid regex
      return false
    }
  }

  // Element visible
  if (condition.visible) {
    const element = typeof condition.visible === 'string'
      ? resolveSelectorString(condition.visible)
      : resolveSelector(condition.visible as Selector).element

    if (!element) return false

    // Check if actually visible
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
  }

  // Element exists
  if (condition.exists) {
    const element = typeof condition.exists === 'string'
      ? resolveSelectorString(condition.exists)
      : resolveSelector(condition.exists as Selector).element

    if (!element) return false
  }

  // Attribute check
  if (condition.attribute) {
    const element = typeof condition.attribute.selector === 'string'
      ? resolveSelectorString(condition.attribute.selector)
      : resolveSelector(condition.attribute.selector as Selector).element

    if (!element) return false

    const attrValue = element.getAttribute(condition.attribute.name)
    if (attrValue === null) return false

    // If a specific value is expected, check it
    if (condition.attribute.value !== undefined && attrValue !== condition.attribute.value) {
      return false
    }
  }

  // Value check
  if (condition.value) {
    if (!checkValueCondition(condition.value)) {
      return false
    }
  }

  return true
}

/**
 * Observer configuration
 */
export interface ObserverConfig {
  /** Callback when success condition is met */
  onSuccess: () => void
  /** Callback when URL changes */
  onUrlChange?: (url: string) => void
  /** Polling interval in ms (default: 100, same as Playwright) */
  pollInterval?: number
  /** Element to use when click condition is `true` (uses step's target element) */
  stepElement?: Element | null
}

/**
 * DOM and URL observer for detecting step completion
 *
 * Uses a single unified polling loop (Playwright-style) for all conditions
 * except click, which uses an event listener.
 *
 * This design eliminates race conditions from multiple async mechanisms
 * by using AbortController for clean cancellation.
 */
export class StepObserver {
  private abortController: AbortController | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private clickCleanup: (() => void) | null = null

  /**
   * Start observing for a success condition
   *
   * @param condition The condition to watch for
   * @param config Observer callbacks and options
   */
  start(condition: SuccessCondition, config: ObserverConfig): void {
    this.stop() // Clean up any existing observers

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // Track URL for change notifications
    let lastUrl = window.location.href

    // Check function - runs on each poll
    const check = (): boolean => {
      if (signal.aborted) return false

      // Track URL changes
      const currentUrl = window.location.href
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl
        config.onUrlChange?.(currentUrl)
      }

      // Simply check if condition is met
      // No change detection needed - findStartStep() handles skipping already-complete steps
      return checkSuccessCondition(condition)
    }

    // Handle success - called when condition is met
    const onConditionMet = () => {
      if (signal.aborted) return
      config.onSuccess()
      // Note: Don't call stop() here - sequencer will call start() for next step
      // which will call stop() at the beginning
    }

    // For click-only conditions, skip immediate check and polling
    const isClickOnly = this.isClickOnly(condition)

    // Immediate check (skip for click-only conditions)
    if (!isClickOnly && check()) {
      onConditionMet()
      return
    }

    // Setup click listener if needed
    if (condition.click) {
      this.clickCleanup = this.setupClickListener(condition, config, signal)
    }

    // Start unified polling (skip for click-only)
    if (!isClickOnly) {
      const pollInterval = config.pollInterval ?? 100

      this.pollTimer = setInterval(() => {
        if (signal.aborted) return
        if (check()) {
          onConditionMet()
        }
      }, pollInterval)
    }
  }

  /**
   * Stop all observers
   */
  stop(): void {
    // Abort signals all callbacks to stop
    this.abortController?.abort()
    this.abortController = null

    // Clear polling timer
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    // Clean up click listener
    this.clickCleanup?.()
    this.clickCleanup = null
  }

  /**
   * Manually trigger a check (e.g., after user confirms "Did you do it?")
   */
  checkNow(): boolean {
    if (!this.abortController || this.abortController.signal.aborted) {
      return false
    }

    // We can't easily re-run the check function here since it's defined
    // in start(). For manual confirmation, the sequencer should call
    // confirmStep() which advances without checking.
    return false
  }

  /**
   * Check if a condition is click-only (no other conditions)
   */
  private isClickOnly(condition: SuccessCondition): boolean {
    return !!condition.click &&
      !condition.url_contains &&
      !condition.url_matches &&
      !condition.visible &&
      !condition.exists &&
      !condition.attribute &&
      !condition.value
  }

  /**
   * Setup click listener with proper cleanup
   */
  private setupClickListener(
    condition: SuccessCondition,
    config: ObserverConfig,
    signal: AbortSignal
  ): () => void {
    const target = this.resolveClickTarget(condition, config)
    if (!target) return () => {}

    const handler = () => {
      if (signal.aborted) return
      config.onSuccess()
    }

    target.addEventListener('click', handler, { once: true })

    // Return cleanup function
    return () => target.removeEventListener('click', handler)
  }

  /**
   * Resolve the click target element
   */
  private resolveClickTarget(
    condition: SuccessCondition,
    config: ObserverConfig
  ): Element | null {
    if (!condition.click) return null

    if (condition.click === true) {
      // Use the step's element
      return config.stepElement ?? null
    } else if (typeof condition.click === 'string') {
      // Use CSS selector
      return resolveSelectorString(condition.click)
    } else {
      // Use Selector object
      return resolveSelector(condition.click as Selector).element
    }
  }
}
