import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkSuccessCondition, checkValueCondition, StepObserver } from './observer.js'
import type { SuccessCondition, ValueCondition } from '../types/manifest.js'

describe('checkSuccessCondition', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''
    // Mock location
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/dashboard' },
      writable: true,
    })
  })

  describe('url_contains', () => {
    it('returns true when URL contains substring', () => {
      const condition: SuccessCondition = { url_contains: 'dashboard' }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when URL does not contain substring', () => {
      const condition: SuccessCondition = { url_contains: 'settings' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('is case-sensitive', () => {
      const condition: SuccessCondition = { url_contains: 'Dashboard' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })

  describe('url_matches', () => {
    it('returns true when URL matches regex', () => {
      const condition: SuccessCondition = { url_matches: 'example\\.com/.*' }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when URL does not match regex', () => {
      const condition: SuccessCondition = { url_matches: 'other\\.com/.*' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false for invalid regex', () => {
      const condition: SuccessCondition = { url_matches: '[invalid(' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('supports complex regex patterns', () => {
      const condition: SuccessCondition = { url_matches: '^https://example\\.com/(dashboard|settings)$' }
      expect(checkSuccessCondition(condition)).toBe(true)
    })
  })

  describe('click-only conditions', () => {
    it('returns false for click-only condition (click: true)', () => {
      const condition: SuccessCondition = { click: true }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false for click-only condition (click: string)', () => {
      const condition: SuccessCondition = { click: '#submit-btn' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false for click-only condition (click: Selector)', () => {
      const condition: SuccessCondition = {
        click: { strategies: [{ type: 'testId', value: 'submit' }] }
      }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })

  describe('click with other conditions', () => {
    it('checks other conditions when click is combined with url_contains', () => {
      const condition: SuccessCondition = {
        click: true,
        url_contains: 'dashboard'
      }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when click is combined with failing url_contains', () => {
      const condition: SuccessCondition = {
        click: true,
        url_contains: 'settings'
      }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })

  describe('visible condition', () => {
    it('returns true when element is visible', () => {
      document.body.innerHTML = '<div id="my-element">Content</div>'

      const condition: SuccessCondition = { visible: '#my-element' }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when element has display: none', () => {
      document.body.innerHTML = '<div id="my-element" style="display: none">Content</div>'

      const condition: SuccessCondition = { visible: '#my-element' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false when element has visibility: hidden', () => {
      document.body.innerHTML = '<div id="my-element" style="visibility: hidden">Content</div>'

      const condition: SuccessCondition = { visible: '#my-element' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false when element has opacity: 0', () => {
      document.body.innerHTML = '<div id="my-element" style="opacity: 0">Content</div>'

      const condition: SuccessCondition = { visible: '#my-element' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false when element does not exist', () => {
      const condition: SuccessCondition = { visible: '#nonexistent' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })

  describe('exists condition', () => {
    it('returns true when element exists', () => {
      document.body.innerHTML = '<div id="my-element">Content</div>'

      const condition: SuccessCondition = { exists: '#my-element' }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when element does not exist', () => {
      const condition: SuccessCondition = { exists: '#nonexistent' }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })

  describe('attribute condition', () => {
    it('returns true when attribute exists', () => {
      document.body.innerHTML = '<div id="el" data-status="active">Content</div>'

      const condition: SuccessCondition = {
        attribute: { selector: '#el', name: 'data-status' }
      }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns true when attribute matches value', () => {
      document.body.innerHTML = '<div id="el" data-status="active">Content</div>'

      const condition: SuccessCondition = {
        attribute: { selector: '#el', name: 'data-status', value: 'active' }
      }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when attribute does not match value', () => {
      document.body.innerHTML = '<div id="el" data-status="inactive">Content</div>'

      const condition: SuccessCondition = {
        attribute: { selector: '#el', name: 'data-status', value: 'active' }
      }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false when attribute does not exist', () => {
      document.body.innerHTML = '<div id="el">Content</div>'

      const condition: SuccessCondition = {
        attribute: { selector: '#el', name: 'data-missing' }
      }
      expect(checkSuccessCondition(condition)).toBe(false)
    })

    it('returns false when element does not exist', () => {
      const condition: SuccessCondition = {
        attribute: { selector: '#nonexistent', name: 'data-status' }
      }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })

  describe('empty condition', () => {
    it('returns true for empty condition object', () => {
      const condition: SuccessCondition = {}
      expect(checkSuccessCondition(condition)).toBe(true)
    })
  })

  describe('multiple conditions (AND logic)', () => {
    it('returns true when all conditions pass', () => {
      document.body.innerHTML = '<button id="button">Click</button>'

      const condition: SuccessCondition = {
        url_contains: 'dashboard',
        visible: '#button',
      }
      expect(checkSuccessCondition(condition)).toBe(true)
    })

    it('returns false when any condition fails', () => {
      document.body.innerHTML = '<button id="button">Click</button>'
      window.location.href = 'https://example.com/settings'

      const condition: SuccessCondition = {
        url_contains: 'dashboard',
        visible: '#button',
      }
      expect(checkSuccessCondition(condition)).toBe(false)
    })
  })
})

describe('checkValueCondition', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('equals', () => {
    it('returns true when input value equals expected', () => {
      document.body.innerHTML = '<input id="dropdown" value="csv" />'

      const condition: ValueCondition = { selector: '#dropdown', equals: 'csv' }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('returns true when select value equals expected', () => {
      document.body.innerHTML = `
        <select id="dropdown">
          <option value="csv" selected>CSV</option>
          <option value="xlsx">Excel</option>
        </select>
      `

      const condition: ValueCondition = { selector: '#dropdown', equals: 'csv' }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('returns false when value does not equal expected', () => {
      document.body.innerHTML = '<input id="dropdown" value="xlsx" />'

      const condition: ValueCondition = { selector: '#dropdown', equals: 'csv' }
      expect(checkValueCondition(condition)).toBe(false)
    })

    it('is case-sensitive', () => {
      document.body.innerHTML = '<input id="dropdown" value="CSV" />'

      const condition: ValueCondition = { selector: '#dropdown', equals: 'csv' }
      expect(checkValueCondition(condition)).toBe(false)
    })
  })

  describe('contains', () => {
    it('returns true when value contains substring', () => {
      document.body.innerHTML = '<input id="input" value="hello world" />'

      const condition: ValueCondition = { selector: '#input', contains: 'world' }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('returns false when value does not contain substring', () => {
      document.body.innerHTML = '<input id="input" value="hello" />'

      const condition: ValueCondition = { selector: '#input', contains: 'world' }
      expect(checkValueCondition(condition)).toBe(false)
    })
  })

  describe('not_empty', () => {
    it('returns true when value is not empty', () => {
      document.body.innerHTML = '<input id="input" value="something" />'

      const condition: ValueCondition = { selector: '#input', not_empty: true }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('returns false when value is empty', () => {
      document.body.innerHTML = '<input id="input" value="" />'

      const condition: ValueCondition = { selector: '#input', not_empty: true }
      expect(checkValueCondition(condition)).toBe(false)
    })
  })

  describe('textarea', () => {
    it('returns true when textarea value matches', () => {
      document.body.innerHTML = '<textarea id="text">Hello World</textarea>'

      const condition: ValueCondition = { selector: '#text', contains: 'World' }
      expect(checkValueCondition(condition)).toBe(true)
    })
  })

  describe('custom elements with data attributes', () => {
    it('reads data-value attribute', () => {
      document.body.innerHTML = '<div id="custom" data-value="selected-item">Display Text</div>'

      const condition: ValueCondition = { selector: '#custom', equals: 'selected-item' }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('reads aria-valuenow attribute', () => {
      document.body.innerHTML = '<div id="slider" aria-valuenow="50">50%</div>'

      const condition: ValueCondition = { selector: '#slider', equals: '50' }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('falls back to textContent', () => {
      document.body.innerHTML = '<span id="label">Display Value</span>'

      const condition: ValueCondition = { selector: '#label', equals: 'Display Value' }
      expect(checkValueCondition(condition)).toBe(true)
    })
  })

  describe('element not found', () => {
    it('returns false when element does not exist', () => {
      const condition: ValueCondition = { selector: '#nonexistent', equals: 'value' }
      expect(checkValueCondition(condition)).toBe(false)
    })
  })

  describe('combined conditions', () => {
    it('returns true when all value conditions pass', () => {
      document.body.innerHTML = '<input id="input" value="hello world" />'

      const condition: ValueCondition = {
        selector: '#input',
        contains: 'hello',
        not_empty: true,
      }
      expect(checkValueCondition(condition)).toBe(true)
    })

    it('returns false when any value condition fails', () => {
      document.body.innerHTML = '<input id="input" value="hello" />'

      const condition: ValueCondition = {
        selector: '#input',
        equals: 'hello',
        contains: 'world',
      }
      expect(checkValueCondition(condition)).toBe(false)
    })
  })
})

describe('StepObserver', () => {
  let observer: StepObserver

  beforeEach(() => {
    document.body.innerHTML = ''
    observer = new StepObserver()
    vi.useFakeTimers()
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/page' },
      writable: true,
    })
  })

  afterEach(() => {
    observer.stop()
    vi.useRealTimers()
  })

  describe('start/stop lifecycle', () => {
    it('calls onSuccess immediately if condition is already met', () => {
      document.body.innerHTML = '<div id="target">Content</div>'
      const onSuccess = vi.fn()

      observer.start({ exists: '#target' }, { onSuccess })

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('does not call onSuccess if condition is not met', () => {
      const onSuccess = vi.fn()

      observer.start({ exists: '#nonexistent' }, { onSuccess })

      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('stops polling when stop() is called', () => {
      const onSuccess = vi.fn()

      observer.start({ exists: '#target' }, { onSuccess })
      observer.stop()

      // Add element after stop
      document.body.innerHTML = '<div id="target">Content</div>'
      vi.advanceTimersByTime(500)

      expect(onSuccess).not.toHaveBeenCalled()
    })
  })

  describe('polling for conditions', () => {
    it('detects when element appears via polling', () => {
      const onSuccess = vi.fn()

      observer.start({ exists: '#target' }, { onSuccess })
      expect(onSuccess).not.toHaveBeenCalled()

      // Element appears
      document.body.innerHTML = '<div id="target">Content</div>'
      vi.advanceTimersByTime(100)

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('detects when element becomes visible', () => {
      document.body.innerHTML = '<div id="target" style="display: none">Content</div>'
      const onSuccess = vi.fn()

      observer.start({ visible: '#target' }, { onSuccess })
      expect(onSuccess).not.toHaveBeenCalled()

      // Element becomes visible
      document.querySelector('#target')!.setAttribute('style', '')
      vi.advanceTimersByTime(100)

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('detects URL changes', () => {
      const onSuccess = vi.fn()
      const onUrlChange = vi.fn()

      observer.start(
        { url_contains: 'dashboard' },
        { onSuccess, onUrlChange }
      )
      expect(onSuccess).not.toHaveBeenCalled()

      // URL changes
      window.location.href = 'https://example.com/dashboard'
      vi.advanceTimersByTime(100)

      expect(onUrlChange).toHaveBeenCalledWith('https://example.com/dashboard')
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('detects value changes', () => {
      document.body.innerHTML = '<input id="dropdown" value="json" />'
      const onSuccess = vi.fn()

      observer.start(
        { value: { selector: '#dropdown', equals: 'csv' } },
        { onSuccess }
      )
      expect(onSuccess).not.toHaveBeenCalled()

      // Value changes
      const input = document.querySelector('#dropdown') as HTMLInputElement
      input.value = 'csv'
      vi.advanceTimersByTime(100)

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('uses custom poll interval', () => {
      const onSuccess = vi.fn()

      observer.start(
        { exists: '#target' },
        { onSuccess, pollInterval: 500 }
      )

      document.body.innerHTML = '<div id="target">Content</div>'

      vi.advanceTimersByTime(100)
      expect(onSuccess).not.toHaveBeenCalled()

      vi.advanceTimersByTime(400)
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  describe('click conditions', () => {
    it('detects click on element (click: true)', () => {
      document.body.innerHTML = '<button id="btn">Click me</button>'
      const button = document.querySelector('#btn')!
      const onSuccess = vi.fn()

      observer.start(
        { click: true },
        { onSuccess, stepElement: button }
      )
      expect(onSuccess).not.toHaveBeenCalled()

      // Simulate click
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('detects click on element by selector (click: string)', () => {
      document.body.innerHTML = '<button id="btn">Click me</button>'
      const onSuccess = vi.fn()

      observer.start({ click: '#btn' }, { onSuccess })
      expect(onSuccess).not.toHaveBeenCalled()

      // Simulate click
      document.querySelector('#btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('removes click listener on stop()', () => {
      document.body.innerHTML = '<button id="btn">Click me</button>'
      const button = document.querySelector('#btn')!
      const onSuccess = vi.fn()

      observer.start({ click: '#btn' }, { onSuccess })
      observer.stop()

      // Click after stop
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('handles click with Selector object', () => {
      document.body.innerHTML = '<button data-testid="submit">Submit</button>'
      const onSuccess = vi.fn()

      observer.start(
        { click: { strategies: [{ type: 'testId', value: 'submit' }] } },
        { onSuccess }
      )

      document.querySelector('[data-testid="submit"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  describe('AbortController behavior', () => {
    it('ignores callbacks after stop() via AbortController', async () => {
      const onSuccess = vi.fn()

      observer.start({ exists: '#target' }, { onSuccess })

      // Stop immediately
      observer.stop()

      // Add element and advance time
      document.body.innerHTML = '<div id="target">Content</div>'
      vi.advanceTimersByTime(1000)

      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('handles rapid start/stop cycles', () => {
      const onSuccess1 = vi.fn()
      const onSuccess2 = vi.fn()

      // Start first observation
      observer.start({ exists: '#target1' }, { onSuccess: onSuccess1 })

      // Immediately start second (which calls stop internally)
      observer.start({ exists: '#target2' }, { onSuccess: onSuccess2 })

      // Add first element
      document.body.innerHTML = '<div id="target1">Content</div>'
      vi.advanceTimersByTime(100)

      // First callback should NOT be called (was stopped)
      expect(onSuccess1).not.toHaveBeenCalled()

      // Add second element
      document.body.innerHTML += '<div id="target2">Content</div>'
      vi.advanceTimersByTime(100)

      // Second callback should be called
      expect(onSuccess2).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases', () => {
    it('handles missing stepElement for click: true', () => {
      const onSuccess = vi.fn()

      // No stepElement provided
      observer.start({ click: true }, { onSuccess })

      // Should not throw, just not detect clicks
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('handles element not found for click selector', () => {
      const onSuccess = vi.fn()

      observer.start({ click: '#nonexistent' }, { onSuccess })

      // Should not throw
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('handles multiple conditions with click', () => {
      document.body.innerHTML = '<button id="btn">Click me</button>'
      const onSuccess = vi.fn()

      // Condition: URL must contain "page" AND element must be clicked
      observer.start(
        { url_contains: 'page', click: '#btn' },
        { onSuccess }
      )

      // URL already matches, so polling condition is met
      // But we still need click
      vi.advanceTimersByTime(100)

      // Polling detected url_contains match
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })
})
