import { closeIconSvg, injectStyles } from '../styles/styles.css.js'

/**
 * Tooltip options
 */
export interface TooltipOptions {
  instruction: string
  stepIndex: number
  totalSteps: number
  onClose?: () => void
  onConfirm?: () => void
}

/**
 * Tooltip component for instructions and progress
 */
export class Tooltip {
  private element: HTMLDivElement | null = null
  private confirmationVisible = false
  private options: TooltipOptions | null = null

  constructor() {
    if (typeof document !== 'undefined') {
      injectStyles()
      this.createElement()
    }
  }

  /**
   * Create the tooltip DOM element
   */
  private createElement(): void {
    this.element = document.createElement('div')
    this.element.className = 'clippi-tooltip'
    this.element.setAttribute('role', 'tooltip')
    document.body.appendChild(this.element)
  }

  /**
   * Show the tooltip near an element
   *
   * @param target Target element to position near
   * @param options Tooltip options
   */
  show(target: Element, options: TooltipOptions): void {
    if (!this.element) return

    this.options = options
    this.confirmationVisible = false
    this.render()
    this.position(target)
    this.element.classList.add('visible')
  }

  /**
   * Update tooltip content
   *
   * @param options New options
   */
  update(options: Partial<TooltipOptions>): void {
    if (this.options) {
      this.options = { ...this.options, ...options }
      this.render()
    }
  }

  /**
   * Show confirmation prompt ("Did you do it?")
   */
  showConfirmation(): void {
    this.confirmationVisible = true
    this.render()
  }

  /**
   * Hide confirmation prompt
   */
  hideConfirmation(): void {
    this.confirmationVisible = false
    this.render()
  }

  /**
   * Render tooltip content
   */
  private render(): void {
    if (!this.element || !this.options) return

    const { instruction, stepIndex, totalSteps, onClose, onConfirm } = this.options

    this.element.innerHTML = `
      <div class="clippi-tooltip-header">
        <span class="clippi-tooltip-progress">[${stepIndex + 1}/${totalSteps}]</span>
        <button class="clippi-tooltip-close" aria-label="Close">${closeIconSvg}</button>
      </div>
      <div class="clippi-tooltip-instruction">${this.escapeHtml(instruction)}</div>
      ${this.confirmationVisible ? `
        <div class="clippi-tooltip-confirmation">
          <span class="clippi-tooltip-confirmation-text">Did you do it?</span>
          <button class="clippi-tooltip-confirm-btn">Yes</button>
        </div>
      ` : ''}
    `

    // Attach event listeners
    const closeBtn = this.element.querySelector('.clippi-tooltip-close')
    closeBtn?.addEventListener('click', () => onClose?.())

    const confirmBtn = this.element.querySelector('.clippi-tooltip-confirm-btn')
    confirmBtn?.addEventListener('click', () => onConfirm?.())
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Position tooltip near target element
   */
  private position(target: Element): void {
    if (!this.element) return

    const targetRect = target.getBoundingClientRect()
    const tooltipRect = this.element.getBoundingClientRect()
    const padding = 12

    // Default: position below and to the right of the element
    let left = targetRect.right + padding
    let top = targetRect.top

    // Check if tooltip would go off-screen horizontally
    if (left + tooltipRect.width > window.innerWidth - padding) {
      // Position to the left of the element instead
      left = targetRect.left - tooltipRect.width - padding
    }

    // If still off-screen, position below the element
    if (left < padding) {
      left = Math.max(padding, targetRect.left)
      top = targetRect.bottom + padding
    }

    // Check if tooltip would go off-screen vertically
    if (top + tooltipRect.height > window.innerHeight - padding) {
      top = window.innerHeight - tooltipRect.height - padding
    }

    if (top < padding) {
      top = padding
    }

    this.element.style.left = `${left}px`
    this.element.style.top = `${top}px`
  }

  /**
   * Reposition tooltip (e.g., after window resize)
   *
   * @param target Target element
   */
  reposition(target: Element): void {
    if (this.element?.classList.contains('visible')) {
      this.position(target)
    }
  }

  /**
   * Hide the tooltip
   */
  hide(): void {
    this.element?.classList.remove('visible')
    this.confirmationVisible = false
  }

  /**
   * Check if tooltip is visible
   */
  isVisible(): boolean {
    return this.element?.classList.contains('visible') ?? false
  }

  /**
   * Destroy the tooltip
   */
  destroy(): void {
    this.element?.remove()
    this.element = null
    this.options = null
  }
}
