/**
 * Result of actionability check
 */
export interface ActionabilityResult {
  /** Whether the element is actionable */
  ok: boolean
  /** Reason for not being actionable */
  reason?: 'not_attached' | 'hidden' | 'no_size' | 'disabled' | 'out_of_viewport' | 'covered'
  /** Element's bounding rect (if available) */
  rect?: DOMRect
  /** Center point coordinates (if available) */
  center?: { x: number; y: number }
}

/**
 * Offsets from fixed/sticky positioned elements (headers, footers, sidebars)
 */
export interface FixedOffsets {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Find the nearest scrollable ancestor of an element
 * Returns null if no scrollable ancestor is found (window is the scroll container)
 */
export function getScrollParent(el: Element): Element | null {
  let parent = el.parentElement

  while (parent) {
    const style = getComputedStyle(parent)
    const overflowY = style.overflowY
    const overflowX = style.overflowX

    // Check if this element can scroll
    const canScrollY = overflowY === 'auto' || overflowY === 'scroll'
    const canScrollX = overflowX === 'auto' || overflowX === 'scroll'

    if (canScrollY || canScrollX) {
      // Verify it actually has scrollable content
      const hasScrollableContentY = canScrollY && parent.scrollHeight > parent.clientHeight
      const hasScrollableContentX = canScrollX && parent.scrollWidth > parent.clientWidth

      if (hasScrollableContentY || hasScrollableContentX) {
        return parent
      }
    }

    parent = parent.parentElement
  }

  return null
}

/**
 * Detect fixed/sticky elements that reduce the visible viewport area
 * Scans common patterns: headers at top, footers at bottom
 */
export function getFixedOffsets(): FixedOffsets {
  const offsets: FixedOffsets = { top: 0, bottom: 0, left: 0, right: 0 }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth

  // Get all potentially fixed/sticky elements
  const allElements = document.querySelectorAll('*')

  for (const el of allElements) {
    const style = getComputedStyle(el)
    const position = style.position

    if (position !== 'fixed' && position !== 'sticky') {
      continue
    }

    const rect = el.getBoundingClientRect()

    // Skip elements with no size or not visible
    if (rect.width === 0 || rect.height === 0) continue
    if (style.display === 'none' || style.visibility === 'hidden') continue

    // Determine if this is a header (top), footer (bottom), or sidebar
    // Use heuristics: if element spans most of the width and is at top/bottom
    const spansWidth = rect.width > viewportWidth * 0.5
    const spansHeight = rect.height > viewportHeight * 0.5

    if (spansWidth) {
      // Likely a header or footer
      if (rect.top <= 10) {
        // At the top of viewport - it's a header
        offsets.top = Math.max(offsets.top, rect.bottom)
      } else if (rect.bottom >= viewportHeight - 10) {
        // At the bottom of viewport - it's a footer
        offsets.bottom = Math.max(offsets.bottom, viewportHeight - rect.top)
      }
    }

    if (spansHeight) {
      // Likely a sidebar
      if (rect.left <= 10) {
        offsets.left = Math.max(offsets.left, rect.right)
      } else if (rect.right >= viewportWidth - 10) {
        offsets.right = Math.max(offsets.right, viewportWidth - rect.left)
      }
    }
  }

  return offsets
}

/**
 * Check if an element is attached to the DOM
 */
function isAttached(el: Element | null): boolean {
  return el !== null && el.isConnected
}

/**
 * Check if an element is visible (not display:none, visibility:hidden, or opacity:0)
 */
function isVisible(el: Element): boolean {
  const style = getComputedStyle(el)
  if (style.display === 'none') return false
  if (style.visibility === 'hidden') return false
  if (style.opacity === '0') return false
  return true
}

/**
 * Check if an element has actual size (width and height > 0)
 */
function hasSize(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0
}

/**
 * Check if an element is enabled (not disabled)
 */
function isEnabled(el: Element): boolean {
  if ('disabled' in el && (el as HTMLInputElement | HTMLButtonElement).disabled) {
    return false
  }
  return !el.hasAttribute('disabled')
}

/**
 * Check if an element is at least partially visible within a scroll container's bounds
 */
function isVisibleInScrollContainer(
  elementRect: DOMRect,
  scrollParent: Element
): boolean {
  const containerRect = scrollParent.getBoundingClientRect()

  return (
    elementRect.bottom > containerRect.top &&
    elementRect.top < containerRect.bottom &&
    elementRect.right > containerRect.left &&
    elementRect.left < containerRect.right
  )
}

/**
 * Check if an element is at least partially in the viewport
 * Considers fixed offsets (headers/footers) and scroll containers
 */
function isInViewport(
  rect: DOMRect,
  scrollParent: Element | null = null,
  fixedOffsets: FixedOffsets | null = null
): boolean {
  // First check: if there's a scroll container, element must be visible within it
  if (scrollParent && !isVisibleInScrollContainer(rect, scrollParent)) {
    return false
  }

  // Second check: element must be visible in the main viewport (accounting for fixed elements)
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth

  const offsets = fixedOffsets || { top: 0, bottom: 0, left: 0, right: 0 }

  // Effective viewport bounds after accounting for fixed headers/footers
  const effectiveTop = offsets.top
  const effectiveBottom = viewportHeight - offsets.bottom
  const effectiveLeft = offsets.left
  const effectiveRight = viewportWidth - offsets.right

  // Element is at least partially visible if:
  // - Its bottom is below the effective top (rect.bottom > effectiveTop)
  // - Its top is above the effective bottom (rect.top < effectiveBottom)
  // - Its right is past the effective left (rect.right > effectiveLeft)
  // - Its left is before the effective right (rect.left < effectiveRight)
  return (
    rect.bottom > effectiveTop &&
    rect.top < effectiveBottom &&
    rect.right > effectiveLeft &&
    rect.left < effectiveRight
  )
}

/**
 * Check if an element is not covered by another element
 * Uses document.elementFromPoint to detect overlapping elements
 */
function isNotCovered(el: Element, center: { x: number; y: number }): boolean {
  const topEl = document.elementFromPoint(center.x, center.y)
  if (!topEl) return false

  // The element at the center point should be either:
  // 1. The target element itself
  // 2. A descendant of the target element
  // 3. The target element contains the top element
  return el === topEl || el.contains(topEl) || topEl.contains(el)
}

/**
 * Options for actionability checks
 */
export interface ActionabilityOptions {
  /**
   * Whether to check for scroll containers (nested scrollable elements)
   * Default: true
   */
  checkScrollContainers?: boolean
  /**
   * Whether to account for fixed/sticky headers and footers
   * Note: This scans all DOM elements, which may be expensive on large pages
   * Default: false
   */
  checkFixedElements?: boolean
  /**
   * Pre-computed fixed offsets (use this to avoid recalculating on each check)
   */
  fixedOffsets?: FixedOffsets
}

/**
 * Perform all 6 Playwright-inspired actionability checks on an element
 *
 * Checks performed (in order):
 * 1. Attached - Element exists in DOM
 * 2. Visible - Not display:none, visibility:hidden, or opacity:0
 * 3. Has size - Width and height > 0
 * 4. Enabled - Not disabled
 * 5. In viewport - At least partially visible on screen (considers scroll containers and fixed elements)
 * 6. Not covered - No other element blocking it
 *
 * @param el The element to check
 * @param options Configuration for viewport checks
 * @returns ActionabilityResult with ok status and optional reason/rect/center
 */
export function isActionable(
  el: Element | null,
  options: ActionabilityOptions = {}
): ActionabilityResult {
  const {
    checkScrollContainers = true,
    checkFixedElements = false,
    fixedOffsets: precomputedOffsets,
  } = options

  // Check 1: Attached
  if (!isAttached(el)) {
    return { ok: false, reason: 'not_attached' }
  }

  // TypeScript now knows el is not null
  const element = el!

  // Check 2: Visible
  if (!isVisible(element)) {
    return { ok: false, reason: 'hidden' }
  }

  // Get bounding rect for remaining checks
  const rect = element.getBoundingClientRect()

  // Check 3: Has size
  if (!hasSize(rect)) {
    return { ok: false, reason: 'no_size' }
  }

  // Check 4: Enabled
  if (!isEnabled(element)) {
    return { ok: false, reason: 'disabled' }
  }

  // Check 5: In viewport (with scroll container and fixed element awareness)
  const scrollParent = checkScrollContainers ? getScrollParent(element) : null
  const fixedOffsets = precomputedOffsets || (checkFixedElements ? getFixedOffsets() : null)

  if (!isInViewport(rect, scrollParent, fixedOffsets)) {
    return { ok: false, reason: 'out_of_viewport' }
  }

  // Calculate center point
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }

