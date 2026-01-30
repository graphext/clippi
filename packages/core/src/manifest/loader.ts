import type { Manifest, ManifestContext, ManifestContextTarget } from '../types/manifest.js'

/**
 * Load manifest from URL or object
 *
 * @param source URL string or manifest object
 * @returns Loaded manifest
 */
export async function loadManifest(source: string | object): Promise<Manifest> {
  if (typeof source === 'string') {
    // It's a URL - fetch it
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Failed to load manifest from ${source}: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }

  // It's an object - use directly
  return source as Manifest
}

/**
 * Generate context manifest (reduced version for LLM) from full manifest
 *
 * @param manifest Full manifest
 * @returns Reduced manifest context
 */
export function generateContext(manifest: Manifest): ManifestContext {
  const targets: ManifestContextTarget[] = manifest.targets.map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    keywords: t.keywords,
    category: t.category,
  }))

  return { targets }
}

/**
 * Validate manifest structure (basic validation)
 *
 * @param manifest Manifest to validate
 * @returns Validation result with errors
 */
export function validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] }
  }

  const m = manifest as Record<string, unknown>

  if (!Array.isArray(m.targets)) {
    errors.push('Manifest must have a "targets" array')
    return { valid: false, errors }
  }

  for (let i = 0; i < m.targets.length; i++) {
    const el = m.targets[i] as Record<string, unknown>
    const prefix = `targets[${i}]`

    if (!el.id || typeof el.id !== 'string') {
      errors.push(`${prefix}: Missing or invalid "id"`)
    }

    if (!el.label || typeof el.label !== 'string') {
      errors.push(`${prefix}: Missing or invalid "label"`)
    }

    if (!el.description || typeof el.description !== 'string') {
      errors.push(`${prefix}: Missing or invalid "description"`)
    }

    if (!el.keywords || !Array.isArray(el.keywords)) {
      errors.push(`${prefix}: Missing or invalid "keywords" array`)
    }

    if (!el.category || typeof el.category !== 'string') {
      errors.push(`${prefix}: Missing or invalid "category"`)
    }

    if (!el.selector || typeof el.selector !== 'object') {
      errors.push(`${prefix}: Missing or invalid "selector"`)
    } else {
      const selector = el.selector as Record<string, unknown>
      if (!Array.isArray(selector.strategies) || selector.strategies.length === 0) {
        errors.push(`${prefix}.selector: Must have at least one strategy`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
