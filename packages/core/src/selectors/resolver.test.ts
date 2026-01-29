import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolveSelector,
  resolveSelectorString,
  selectorFromString,
  selectorFromTestId,
  waitForSelector,
} from './resolver.js'
import type { Selector } from '../types/manifest.js'

describe('resolveSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('testId strategy', () => {
    it('finds element by data-testid', () => {
      document.body.innerHTML = '<button data-testid="submit-btn">Submit</button>'

      const selector: Selector = {
        strategies: [{ type: 'testId', value: 'submit-btn' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.element?.tagName).toBe('BUTTON')
      expect(result.strategy?.type).toBe('testId')
      expect(result.failedStrategies).toHaveLength(0)
    })

    it('returns null when testId not found', () => {
      const selector: Selector = {
        strategies: [{ type: 'testId', value: 'nonexistent' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).toBeNull()
      expect(result.strategy).toBeNull()
      expect(result.failedStrategies).toHaveLength(1)
    })
  })

  describe('aria strategy', () => {
    it('finds element by aria-label', () => {
      document.body.innerHTML = '<button aria-label="Close dialog">X</button>'

      const selector: Selector = {
        strategies: [{ type: 'aria', value: 'Close dialog' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.element?.textContent).toBe('X')
      expect(result.strategy?.type).toBe('aria')
    })
  })

  describe('css strategy', () => {
    it('finds element by CSS selector', () => {
      document.body.innerHTML = '<div class="modal"><button class="close">X</button></div>'

      const selector: Selector = {
        strategies: [{ type: 'css', value: '.modal .close' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.element?.className).toBe('close')
    })

    it('handles invalid CSS selectors gracefully', () => {
      const selector: Selector = {
        strategies: [{ type: 'css', value: '[invalid[selector' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).toBeNull()
    })
  })

  describe('text strategy', () => {
    it('finds element by text content', () => {
      document.body.innerHTML = '<button>Save Changes</button><button>Cancel</button>'

      const selector: Selector = {
        strategies: [{ type: 'text', value: 'Save Changes' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.element?.textContent).toBe('Save Changes')
    })

    it('finds element by text with tag filter', () => {
      document.body.innerHTML = `
        <span>Submit</span>
        <button>Submit</button>
      `

      const selector: Selector = {
        strategies: [{ type: 'text', value: 'Submit', tag: 'button' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.element?.tagName).toBe('BUTTON')
    })

    it('is case-insensitive', () => {
      document.body.innerHTML = '<button>SAVE CHANGES</button>'

      const selector: Selector = {
        strategies: [{ type: 'text', value: 'save changes' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
    })

    it('trims whitespace', () => {
      document.body.innerHTML = '<button>  Submit  </button>'

      const selector: Selector = {
        strategies: [{ type: 'text', value: 'Submit' }]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
    })
  })

  describe('fallback strategies', () => {
    it('tries strategies in order and uses first match', () => {
      document.body.innerHTML = '<button class="btn" aria-label="Submit">Click</button>'

      const selector: Selector = {
        strategies: [
          { type: 'testId', value: 'submit' },  // Will fail
          { type: 'aria', value: 'Submit' },     // Will succeed
          { type: 'css', value: '.btn' },        // Won't be tried
        ]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.strategy?.type).toBe('aria')
      expect(result.failedStrategies).toHaveLength(1)
      expect(result.failedStrategies[0].type).toBe('testId')
    })

    it('falls back through all strategies until match', () => {
      document.body.innerHTML = '<button class="special-btn">Click</button>'

      const selector: Selector = {
        strategies: [
          { type: 'testId', value: 'btn' },
          { type: 'aria', value: 'Click button' },
          { type: 'css', value: '.special-btn' },
        ]
      }
      const result = resolveSelector(selector)

      expect(result.element).not.toBeNull()
      expect(result.strategy?.type).toBe('css')
      expect(result.failedStrategies).toHaveLength(2)
    })

    it('returns all failed strategies when none match', () => {
      const selector: Selector = {
        strategies: [
          { type: 'testId', value: 'a' },
          { type: 'aria', value: 'b' },
          { type: 'css', value: '.c' },
          { type: 'text', value: 'd' },
        ]
      }
      const result = resolveSelector(selector)

      expect(result.element).toBeNull()
      expect(result.strategy).toBeNull()
      expect(result.failedStrategies).toHaveLength(4)
    })
  })
})

describe('resolveSelectorString', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves CSS selector string', () => {
    document.body.innerHTML = '<div id="target">Content</div>'

    const element = resolveSelectorString('#target')

    expect(element).not.toBeNull()
    expect(element?.id).toBe('target')
  })

  it('returns null for non-matching selector', () => {
    const element = resolveSelectorString('#nonexistent')

    expect(element).toBeNull()
  })
})

describe('selectorFromString', () => {
  it('creates Selector with css strategy', () => {
    const selector = selectorFromString('.my-class')

    expect(selector.strategies).toHaveLength(1)
    expect(selector.strategies[0].type).toBe('css')
    expect(selector.strategies[0].value).toBe('.my-class')
  })
})

describe('selectorFromTestId', () => {
  it('creates Selector with testId strategy', () => {
    const selector = selectorFromTestId('submit-btn')

    expect(selector.strategies).toHaveLength(1)
    expect(selector.strategies[0].type).toBe('testId')
    expect(selector.strategies[0].value).toBe('submit-btn')
  })
})

describe('waitForSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves immediately if element exists', async () => {
    document.body.innerHTML = '<div id="target">Content</div>'

    const selector: Selector = {
      strategies: [{ type: 'css', value: '#target' }]
    }

    const promise = waitForSelector(selector)
    vi.advanceTimersByTime(0)
    const result = await promise

    expect(result.element).not.toBeNull()
  })

  it('waits for element to appear', async () => {
    const selector: Selector = {
      strategies: [{ type: 'css', value: '#target' }]
    }

    const promise = waitForSelector(selector, 5000, 100)

    // Element doesn't exist yet
    vi.advanceTimersByTime(100)

    // Element appears
    document.body.innerHTML = '<div id="target">Content</div>'
    vi.advanceTimersByTime(100)

    const result = await promise
    expect(result.element).not.toBeNull()
  })

  it('returns failed result after timeout', async () => {
    const selector: Selector = {
      strategies: [{ type: 'css', value: '#nonexistent' }]
    }

    const promise = waitForSelector(selector, 500, 100)

    // Advance past timeout
    vi.advanceTimersByTime(600)

    const result = await promise
    expect(result.element).toBeNull()
  })

  it('respects custom timeout', async () => {
    const selector: Selector = {
      strategies: [{ type: 'css', value: '#target' }]
    }

    const promise = waitForSelector(selector, 200, 50)

    vi.advanceTimersByTime(150)
    // Still waiting

    document.body.innerHTML = '<div id="target">Content</div>'
    vi.advanceTimersByTime(50)

    const result = await promise
    expect(result.element).not.toBeNull()
  })
})
