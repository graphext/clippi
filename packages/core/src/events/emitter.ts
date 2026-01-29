import type { ClippiEvents, ClippiEventHandler } from '../types/events.js'

type EventMap = {
  [K in keyof ClippiEvents]: Set<ClippiEventHandler<K>>
}

/**
 * Minimal event emitter for Clippi events (~30 lines, zero deps)
 */
export class EventEmitter {
  private listeners: Partial<EventMap> = {}

  /**
   * Subscribe to an event
   *
   * @param event Event name
   * @param handler Event handler function
   * @returns Unsubscribe function
   */
  on<K extends keyof ClippiEvents>(event: K, handler: ClippiEventHandler<K>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as EventMap[K]
    }
    ;(this.listeners[event] as Set<ClippiEventHandler<K>>).add(handler)

    // Return unsubscribe function
    return () => this.off(event, handler)
  }

  /**
   * Subscribe to an event once (automatically unsubscribes after first call)
   *
   * @param event Event name
   * @param handler Event handler function
   * @returns Unsubscribe function
   */
  once<K extends keyof ClippiEvents>(event: K, handler: ClippiEventHandler<K>): () => void {
    const wrapper = ((...args: Parameters<ClippiEventHandler<K>>) => {
      this.off(event, wrapper as ClippiEventHandler<K>)
      ;(handler as (...args: unknown[]) => void)(...args)
    }) as ClippiEventHandler<K>

    return this.on(event, wrapper)
  }

  /**
   * Unsubscribe from an event
   *
   * @param event Event name
   * @param handler Event handler to remove
   */
  off<K extends keyof ClippiEvents>(event: K, handler: ClippiEventHandler<K>): void {
    const handlers = this.listeners[event] as Set<ClippiEventHandler<K>> | undefined
    if (handlers) {
      handlers.delete(handler)
    }
  }

  /**
   * Emit an event with arguments
   *
   * @param event Event name
   * @param args Event arguments
   */
  emit<K extends keyof ClippiEvents>(event: K, ...args: Parameters<ClippiEventHandler<K>>): void {
    const handlers = this.listeners[event] as Set<ClippiEventHandler<K>> | undefined
    if (handlers) {
      for (const handler of handlers) {
        try {
          ;(handler as (...args: unknown[]) => void)(...args)
        } catch (error) {
          // Emit error event if available, otherwise log to console
          if (event !== 'error' && this.listeners.error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)))
          } else {
            console.error(`Error in ${event} handler:`, error)
          }
        }
      }
    }
  }

  /**
   * Remove all listeners for an event, or all events if no event specified
   *
   * @param event Optional event name
   */
  removeAllListeners<K extends keyof ClippiEvents>(event?: K): void {
    if (event) {
      delete this.listeners[event]
    } else {
      this.listeners = {}
    }
  }

  /**
   * Get the number of listeners for an event
   *
   * @param event Event name
   * @returns Number of listeners
   */
  listenerCount<K extends keyof ClippiEvents>(event: K): number {
    const handlers = this.listeners[event]
    return handlers ? handlers.size : 0
  }
}
