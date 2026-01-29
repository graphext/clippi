import type { SuccessCondition, Selector } from '../types/manifest.js'
import { resolveSelector, resolveSelectorString } from '../selectors/resolver.js'

/**
 * Check a success condition against current DOM/URL state
 */
export function checkSuccessCondition(condition: SuccessCondition): boolean {
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
  /** URL polling interval in ms */
  urlPollInterval?: number
}

/**
 * DOM and URL observer for detecting step completion
 *
 * Uses MutationObserver for DOM changes and polling for URL changes.
 */
export class StepObserver {
  private mutationObserver: MutationObserver | null = null
  private urlPollTimer: ReturnType<typeof setInterval> | null = null
  private lastUrl: string = ''
  private condition: SuccessCondition | null = null
  private config: ObserverConfig | null = null

  /**
   * Start observing for a success condition
   *
   * @param condition The condition to watch for
   * @param config Observer callbacks and options
   */
  start(condition: SuccessCondition, config: ObserverConfig): void {
    this.stop() // Clean up any existing observers

    this.condition = condition
    this.config = config
    this.lastUrl = window.location.href

    // Check immediately in case condition is already met
    if (checkSuccessCondition(condition)) {
      config.onSuccess()
      return
    }

    // Set up MutationObserver for DOM changes
    this.mutationObserver = new MutationObserver(() => {
      if (this.condition && checkSuccessCondition(this.condition)) {
        this.config?.onSuccess()
        this.stop()
      }
    })

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-hidden'],
    })

    // Set up URL polling for SPA route changes
    if (condition.url_contains || condition.url_matches) {
      const pollInterval = config.urlPollInterval ?? 500

      this.urlPollTimer = setInterval(() => {
        const currentUrl = window.location.href
        if (currentUrl !== this.lastUrl) {
          this.lastUrl = currentUrl
          this.config?.onUrlChange?.(currentUrl)

          if (this.condition && checkSuccessCondition(this.condition)) {
            this.config?.onSuccess()
            this.stop()
          }
        }
      }, pollInterval)
    }
  }

  /**
   * Stop all observers
   */
  stop(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }

    if (this.urlPollTimer) {
      clearInterval(this.urlPollTimer)
      this.urlPollTimer = null
    }

    this.condition = null
    this.config = null
  }

  /**
   * Manually trigger a check (e.g., after user confirms "Did you do it?")
   */
  checkNow(): boolean {
    if (this.condition && checkSuccessCondition(this.condition)) {
      this.config?.onSuccess()
      this.stop()
      return true
    }
    return false
  }
}
