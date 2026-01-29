// Main Cursor class
export { Cursor, type CursorConfig, type PointToOptions } from './cursor.js'

// Individual components
export { GhostCursor, type CursorState } from './cursor/ghost-cursor.js'
export { Tooltip, type TooltipOptions } from './tooltip/tooltip.js'
export { Highlight, type HighlightOptions } from './highlight/highlight.js'
export { ConfirmationFallback } from './confirmation/fallback.js'

// Themes
export { themes, lightTheme, darkTheme, type Theme, type ThemePreset } from './themes/presets.js'
export {
  applyTheme,
  resolveTheme,
  removeTheme,
  watchSystemTheme,
  type ThemeOption,
} from './themes/apply.js'

// Styles
export { cursorStyles, cursorSvg, closeIconSvg, injectStyles } from './styles/styles.css.js'