  // Check 6: Not covered
  if (!isNotCovered(element, center)) {
    return { ok: false, reason: 'covered' }
  }

  // All checks passed
  return { ok: true, rect, center }
}

/**
 * Options for scrollIntoViewIfNeeded
 */
export interface ScrollIntoViewIfNeededOptions {
  /**
   * Scroll behavior options passed to scrollIntoView
   */
  scrollOptions?: ScrollIntoViewOptions
  /**
   * Pre-computed fixed offsets to account for fixed headers/footers
   */
  fixedOffsets?: FixedOffsets
  /**
   * Whether to calculate fixed offsets automatically
   * Note: This scans all DOM elements, which may be expensive on large pages
   * Default: false
   */
  checkFixedElements?: boolean
}

/**
 * Check if element is fully visible considering scroll containers and fixed elements
 */
function isFullyVisible(
  el: Element,
  rect: DOMRect,
  fixedOffsets: FixedOffsets | null
): boolean {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth

  const offsets = fixedOffsets || { top: 0, bottom: 0, left: 0, right: 0 }

  // Check visibility in main viewport (accounting for fixed elements)
  const visibleInViewport =
    rect.top >= offsets.top &&
    rect.left >= offsets.left &&
    rect.bottom <= viewportHeight - offsets.bottom &&
    rect.right <= viewportWidth - offsets.right

  if (!visibleInViewport) {
    return false
  }

  // Check visibility within scroll container (if any)
  const scrollParent = getScrollParent(el)
  if (scrollParent) {
    const containerRect = scrollParent.getBoundingClientRect()
    const visibleInContainer =
      rect.top >= containerRect.top &&
      rect.left >= containerRect.left &&
      rect.bottom <= containerRect.bottom &&
      rect.right <= containerRect.right

    if (!visibleInContainer) {
      return false
    }
  }

  return true
}

