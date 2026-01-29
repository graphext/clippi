import { themes, type Theme, type ThemePreset } from './presets.js'

/**
 * Theme option: preset name, 'auto', or custom theme object
 */
export type ThemeOption = ThemePreset | 'auto' | Partial<Theme>

/**
 * Convert camelCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase()
}

/**
 * Get the effective theme based on option
 */
export function resolveTheme(option: ThemeOption): Theme {
  if (typeof option === 'string') {
    if (option === 'auto') {
      // Detect system preference
      const prefersDark = typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches
      return prefersDark ? themes.dark : themes.light
    }
    return themes[option]
  }

  // Custom theme - merge with light as base
  return { ...themes.light, ...option }
}

/**
 * Apply theme to document root (or specified element)
 *
 * @param theme Theme to apply
 * @param target Target element (defaults to :root)
 */
export function applyTheme(theme: Theme, target?: HTMLElement): void {
  if (typeof document === 'undefined') return

  const el = target ?? document.documentElement

  Object.entries(theme).forEach(([key, value]) => {
    const cssVar = `--clippi-${toKebabCase(key)}`
    el.style.setProperty(cssVar, value)
  })
}

/**
 * Remove theme from document root (or specified element)
 *
 * @param target Target element (defaults to :root)
 */
export function removeTheme(target?: HTMLElement): void {
  if (typeof document === 'undefined') return

  const el = target ?? document.documentElement
  const themeKeys: (keyof Theme)[] = [
    'primary',
    'primaryForeground',
    'background',
    'foreground',
    'muted',
    'mutedForeground',
    'border',
    'radius',
    'font',
  ]

  themeKeys.forEach((key) => {
    const cssVar = `--clippi-${toKebabCase(key)}`
    el.style.removeProperty(cssVar)
  })
}

/**
 * Watch for system theme changes and update automatically
 *
 * @param callback Callback when theme changes
 * @returns Cleanup function
 */
export function watchSystemTheme(callback: (isDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {}
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches)
  }

  mediaQuery.addEventListener('change', handler)

  return () => {
    mediaQuery.removeEventListener('change', handler)
  }
}
