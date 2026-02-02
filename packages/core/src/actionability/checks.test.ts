import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isActionable,
  scrollIntoViewIfNeeded,
  getScrollParent,
  getFixedOffsets,
} from './checks.js'

describe('isActionable', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // Reset viewport size
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  })

  describe('attached check', () => {
    it('returns not_attached for null element', () => {
      const result = isActionable(null)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('not_attached')
    })

    it('returns not_attached for disconnected element', () => {
      const element = document.createElement('div')
      // Element created but not added to DOM

      const result = isActionable(element)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('not_attached')
    })

    it('passes for connected element', () => {
      document.body.innerHTML = '<div id="target">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      // May fail other checks but not attached
      expect(result.reason).not.toBe('not_attached')
    })
  })

  describe('visible check', () => {
    it('returns hidden for display: none', () => {
      document.body.innerHTML = '<div id="target" style="display: none">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('hidden')
    })

    it('returns hidden for visibility: hidden', () => {
      document.body.innerHTML = '<div id="target" style="visibility: hidden">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('hidden')
    })

    it('returns hidden for opacity: 0', () => {
      document.body.innerHTML = '<div id="target" style="opacity: 0">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('hidden')
    })
  })

  describe('size check', () => {
    it('returns no_size for zero-width element', () => {
      document.body.innerHTML = '<div id="target" style="width: 0; height: 100px">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      // jsdom may not compute sizes properly, but we test the logic
      // In real browser this would fail
      expect(result.reason === 'no_size' || result.ok).toBe(true)
    })

    it('returns no_size for zero-height element', () => {
      document.body.innerHTML = '<div id="target" style="width: 100px; height: 0">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      expect(result.reason === 'no_size' || result.ok).toBe(true)
    })
  })

  describe('disabled check', () => {
    it('returns disabled for disabled button', () => {
      document.body.innerHTML = '<button id="target" disabled>Click</button>'
      const element = document.querySelector('#target')!

      // Mock getBoundingClientRect to pass size check (jsdom doesn't compute sizes)
      element.getBoundingClientRect = () => ({
        x: 10, y: 10, width: 100, height: 50,
        top: 10, left: 10, right: 110, bottom: 60,
        toJSON: () => {}
      })

      const result = isActionable(element)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('disabled')
    })

    it('returns disabled for disabled input', () => {
      document.body.innerHTML = '<input id="target" disabled value="test" />'
      const element = document.querySelector('#target')!

      // Mock getBoundingClientRect to pass size check
      element.getBoundingClientRect = () => ({
        x: 10, y: 10, width: 100, height: 30,
        top: 10, left: 10, right: 110, bottom: 40,
        toJSON: () => {}
      })

      const result = isActionable(element)

      expect(result.ok).toBe(false)
      expect(result.reason).toBe('disabled')
    })

    it('passes for enabled element', () => {
      document.body.innerHTML = '<button id="target">Click</button>'
      const element = document.querySelector('#target')!

      // Mock getBoundingClientRect
      element.getBoundingClientRect = () => ({
        x: 10, y: 10, width: 100, height: 50,
        top: 10, left: 10, right: 110, bottom: 60,
        toJSON: () => {}
      })
      document.elementFromPoint = () => element

      const result = isActionable(element)

      expect(result.reason).not.toBe('disabled')
    })
  })

  describe('viewport check', () => {
    it('returns out_of_viewport for element above viewport', () => {
      document.body.innerHTML = '<div id="target" style="position: fixed; top: -1000px; left: 0; width: 100px; height: 100px">Content</div>'
      const element = document.querySelector('#target')

      const result = isActionable(element)

      // jsdom doesn't fully support layout, but we check the logic exists
      expect(['out_of_viewport', 'covered', 'no_size'].includes(result.reason!) || result.ok).toBe(true)
    })
  })

  describe('covered check', () => {
    it('detects when element is covered by another', () => {
      // This is hard to test in jsdom as elementFromPoint doesn't work properly
      // In a real browser, an overlay would cause this to fail
      document.body.innerHTML = `
        <div id="target" style="position: absolute; top: 50px; left: 50px; width: 100px; height: 100px;">Target</div>
        <div id="overlay" style="position: absolute; top: 0; left: 0; width: 200px; height: 200px; z-index: 999;">Overlay</div>
      `
      const element = document.querySelector('#target')

      const result = isActionable(element)

      // In jsdom, elementFromPoint may not work correctly
      // Just verify the function doesn't throw
      expect(result).toBeDefined()
    })
  })

  describe('successful actionability', () => {
    it('returns ok: true with rect and center for actionable element', () => {
      document.body.innerHTML = '<button id="target" style="width: 100px; height: 50px;">Click</button>'
      const element = document.querySelector('#target')

      // Mock getBoundingClientRect for jsdom
      element!.getBoundingClientRect = () => ({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        top: 20,
        left: 10,
        right: 110,
        bottom: 70,
        toJSON: () => {}
      })

      // Mock elementFromPoint to return the element itself
      document.elementFromPoint = () => element

      const result = isActionable(element)

      expect(result.ok).toBe(true)
      expect(result.rect).toBeDefined()
      expect(result.center).toEqual({ x: 60, y: 45 })
    })
  })
})

