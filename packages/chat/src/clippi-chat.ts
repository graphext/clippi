import {
  Clippi,
  type ClippiConfig,
  type ChatMessage,
  type StepInfo,
  type FlowInfo,
} from '@clippi/core'
import { Cursor, type ThemeOption } from '@clippi/cursor'
import { chatStyles, chatIconSvg, closeIconSvg, clippiIconSvg } from './styles/chat.css.js'

/**
 * Attributes supported by <clippi-chat>
 */
export interface ClippiChatAttributes {
  manifest?: string
  endpoint?: string
  theme?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  placeholder?: string
  title?: string
}

/**
 * <clippi-chat> Web Component
 *
 * Usage:
 * ```html
 * <clippi-chat
 *   manifest="/guide.manifest.json"
 *   endpoint="/api/clippi/chat"
 *   theme="auto"
 *   position="bottom-right"
 * />
 * ```
 */
export class ClippiChatElement extends HTMLElement {
  private shadow: ShadowRoot
  private clippi: Clippi | null = null
  private cursor: Cursor | null = null
  private isOpen = false
  private isLoading = false
  private messages: ChatMessage[] = []

  // DOM elements
  private container!: HTMLDivElement
  private fab!: HTMLButtonElement
  private panel!: HTMLDivElement
  private messagesContainer!: HTMLDivElement
  private input!: HTMLInputElement
  private sendButton!: HTMLButtonElement

  static get observedAttributes(): string[] {
    return ['manifest', 'endpoint', 'theme', 'position', 'placeholder', 'title']
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
    this.initialize()
  }

  disconnectedCallback(): void {
    this.clippi?.destroy()
    this.cursor?.destroy()
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return

    if (name === 'theme' && this.cursor && newValue) {
      this.cursor.setTheme(newValue as ThemeOption)
    }

    if (name === 'position') {
      this.updatePosition()
    }
  }

  /**
   * Render the component
   */
  private render(): void {
    const position = this.getAttribute('position') || 'bottom-right'
    const title = this.getAttribute('title') || 'Clippi'
    const placeholder = this.getAttribute('placeholder') || 'Ask me anything...'

    this.shadow.innerHTML = `
      <style>${chatStyles}</style>
      <div class="clippi-chat-container" part="container" style="${this.getPositionStyles(position)}">
        <button class="clippi-fab" part="fab" aria-label="Open chat">
          ${chatIconSvg}
        </button>
        <div class="clippi-panel" part="panel">
          <div class="clippi-header" part="header">
            <span class="clippi-header-title">${this.escapeHtml(title)}</span>
            <button class="clippi-header-close" aria-label="Close chat">
              ${closeIconSvg}
            </button>
          </div>
          <div class="clippi-messages" part="messages">
            <div class="clippi-welcome">
              <div class="clippi-welcome-icon">${clippiIconSvg}</div>
              <div class="clippi-welcome-title">Hi! I'm Clippi</div>
              <div>I can guide you through the interface. Just ask!</div>
            </div>
          </div>
          <div class="clippi-input-area" part="input-area">
            <input
              class="clippi-input"
              part="input"
              type="text"
              placeholder="${this.escapeHtml(placeholder)}"
              aria-label="Message input"
            />
            <button class="clippi-send" part="send-button">Send</button>
          </div>
        </div>
      </div>
    `

    // Cache DOM references
    this.container = this.shadow.querySelector('.clippi-chat-container')!
    this.fab = this.shadow.querySelector('.clippi-fab')!
    this.panel = this.shadow.querySelector('.clippi-panel')!
    this.messagesContainer = this.shadow.querySelector('.clippi-messages')!
    this.input = this.shadow.querySelector('.clippi-input')!
    this.sendButton = this.shadow.querySelector('.clippi-send')!
  }

  /**
   * Get position styles based on attribute
   */
  private getPositionStyles(position: string): string {
    const positions: Record<string, string> = {
      'bottom-right': 'bottom: 24px; right: 24px;',
      'bottom-left': 'bottom: 24px; left: 24px;',
      'top-right': 'top: 24px; right: 24px;',
      'top-left': 'top: 24px; left: 24px;',
    }
    return positions[position] || positions['bottom-right']
  }

