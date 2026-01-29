// Web Component
export { ClippiChatElement, registerClippiChat } from './clippi-chat.js'

// Headless API
export { createHeadlessClippi, type HeadlessClippi, type HeadlessClippiConfig } from './headless/use-clippi.js'

// Re-export from core and cursor for convenience
export { Clippi, type ClippiConfig, type ChatResponse, type ChatMessage } from '@clippi/core'
export { Cursor, type CursorConfig, type ThemeOption, themes } from '@clippi/cursor'
