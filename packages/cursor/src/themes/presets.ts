/**
 * Theme configuration
 */
export interface Theme {
  primary: string
  primaryForeground: string
  background: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  radius: string
  font: string
}

/**
 * Light theme preset
 */
export const lightTheme: Theme = {
  primary: '#6366f1',
  primaryForeground: '#ffffff',
  background: '#ffffff',
  foreground: '#1f2937',
  muted: '#f3f4f6',
  mutedForeground: '#6b7280',
  border: '#e5e7eb',
  radius: '8px',
  font: 'system-ui, -apple-system, sans-serif',
}

/**
 * Dark theme preset
 */
export const darkTheme: Theme = {
  primary: '#818cf8',
  primaryForeground: '#1f2937',
  background: '#1f2937',
  foreground: '#f9fafb',
  muted: '#374151',
  mutedForeground: '#9ca3af',
  border: '#4b5563',
  radius: '8px',
  font: 'system-ui, -apple-system, sans-serif',
}

/**
 * Theme presets
 */
export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const

export type ThemePreset = keyof typeof themes