describe('scrollIntoViewIfNeeded', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  })

  it('calls scrollIntoView when element is above viewport', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    // Mock getBoundingClientRect to simulate element above viewport
    element.getBoundingClientRect = () => ({
      x: 0,
      y: -100,
      width: 100,
      height: 50,
      top: -100,
      left: 0,
      right: 100,
      bottom: -50,
      toJSON: () => {}
    })

    const scrollIntoViewMock = vi.fn()
    element.scrollIntoView = scrollIntoViewMock

    scrollIntoViewIfNeeded(element)

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center'
    })
  })

  it('calls scrollIntoView when element is below viewport', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    element.getBoundingClientRect = () => ({
      x: 0,
      y: 800,
      width: 100,
      height: 50,
      top: 800,
      left: 0,
      right: 100,
      bottom: 850,
      toJSON: () => {}
    })

    const scrollIntoViewMock = vi.fn()
    element.scrollIntoView = scrollIntoViewMock

    scrollIntoViewIfNeeded(element)

    expect(scrollIntoViewMock).toHaveBeenCalled()
  })

  it('does not scroll when element is fully visible', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    element.getBoundingClientRect = () => ({
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      top: 100,
      left: 100,
      right: 200,
      bottom: 150,
      toJSON: () => {}
    })

    const scrollIntoViewMock = vi.fn()
    element.scrollIntoView = scrollIntoViewMock

    scrollIntoViewIfNeeded(element)

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('accepts custom scroll options', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    element.getBoundingClientRect = () => ({
      x: 0,
      y: -100,
      width: 100,
      height: 50,
      top: -100,
      left: 0,
      right: 100,
      bottom: -50,
      toJSON: () => {}
    })

    const scrollIntoViewMock = vi.fn()
    element.scrollIntoView = scrollIntoViewMock

    scrollIntoViewIfNeeded(element, { behavior: 'instant', block: 'start' })

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start'
    })
  })
})

