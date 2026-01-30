import type { UserContext } from './conditions.js'

/**
 * LLM endpoint configuration
 */
export interface LlmConfig {
  /** Backend endpoint for chat */
  endpoint: string
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  /** Storage type */
  storage: 'session' | 'local' | 'none'
  /** Time-to-live in ms (only for localStorage) */
  ttl?: number
}

/**
 * Clippi initialization configuration
 */
export interface ClippiConfig {
  /** Path to manifest file or manifest object */
  manifest: string | object
  /** LLM backend configuration */
  llm?: LlmConfig
  /** Function to get current user context */
  context?: () => UserContext | Promise<UserContext>
  /** Persistence options */
  persistence?: PersistenceConfig
  /** Enable debug logging */
  debug?: boolean
  /** Default timeout in ms for steps */
  timeout?: number
}

/**
 * Backend request format
 */
export interface ChatRequest {
  messages: ChatMessage[]
  context?: UserContext
  manifest?: { id: string; label: string; description: string; keywords: string[]; category: string }[]
}

/**
 * Chat message format
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Backend response format
 */
export interface ChatResponse {
  action: 'guide' | 'blocked' | 'text'
  targetId?: string
  instruction?: string
  reason?: {
    type: 'plan' | 'permission' | 'state' | 'flag'
    missing?: string
    message?: string
  }
  content?: string
}
