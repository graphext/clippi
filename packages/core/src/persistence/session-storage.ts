/**
 * Saved session data
 */
export interface SessionData {
  /** Element ID being guided */
  flowId: string
  /** Current step index */
  currentStep: number
  /** Timestamp when flow started */
  startedAt: number
  /** Last update timestamp */
  updatedAt: number
}

const STORAGE_KEY = 'clippi_session'

/**
 * Get storage based on type
 */
function getStorage(type: 'session' | 'local'): Storage | null {
  try {
    const storage = type === 'session' ? sessionStorage : localStorage
    // Test if storage is available
    const testKey = '__clippi_test__'
    storage.setItem(testKey, 'test')
    storage.removeItem(testKey)
    return storage
  } catch {
    // Storage not available (e.g., private browsing in Safari)
    return null
  }
}

/**
 * Session persistence manager
 *
 * Saves flow progress to sessionStorage (or localStorage) so users can
 * resume interrupted flows.
 */
export class SessionPersistence {
  private storage: Storage | null
  private ttl: number | null

  /**
   * Create a session persistence manager
   *
   * @param type Storage type: 'session' clears on tab close, 'local' persists
   * @param ttl Time-to-live in ms for localStorage (ignored for sessionStorage)
   */
  constructor(type: 'session' | 'local' = 'session', ttl?: number) {
    this.storage = getStorage(type)
    this.ttl = type === 'local' ? (ttl ?? 30 * 60 * 1000) : null // Default 30 min for localStorage
  }

  /**
   * Save current session state
   *
   * @param data Session data to save
   */
  save(data: Omit<SessionData, 'updatedAt'>): void {
    if (!this.storage) return

    const session: SessionData = {
      ...data,
      updatedAt: Date.now(),
    }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(session))
    } catch {
      // Storage full or other error - silently fail
    }
  }

  /**
   * Load saved session
   *
   * @returns Session data or null if none saved or expired
   */
  load(): SessionData | null {
    if (!this.storage) return null

    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return null

      const session: SessionData = JSON.parse(raw)

      // Check TTL for localStorage
      if (this.ttl !== null) {
        const age = Date.now() - session.updatedAt
        if (age > this.ttl) {
          this.clear()
          return null
        }
      }

      return session
    } catch {
      // Invalid JSON or other error
      this.clear()
      return null
    }
  }

  /**
   * Update current step in saved session
   *
   * @param currentStep New step index
   */
  updateStep(currentStep: number): void {
    const session = this.load()
    if (session) {
      this.save({
        flowId: session.flowId,
        currentStep,
        startedAt: session.startedAt,
      })
    }
  }

  /**
   * Clear saved session
   */
  clear(): void {
    if (!this.storage) return

    try {
      this.storage.removeItem(STORAGE_KEY)
    } catch {
      // Silently fail
    }
  }

  /**
   * Check if there's a saved session
   */
  hasSavedSession(): boolean {
    return this.load() !== null
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return this.storage !== null
  }
}

/**
 * Create a no-op persistence manager (for 'none' storage option)
 */
export class NullPersistence {
  save(_data: Omit<SessionData, 'updatedAt'>): void {
    // No-op
  }

  load(): SessionData | null {
    return null
  }

  updateStep(_currentStep: number): void {
    // No-op
  }

  clear(): void {
    // No-op
  }

  hasSavedSession(): boolean {
    return false
  }

  isAvailable(): boolean {
    return true
  }
}

/**
 * Create persistence instance based on config
 */
export function createPersistence(
  type: 'session' | 'local' | 'none',
  ttl?: number
): SessionPersistence | NullPersistence {
  if (type === 'none') {
    return new NullPersistence()
  }
  return new SessionPersistence(type, ttl)
}