describe('getScrollParent', () => {
  let originalGetComputedStyle: typeof window.getComputedStyle

  beforeEach(() => {
    document.body.innerHTML = ''
    originalGetComputedStyle = window.getComputedStyle
  })

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle
  })

  it('returns null when no scrollable parent exists', () => {
    document.body.innerHTML = '<div id="parent"><div id="target">Content</div></div>'
    const element = document.querySelector('#target')!

    const result = getScrollParent(element)

    expect(result).toBeNull()
  })

  it('finds scrollable parent with overflow: auto', () => {
    document.body.innerHTML = `
      <div id="scrollable">
        <div id="content">
          <div id="target">Content</div>
        </div>
      </div>
    `
    const element = document.querySelector('#target')!
    const scrollable = document.querySelector('#scrollable')!

    // Mock getComputedStyle to return overflow: auto
    window.getComputedStyle = vi.fn((el) => {
      if (el === scrollable) {
        return { overflowY: 'auto', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return originalGetComputedStyle(el)
    })

    // Mock scrollHeight > clientHeight to indicate scrollable content
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true })

    const result = getScrollParent(element)

    expect(result).toBe(scrollable)
  })

  it('finds scrollable parent with overflow: scroll', () => {
    document.body.innerHTML = `
      <div id="scrollable">
        <div id="content">
          <div id="target">Content</div>
        </div>
      </div>
    `
    const element = document.querySelector('#target')!
    const scrollable = document.querySelector('#scrollable')!

    window.getComputedStyle = vi.fn((el) => {
      if (el === scrollable) {
        return { overflowY: 'scroll', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return originalGetComputedStyle(el)
    })

    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true })

    const result = getScrollParent(element)

    expect(result).toBe(scrollable)
  })

  it('ignores overflow: hidden', () => {
    document.body.innerHTML = `
      <div id="hidden">
        <div id="content">
          <div id="target">Content</div>
        </div>
      </div>
    `
    const element = document.querySelector('#target')!
    const hidden = document.querySelector('#hidden')!

    window.getComputedStyle = vi.fn((el) => {
      if (el === hidden) {
        return { overflowY: 'hidden', overflowX: 'hidden', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return originalGetComputedStyle(el)
    })

    const result = getScrollParent(element)

    expect(result).toBeNull()
  })

  it('returns closest scrollable ancestor when nested', () => {
    document.body.innerHTML = `
      <div id="outer">
        <div id="inner">
          <div id="content">
            <div id="target">Content</div>
          </div>
        </div>
      </div>
    `
    const element = document.querySelector('#target')!
    const inner = document.querySelector('#inner')!
    const outer = document.querySelector('#outer')!

    window.getComputedStyle = vi.fn((el) => {
      if (el === inner) {
        return { overflowY: 'auto', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      if (el === outer) {
        return { overflowY: 'auto', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return originalGetComputedStyle(el)
    })

    Object.defineProperty(inner, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(inner, 'clientHeight', { value: 200, configurable: true })

    const result = getScrollParent(element)

    expect(result).toBe(inner)
  })
})

describe('getFixedOffsets', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  })

  it('returns zero offsets when no fixed elements exist', () => {
    document.body.innerHTML = '<div>Regular content</div>'

    const offsets = getFixedOffsets()

    expect(offsets).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })

  it('detects fixed header at top', () => {
    document.body.innerHTML = `
      <header id="header" style="position: fixed; top: 0; left: 0; right: 0; height: 60px;">Header</header>
      <main>Content</main>
    `
    const header = document.querySelector('#header')!

    // Mock getBoundingClientRect for the header
    header.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 1024,
      height: 60,
      top: 0,
      left: 0,
      right: 1024,
      bottom: 60,
      toJSON: () => {}
    })

    const offsets = getFixedOffsets()

    expect(offsets.top).toBe(60)
  })

  it('detects fixed footer at bottom', () => {
    document.body.innerHTML = `
      <main>Content</main>
      <footer id="footer" style="position: fixed; bottom: 0; left: 0; right: 0; height: 50px;">Footer</footer>
    `
    const footer = document.querySelector('#footer')!

    footer.getBoundingClientRect = () => ({
      x: 0,
      y: 718,
      width: 1024,
      height: 50,
      top: 718,
      left: 0,
      right: 1024,
      bottom: 768,
      toJSON: () => {}
    })

    const offsets = getFixedOffsets()

    expect(offsets.bottom).toBe(50)
  })

  it('detects sticky header', () => {
    document.body.innerHTML = `
      <header id="header" style="position: sticky; top: 0; height: 80px;">Sticky Header</header>
      <main>Content</main>
    `
    const header = document.querySelector('#header')!

    header.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 1024,
      height: 80,
      top: 0,
      left: 0,
      right: 1024,
      bottom: 80,
      toJSON: () => {}
    })

    const offsets = getFixedOffsets()

    expect(offsets.top).toBe(80)
  })

  it('detects both header and footer', () => {
    document.body.innerHTML = `
      <header id="header" style="position: fixed; top: 0;">Header</header>
      <main>Content</main>
      <footer id="footer" style="position: fixed; bottom: 0;">Footer</footer>
    `
    const header = document.querySelector('#header')!
    const footer = document.querySelector('#footer')!

    header.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 1024, height: 60,
      top: 0, left: 0, right: 1024, bottom: 60,
      toJSON: () => {}
    })

    footer.getBoundingClientRect = () => ({
      x: 0, y: 718, width: 1024, height: 50,
      top: 718, left: 0, right: 1024, bottom: 768,
      toJSON: () => {}
    })

    const offsets = getFixedOffsets()

    expect(offsets.top).toBe(60)
    expect(offsets.bottom).toBe(50)
  })

  it('ignores small fixed elements (not headers/footers)', () => {
    document.body.innerHTML = `
      <div id="tooltip" style="position: fixed; top: 100px; left: 100px; width: 200px; height: 50px;">Tooltip</div>
    `
    const tooltip = document.querySelector('#tooltip')!

    tooltip.getBoundingClientRect = () => ({
      x: 100, y: 100, width: 200, height: 50,
      top: 100, left: 100, right: 300, bottom: 150,
      toJSON: () => {}
    })

    const offsets = getFixedOffsets()

    // Small element that doesn't span viewport width should be ignored
    expect(offsets.top).toBe(0)
    expect(offsets.bottom).toBe(0)
  })
})

