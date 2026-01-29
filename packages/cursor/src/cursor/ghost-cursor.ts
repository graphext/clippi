import { cursorSvg, injectStyles } from '../styles/styles.css.js'

/**
 * Ghost cursor state
 */
export type CursorState = 'hidden' | 'visible' | 'animating'

/**
 * Ghost Cursor - Figma multiplayer style animated cursor
 */
export class GhostCursor {
  private element: HTMLDivElement | null = null
  private state: CursorState = 'hidden'
  private currentPosition = { x: 0, y: 0 }
  private targetPosition = { x: 0, y: 0 }
  private animationFrame: number | null = null

  constructor() {
    if (typeof document !== 'undefined') {
      injectStyles()
      this.createElement()
    }
  }

  /**
   * Create the cursor DOM element
   */
  private createElement(): void {
    this.element = document.createElement('div')
    this.element.className = 'clippi-cursor'
    this.element.innerHTML = cursorSvg
    this.element.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.element)
  }

  /**
   * Get current state
   */
  getState(): CursorState {
    return this.state
  }

  /**
   * Move cursor to a position (instant)
   *
   * @param x X coordinate
   * @param y Y coordinate
   */
  moveTo(x: number, y: number): void {
    this.currentPosition = { x, y }
    this.targetPosition = { x, y }
    this.updatePosition()
  }

  /**
   * Animate cursor to a position
   *
   * @param x X coordinate
   * @param y Y coordinate
   * @param duration Animation duration in ms
   * @returns Promise that resolves when animation completes
   */
  animateTo(x: number, y: number, duration = 500): Promise<void> {
    return new Promise((resolve) => {
      if (!this.element) {
        resolve()
        return
      }

      // Check for reduced motion preference
      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      if (prefersReducedMotion) {
        // Instant move for reduced motion
        this.moveTo(x, y)
        resolve()
        return
      }

      this.targetPosition = { x, y }
      this.state = 'animating'
      this.element.classList.add('animating')

      const startPosition = { ...this.currentPosition }
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3)

        this.currentPosition = {
          x: startPosition.x + (this.targetPosition.x - startPosition.x) * eased,
          y: startPosition.y + (this.targetPosition.y - startPosition.y) * eased,
        }

        this.updatePosition()

        if (progress < 1) {
          this.animationFrame = requestAnimationFrame(animate)
        } else {
          this.element?.classList.remove('animating')
          this.state = 'visible'
          resolve()
        }
      }

      this.animationFrame = requestAnimationFrame(animate)
    })
  }

  /**
   * Animate cursor to an element's center
   *
   * @param element Target element
   * @param duration Animation duration in ms
   * @returns Promise that resolves when animation completes
   */
  async animateToElement(element: Element, duration = 500): Promise<void> {
    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    await this.animateTo(centerX, centerY, duration)
  }

  /**
   * Update DOM position
   */
  private updatePosition(): void {
    if (this.element) {
      this.element.style.transform = `translate(${this.currentPosition.x}px, ${this.currentPosition.y}px)`
    }
  }

  /**
   * Show the cursor
   */
  show(): void {
    if (this.element) {
      this.element.classList.add('visible')
      this.state = 'visible'
    }
  }

  /**
   * Hide the cursor
   */
  hide(): void {
    if (this.element) {
      this.element.classList.remove('visible')
      this.state = 'hidden'
    }
  }

  /**
   * Cancel any ongoing animation
   */
  cancelAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.element?.classList.remove('animating')
  }

  /**
   * Destroy the cursor
   */
  destroy(): void {
    this.cancelAnimation()
    this.element?.remove()
    this.element = null
    this.state = 'hidden'
  }
}
