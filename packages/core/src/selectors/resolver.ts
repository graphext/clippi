import type { Selector, SelectorStrategy } from '../types/manifest.js'

/**
 * Result of selector resolution
 */
export interface SelectorResult {
  /** The resolved DOM element (null if not found) */
  element: Element | null
  /** The strategy that successfully resolved (null if all failed) */
  strategy: SelectorStrategy | null
  /** Strategies that were tried and failed */
  failedStrategies: SelectorStrategy[]
}

/**
 * Resolve a testId selector: data-testid="value"
 */
function resolveTestId(value: string): Element | null {
  return document.querySelector(`[data-testid="${value}"]`)
}

/**
 * Resolve an aria selector: aria-label="value"
 */
function resolveAria(value: string): Element | null {
  return document.querySelector(`[aria-label="${value}"]`)
}

/**
 * Resolve a CSS selector
 */
function resolveCss(value: string): Element | null {
  try {
    return document.querySelector(value)
  } catch {
    // Invalid CSS selector
    return null
  }
}

/**
 * Resolve a text selector: visible text + optional tag
 */
function resolveText(value: string, tag?: string): Element | null {
  // Normalize text for comparison
  const normalizedValue = value.trim().toLowerCase()

  // Get all potential elements (with or without tag filter)
  const elements = tag
    ? document.querySelectorAll(tag)
    : document.querySelectorAll('*')

  for (const el of elements) {
    // Check direct text content (ignoring children text)
    const text = getDirectTextContent(el).trim().toLowerCase()
    if (text === normalizedValue) {
      return el
    }
  }

  // Fallback: try textContent which includes child text
  for (const el of elements) {
    const text = el.textContent?.trim().toLowerCase()
    if (text === normalizedValue) {
      return el
    }
  }

  return null
}

/**
 * Get direct text content of an element (excluding children)
 */
function getDirectTextContent(el: Element): string {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent
    }
  }
  return text
}

/**
 * Resolve a single selector strategy
 */
function resolveStrategy(strategy: SelectorStrategy): Element | null {
  switch (strategy.type) {
    case 'testId':
      return resolveTestId(strategy.value)
    case 'aria':
      return resolveAria(strategy.value)
    case 'css':
      return resolveCss(strategy.value)
    case 'text':
      return resolveText(strategy.value, strategy.tag)
    default:
      return null
  }
}

/**
 * Resolve a selector with multiple strategies
 *
 * Tries strategies in order (testId → aria → css → text by convention)
 * and returns the first match.
 *
 * @param selector Selector with multiple strategies
 * @returns SelectorResult with element, successful strategy, and failed strategies
 */
export function resolveSelector(selector: Selector): SelectorResult {
  const failedStrategies: SelectorStrategy[] = []

  for (const strategy of selector.strategies) {
    const element = resolveStrategy(strategy)
    if (element) {
      return {
        element,
        strategy,
        failedStrategies,
      }
    }
    failedStrategies.push(strategy)
  }

  return {
    element: null,
    strategy: null,
    failedStrategies,
  }
}

/**
 * Resolve a selector string (CSS selector shorthand)
 */
export function resolveSelectorString(selector: string): Element | null {
  return resolveCss(selector)
}

/**
 * Create a Selector object from a CSS selector string
 */
export function selectorFromString(css: string): Selector {
  return {
    strategies: [{ type: 'css', value: css }],
  }
}

/**
 * Create a Selector object with testId as primary strategy
 */
export function selectorFromTestId(testId: string): Selector {
  return {
    strategies: [{ type: 'testId', value: testId }],
  }
}

/**
 * Wait for an element to appear in the DOM
 *
 * @param selector Selector to resolve
 * @param timeout Maximum time to wait in ms
 * @param interval Polling interval in ms
 * @returns Promise resolving to SelectorResult
 */
export function waitForSelector(
  selector: Selector,
  timeout = 5000,
  interval = 100
): Promise<SelectorResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()

    const check = () => {
      const result = resolveSelector(selector)
      if (result.element) {
        resolve(result)
        return
      }

      if (Date.now() - startTime >= timeout) {
        resolve(result) // Return the failed result
        return
      }

      setTimeout(check, interval)
    }

    check()
  })
}