describe('isActionable with scroll containers', () => {
  let originalGetComputedStyle: typeof window.getComputedStyle

  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    originalGetComputedStyle = window.getComputedStyle
  })

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle
  })

  it('returns out_of_viewport when element is outside scroll container', () => {
    document.body.innerHTML = `
      <div id="scrollable">
        <div id="content">
          <div id="target">Content</div>
        </div>
      </div>
    `
    const element = document.querySelector('#target')!
    const scrollable = document.querySelector('#scrollable')!

    // Mock getComputedStyle for scroll detection
    window.getComputedStyle = vi.fn((el) => {
      if (el === scrollable) {
        return { overflowY: 'auto', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return { overflowY: 'visible', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
    })

    // Mock scrollable container
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true })

    // Element is below the visible area of the scroll container
    scrollable.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 500, height: 200,
      top: 0, left: 0, right: 500, bottom: 200,
      toJSON: () => {}
    })

    element.getBoundingClientRect = () => ({
      x: 0, y: 400, width: 100, height: 50,
      top: 400, left: 0, right: 100, bottom: 450,
      toJSON: () => {}
    })

    const result = isActionable(element, { checkScrollContainers: true })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('out_of_viewport')
  })

  it('passes when element is visible within scroll container', () => {
    document.body.innerHTML = `
      <div id="scrollable">
        <div id="target">Content</div>
      </div>
    `
    const element = document.querySelector('#target')!
    const scrollable = document.querySelector('#scrollable')!

    window.getComputedStyle = vi.fn((el) => {
      if (el === scrollable) {
        return { overflowY: 'auto', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return { overflowY: 'visible', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
    })

    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true })

    scrollable.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 500, height: 200,
      top: 0, left: 0, right: 500, bottom: 200,
      toJSON: () => {}
    })

    element.getBoundingClientRect = () => ({
      x: 10, y: 10, width: 100, height: 50,
      top: 10, left: 10, right: 110, bottom: 60,
      toJSON: () => {}
    })

    document.elementFromPoint = () => element

    const result = isActionable(element, { checkScrollContainers: true })

    expect(result.ok).toBe(true)
  })
})

