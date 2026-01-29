import type { Manifest, ManifestContext, ManifestContextElement } from '../types/manifest.js'

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
  const elements: ManifestContextElement[] = manifest.elements.map((el) => ({
    id: el.id,
    label: el.label,
    description: el.description,
    keywords: el.keywords,
    category: el.category,
  }))

  return { elements }
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

  if (!Array.isArray(m.elements)) {
    errors.push('Manifest must have an "elements" array')
    return { valid: false, errors }
  }

  for (let i = 0; i < m.elements.length; i++) {
    const el = m.elements[i] as Record<string, unknown>
    const prefix = `elements[${i}]`

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
