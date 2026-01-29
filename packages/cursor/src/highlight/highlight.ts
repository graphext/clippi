import { injectStyles } from '../styles/styles.css.js'

/**
 * Highlight options
 */
export interface HighlightOptions {
  /** Enable pulsing animation */
  pulse?: boolean
  /** Padding around the element */
  padding?: number
}

/**
 * Element highlight component - shows a border around target elements
 */
export class Highlight {
  private element: HTMLDivElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private targetElement: Element | null = null

  constructor() {
    if (typeof document !== 'undefined') {
      injectStyles()
      this.createElement()
    }
  }

  /**
   * Create the highlight DOM element
   */
  private createElement(): void {
    this.element = document.createElement('div')
    this.element.className = 'clippi-highlight'
    this.element.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.element)
  }

  /**
   * Show highlight around an element
   *
   * @param target Element to highlight
   * @param options Highlight options
   */
  show(target: Element, options: HighlightOptions = {}): void {
    if (!this.element) return

    const { pulse = true, padding = 4 } = options

    this.targetElement = target
    this.updatePosition(padding)

    // Set up resize observer to track element changes
    this.setupResizeObserver(padding)

    // Apply pulse animation
    if (pulse) {
      this.element.classList.add('pulse')
    } else {
      this.element.classList.remove('pulse')
    }

    this.element.classList.add('visible')
  }

  /**
   * Update highlight position
   */
  private updatePosition(padding: number): void {
    if (!this.element || !this.targetElement) return

    const rect = this.targetElement.getBoundingClientRect()

    this.element.style.left = `${rect.left - padding}px`
    this.element.style.top = `${rect.top - padding}px`
    this.element.style.width = `${rect.width + padding * 2}px`
    this.element.style.height = `${rect.height + padding * 2}px`
  }

  /**
   * Set up resize observer for target element
   */
  private setupResizeObserver(padding: number): void {
    this.cleanupResizeObserver()

    if (!this.targetElement || typeof ResizeObserver === 'undefined') return

    this.resizeObserver = new ResizeObserver(() => {
      this.updatePosition(padding)
    })

    this.resizeObserver.observe(this.targetElement)
  }

  /**
   * Clean up resize observer
   */
  private cleanupResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }

  /**
   * Reposition highlight (e.g., after scroll)
   *
   * @param padding Padding around element
   */
  reposition(padding = 4): void {
    if (this.element?.classList.contains('visible') && this.targetElement) {
      this.updatePosition(padding)
    }
  }

  /**
   * Hide the highlight
   */
  hide(): void {
    this.cleanupResizeObserver()
    this.element?.classList.remove('visible', 'pulse')
    this.targetElement = null
  }

  /**
   * Check if highlight is visible
   */
  isVisible(): boolean {
    return this.element?.classList.contains('visible') ?? false
  }

  /**
   * Destroy the highlight
   */
  destroy(): void {
    this.cleanupResizeObserver()
    this.element?.remove()
    this.element = null
    this.targetElement = null
  }
}
