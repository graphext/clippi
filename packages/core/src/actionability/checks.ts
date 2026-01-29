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
 * Check if an element is at least partially in the viewport
 */
function isInViewport(rect: DOMRect): boolean {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth

  // Element is at least partially visible if:
  // - Its bottom is below the viewport top (rect.bottom > 0)
  // - Its top is above the viewport bottom (rect.top < viewportHeight)
  // - Its right is past the viewport left (rect.right > 0)
  // - Its left is before the viewport right (rect.left < viewportWidth)
  return (
    rect.bottom > 0 &&
    rect.top < viewportHeight &&
    rect.right > 0 &&
    rect.left < viewportWidth
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
 * Perform all 6 Playwright-inspired actionability checks on an element
 *
 * Checks performed (in order):
 * 1. Attached - Element exists in DOM
 * 2. Visible - Not display:none, visibility:hidden, or opacity:0
 * 3. Has size - Width and height > 0
 * 4. Enabled - Not disabled
 * 5. In viewport - At least partially visible on screen
 * 6. Not covered - No other element blocking it
 *
 * @param el The element to check
 * @returns ActionabilityResult with ok status and optional reason/rect/center
 */
export function isActionable(el: Element | null): ActionabilityResult {
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

  // Check 5: In viewport
  if (!isInViewport(rect)) {
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
 * Scroll an element into view if it's out of viewport
 *
 * @param el The element to scroll to
 * @param options Scroll behavior options
 */
export function scrollIntoViewIfNeeded(
  el: Element,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' }
): void {
  const rect = el.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth

  const isFullyVisible =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewportHeight &&
    rect.right <= viewportWidth

  if (!isFullyVisible) {
    el.scrollIntoView(options)
  }
}