  /**
   * Update position when attribute changes
   */
  private updatePosition(): void {
    const position = this.getAttribute('position') || 'bottom-right'
    this.container.style.cssText = this.getPositionStyles(position)
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // FAB click
    this.fab.addEventListener('click', () => this.toggle())

    // Close button
    const closeBtn = this.shadow.querySelector('.clippi-header-close')!
    closeBtn.addEventListener('click', () => this.close())

    // Send button
    this.sendButton.addEventListener('click', () => this.send())

    // Input enter key
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.send()
      }
    })
  }

  /**
   * Initialize Clippi and Cursor
   */
  private async initialize(): Promise<void> {
    const manifest = this.getAttribute('manifest')
    const endpoint = this.getAttribute('endpoint')
    const theme = (this.getAttribute('theme') || 'auto') as ThemeOption

    if (!manifest) {
      console.warn('[clippi-chat] No manifest attribute provided')
      return
    }

    try {
      // Initialize cursor
      this.cursor = Cursor.init({ theme })

      // Initialize Clippi
      const config: ClippiConfig = {
        manifest,
        debug: false,
      }

      if (endpoint) {
        config.llm = { endpoint }
      }

      this.clippi = await Clippi.init(config)

      // Set up event handlers
      this.clippi.on('beforeGuide', (step) => this.handleBeforeGuide(step))
      this.clippi.on('stepCompleted', (step) => this.handleStepCompleted(step))
      this.clippi.on('flowCompleted', (flow, duration) => this.handleFlowCompleted(flow, duration))
      this.clippi.on('blocked', (element, result) => this.handleBlocked(element, result))
      this.clippi.on('error', (error) => console.error('[clippi-chat]', error))

      // Dispatch ready event
      this.dispatchEvent(new CustomEvent('ready', { detail: { clippi: this.clippi } }))
    } catch (error) {
      console.error('[clippi-chat] Initialization failed:', error)
    }
  }

  /**
   * Handle before guide event - show cursor
   */
  private handleBeforeGuide(step: StepInfo): void {
    this.cursor?.pointTo(step.domElement, {
      instruction: step.instruction,
      stepIndex: step.stepIndex,
      totalSteps: step.totalSteps,
      onCancel: () => {
        this.clippi?.cancel()
        this.cursor?.hide()
      },
      onConfirm: () => {
        this.clippi?.confirmStep()
      },
    })
  }

  /**
   * Handle step completed
   */
  private handleStepCompleted(_step: StepInfo): void {
    // Cursor will update on next beforeGuide
  }

  /**
   * Handle flow completed
   */
  private handleFlowCompleted(_flow: FlowInfo, _duration: number): void {
    this.cursor?.hide()
  }

  /**
   * Handle blocked access
   */
  private handleBlocked(target: { id: string; label: string }, result: { message?: string }): void {
    const message = result.message || `Access to "${target.label}" is not available`
    this.addMessage({ role: 'assistant', content: message })
  }

  /**
   * Toggle panel open/closed
   */
  toggle(): void {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  /**
   * Open the panel
   */
  open(): void {
    this.isOpen = true
    this.fab.classList.add('hidden')
    this.panel.classList.add('open')
    this.input.focus()
    this.dispatchEvent(new CustomEvent('open'))
  }

  /**
   * Close the panel
   */
  close(): void {
    this.isOpen = false
    this.fab.classList.remove('hidden')
    this.panel.classList.remove('open')
    this.dispatchEvent(new CustomEvent('close'))
  }

  /**
   * Send a message
   */
  private async send(): Promise<void> {
    const query = this.input.value.trim()
    if (!query || this.isLoading || !this.clippi) return

    // Clear input
    this.input.value = ''

    // Add user message
    this.addMessage({ role: 'user', content: query })

    // Show loading
    this.isLoading = true
    this.sendButton.disabled = true
    this.showTyping()

    try {
      // Ask Clippi
      const response = await this.clippi.ask(query)

      // Remove typing indicator
      this.hideTyping()

      // Handle response based on action
      if (response.action === 'text' && response.content) {
        this.addMessage({ role: 'assistant', content: response.content })
      } else if (response.action === 'guide') {
        this.addMessage({
          role: 'assistant',
          content: response.instruction || 'Let me show you...',
        })
      }
      // Blocked is handled by the blocked event
    } catch (error) {
      this.hideTyping()
      this.addMessage({
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      })
      console.error('[clippi-chat] Error:', error)
    } finally {
      this.isLoading = false
      this.sendButton.disabled = false
    }
  }

  /**
   * Add a message to the chat
   */
  private addMessage(message: ChatMessage): void {
    this.messages.push(message)
    this.renderMessages()
  }

  /**
   * Render all messages
   */
  private renderMessages(): void {
    // Remove welcome message if there are messages
    const welcome = this.messagesContainer.querySelector('.clippi-welcome')
    if (this.messages.length > 0 && welcome) {
      welcome.remove()
    }

    // Only render new messages (simple approach - re-render all)
    const typing = this.messagesContainer.querySelector('.clippi-typing')
    this.messagesContainer.innerHTML = this.messages
      .map(
        (msg) =>
          `<div class="clippi-message ${msg.role}" part="message message-${msg.role}">${this.escapeHtml(msg.content)}</div>`
      )
      .join('')

    // Re-add typing if it was there
    if (typing) {
      this.messagesContainer.appendChild(typing)
    }

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  /**
   * Show typing indicator
   */
  private showTyping(): void {
    const typing = document.createElement('div')
    typing.className = 'clippi-typing'
    typing.innerHTML = `
      <span class="clippi-typing-dot"></span>
      <span class="clippi-typing-dot"></span>
      <span class="clippi-typing-dot"></span>
    `
    this.messagesContainer.appendChild(typing)
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  /**
   * Hide typing indicator
   */
  private hideTyping(): void {
    const typing = this.messagesContainer.querySelector('.clippi-typing')
    typing?.remove()
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
   * Get the Clippi instance
   */
  getClippi(): Clippi | null {
    return this.clippi
  }

  /**
   * Get the Cursor instance
   */
  getCursor(): Cursor | null {
    return this.cursor
  }

  /**
   * Clear chat messages
   */
  clearMessages(): void {
    this.messages = []
    this.clippi?.clearMessages()
    this.messagesContainer.innerHTML = `
      <div class="clippi-welcome">
        <div class="clippi-welcome-icon">${clippiIconSvg}</div>
        <div class="clippi-welcome-title">Hi! I'm Clippi</div>
        <div>I can guide you through the interface. Just ask!</div>
      </div>
    `
  }
}

/**
 * Register the custom element
 */
export function registerClippiChat(tagName = 'clippi-chat'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, ClippiChatElement)
  }
}

// Auto-register when imported in browser
if (typeof window !== 'undefined') {
  registerClippiChat()
}