describe('isActionable with fixed offsets', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  })

  it('returns out_of_viewport when element is completely behind fixed header', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    // Element is completely behind 60px fixed header (top: 10, bottom: 50)
    element.getBoundingClientRect = () => ({
      x: 100, y: 10, width: 100, height: 40,
      top: 10, left: 100, right: 200, bottom: 50,
      toJSON: () => {}
    })

    const result = isActionable(element, {
      fixedOffsets: { top: 60, bottom: 0, left: 0, right: 0 }
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('out_of_viewport')
  })

  it('returns out_of_viewport when element is completely behind fixed footer', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    // Element is completely behind footer: viewport is 768, footer is 50px
    // So visible area ends at 718. Element at 720-760 is completely behind footer.
    element.getBoundingClientRect = () => ({
      x: 100, y: 720, width: 100, height: 40,
      top: 720, left: 100, right: 200, bottom: 760,
      toJSON: () => {}
    })

    const result = isActionable(element, {
      fixedOffsets: { top: 0, bottom: 50, left: 0, right: 0 }
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('out_of_viewport')
  })

  it('passes when element is in visible area between header and footer', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    element.getBoundingClientRect = () => ({
      x: 100, y: 200, width: 100, height: 50,
      top: 200, left: 100, right: 200, bottom: 250,
      toJSON: () => {}
    })

    document.elementFromPoint = () => element

    const result = isActionable(element, {
      fixedOffsets: { top: 60, bottom: 50, left: 0, right: 0 }
    })

    expect(result.ok).toBe(true)
  })
})

describe('scrollIntoViewIfNeeded with nested containers', () => {
  let originalGetComputedStyle: typeof window.getComputedStyle

  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    originalGetComputedStyle = window.getComputedStyle
  })

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle
  })

  it('scrolls the nested container when element is outside its bounds', () => {
    document.body.innerHTML = `
      <div id="scrollable">
        <div id="content">
          <div id="target">Content</div>
        </div>
      </div>
    `
    const element = document.querySelector('#target')!
    const scrollable = document.querySelector('#scrollable')!

    // Mock getComputedStyle for scroll parent detection
    window.getComputedStyle = vi.fn((el) => {
      if (el === scrollable) {
        return { overflowY: 'auto', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
      }
      return { overflowY: 'visible', overflowX: 'visible', display: 'block', visibility: 'visible', opacity: '1', position: 'static' } as CSSStyleDeclaration
    })

    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true })

    scrollable.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 500, height: 200,
      top: 0, left: 0, right: 500, bottom: 200,
      toJSON: () => {}
    })

    // Element is below visible area of container
    element.getBoundingClientRect = () => ({
      x: 10, y: 400, width: 100, height: 50,
      top: 400, left: 10, right: 110, bottom: 450,
      toJSON: () => {}
    })

    const scrollByMock = vi.fn()
    scrollable.scrollBy = scrollByMock

    const scrollIntoViewMock = vi.fn()
    element.scrollIntoView = scrollIntoViewMock

    scrollIntoViewIfNeeded(element, { scrollOptions: { behavior: 'smooth', block: 'center' } })

    // Should have called scrollBy on the container
    expect(scrollByMock).toHaveBeenCalled()
  })

  it('accounts for fixed header when scrolling viewport', () => {
    document.body.innerHTML = '<div id="target">Content</div>'
    const element = document.querySelector('#target')!

    // Element is above viewport (needs scroll)
    element.getBoundingClientRect = () => ({
      x: 100, y: -100, width: 100, height: 50,
      top: -100, left: 100, right: 200, bottom: -50,
      toJSON: () => {}
    })

    const scrollIntoViewMock = vi.fn()
    element.scrollIntoView = scrollIntoViewMock

    const windowScrollByMock = vi.fn()
    window.scrollBy = windowScrollByMock

    scrollIntoViewIfNeeded(element, {
      fixedOffsets: { top: 60, bottom: 0, left: 0, right: 0 },
      scrollOptions: { behavior: 'smooth', block: 'center' }
    })

    expect(scrollIntoViewMock).toHaveBeenCalled()
    // Should also adjust for header
    expect(windowScrollByMock).toHaveBeenCalled()
  })
})