/**
 * Scroll an element into view if it's not fully visible
 * Handles nested scroll containers and accounts for fixed headers/footers
 *
 * @param el The element to scroll to
 * @param options Configuration options
 */
export function scrollIntoViewIfNeeded(
  el: Element,
  options: ScrollIntoViewIfNeededOptions | ScrollIntoViewOptions = {}
): void {
  // Support legacy API: plain ScrollIntoViewOptions
  const isLegacyOptions = 'behavior' in options || 'block' in options || 'inline' in options
  const {
    scrollOptions = isLegacyOptions ? (options as ScrollIntoViewOptions) : { behavior: 'smooth', block: 'center' },
    fixedOffsets: precomputedOffsets,
    checkFixedElements = false,
  } = isLegacyOptions ? { scrollOptions: options as ScrollIntoViewOptions } : (options as ScrollIntoViewIfNeededOptions)

  const rect = el.getBoundingClientRect()
  const fixedOffsets = precomputedOffsets || (checkFixedElements ? getFixedOffsets() : null)

  if (isFullyVisible(el, rect, fixedOffsets)) {
    return // Already fully visible, no scroll needed
  }

  // First, scroll within nested container if needed
  const scrollParent = getScrollParent(el)
  if (scrollParent) {
    const containerRect = scrollParent.getBoundingClientRect()

    // Check if element is outside the scroll container's visible area
    const outsideContainer =
      rect.top < containerRect.top ||
      rect.bottom > containerRect.bottom ||
      rect.left < containerRect.left ||
      rect.right > containerRect.right

    if (outsideContainer) {
      // Scroll the container to bring element into view
      // Calculate how much to scroll
      let scrollTopDelta = 0
      let scrollLeftDelta = 0

      if (rect.top < containerRect.top) {
        // Element is above the visible area
        scrollTopDelta = rect.top - containerRect.top - (containerRect.height / 2 - rect.height / 2)
      } else if (rect.bottom > containerRect.bottom) {
        // Element is below the visible area
        scrollTopDelta = rect.bottom - containerRect.bottom + (containerRect.height / 2 - rect.height / 2)
      }

      if (rect.left < containerRect.left) {
        scrollLeftDelta = rect.left - containerRect.left - (containerRect.width / 2 - rect.width / 2)
      } else if (rect.right > containerRect.right) {
        scrollLeftDelta = rect.right - containerRect.right + (containerRect.width / 2 - rect.width / 2)
      }

      scrollParent.scrollBy({
        top: scrollTopDelta,
        left: scrollLeftDelta,
        behavior: scrollOptions.behavior || 'smooth',
      })
    }
  }

  // Then scroll the main viewport if needed
  // The native scrollIntoView will handle this, but we need to account for fixed elements
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const offsets = fixedOffsets || { top: 0, bottom: 0, left: 0, right: 0 }

  // Re-get rect after potential container scroll
  const updatedRect = el.getBoundingClientRect()

  const needsViewportScroll =
    updatedRect.top < offsets.top ||
    updatedRect.bottom > viewportHeight - offsets.bottom

  if (needsViewportScroll) {
    // Use scrollIntoView but we may need to adjust for fixed headers
    el.scrollIntoView(scrollOptions)

    // After scrollIntoView, adjust for fixed header if present
    if (offsets.top > 0 && scrollOptions.block !== 'end') {
      // Add extra scroll to account for fixed header
      window.scrollBy({
        top: -offsets.top - 10, // 10px extra padding
        behavior: scrollOptions.behavior || 'smooth',
      })
    }
  }
}
