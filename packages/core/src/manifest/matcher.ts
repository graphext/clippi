import type { Manifest, ManifestElement, ManifestContextElement } from '../types/manifest.js'

/**
 * Match result with score for ranking
 */
export interface MatchResult {
  element: ManifestElement
  score: number
  matchType: 'exact_id' | 'keyword' | 'label' | 'description' | 'category'
}

/**
 * Normalize text for comparison (lowercase, trim)
 */
function normalize(text: string): string {
  return text.toLowerCase().trim()
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

/**
 * Calculate word overlap score
 */
function wordOverlapScore(query: string[], target: string[]): number {
  if (target.length === 0) return 0
  let matches = 0
  for (const word of query) {
    if (target.some((t) => t.includes(word) || word.includes(t))) {
      matches++
    }
  }
  return matches / Math.max(query.length, target.length)
}

/**
 * Find element by exact ID
 *
 * @param manifest The manifest to search
 * @param id Element ID to find
 * @returns The element or undefined
 */
export function findById(manifest: Manifest, id: string): ManifestElement | undefined {
  return manifest.elements.find((el) => el.id === id)
}

/**
 * Find element by exact ID (case-insensitive)
 *
 * @param manifest The manifest to search
 * @param id Element ID to find
 * @returns The element or undefined
 */
export function findByIdCaseInsensitive(manifest: Manifest, id: string): ManifestElement | undefined {
  const normalizedId = normalize(id)
  return manifest.elements.find((el) => normalize(el.id) === normalizedId)
}

/**
 * Match elements by query string (searches keywords, label, description, category)
 *
 * @param manifest The manifest to search
 * @param query Search query
 * @param options Match options
 * @returns Sorted array of match results (highest score first)
 */
export function matchByQuery(
  manifest: Manifest,
  query: string,
  options: { limit?: number; minScore?: number } = {}
): MatchResult[] {
  const { limit = 5, minScore = 0.1 } = options
  const normalizedQuery = normalize(query)
  const queryWords = tokenize(query)
  const results: MatchResult[] = []

  for (const element of manifest.elements) {
    let bestScore = 0
    let bestMatchType: MatchResult['matchType'] = 'keyword'

    // Check exact ID match (highest priority)
    if (normalize(element.id) === normalizedQuery) {
      bestScore = 1.0
      bestMatchType = 'exact_id'
    }

    // Check keywords (high priority)
    const keywordMatch = element.keywords.some(
      (kw) => normalize(kw) === normalizedQuery || normalizedQuery.includes(normalize(kw))
    )
    if (keywordMatch && bestScore < 0.9) {
      bestScore = 0.9
      bestMatchType = 'keyword'
    }

    // Check keyword word overlap
    const keywordWords = element.keywords.flatMap((kw) => tokenize(kw))
    const keywordOverlap = wordOverlapScore(queryWords, keywordWords) * 0.8
    if (keywordOverlap > bestScore) {
      bestScore = keywordOverlap
      bestMatchType = 'keyword'
    }

    // Check label match
    const labelNorm = normalize(element.label)
    if (labelNorm === normalizedQuery) {
      if (bestScore < 0.85) {
        bestScore = 0.85
        bestMatchType = 'label'
      }
    } else {
      const labelWords = tokenize(element.label)
      const labelOverlap = wordOverlapScore(queryWords, labelWords) * 0.7
      if (labelOverlap > bestScore) {
        bestScore = labelOverlap
        bestMatchType = 'label'
      }
    }

    // Check description
    const descWords = tokenize(element.description)
    const descOverlap = wordOverlapScore(queryWords, descWords) * 0.5
    if (descOverlap > bestScore) {
      bestScore = descOverlap
      bestMatchType = 'description'
    }

    // Check category
    if (normalize(element.category) === normalizedQuery) {
      if (bestScore < 0.3) {
        bestScore = 0.3
        bestMatchType = 'category'
      }
    }

    if (bestScore >= minScore) {
      results.push({
        element,
        score: bestScore,
        matchType: bestMatchType,
      })
    }
  }

  // Sort by score (highest first) and limit
  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Find best matching element for a query
 *
 * @param manifest The manifest to search
 * @param query Search query
 * @returns Best matching element or undefined
 */
export function findBestMatch(manifest: Manifest, query: string): ManifestElement | undefined {
  const results = matchByQuery(manifest, query, { limit: 1 })
  return results.length > 0 ? results[0].element : undefined
}

/**
 * Get elements by category
 *
 * @param manifest The manifest to search
 * @param category Category name
 * @returns Array of elements in the category
 */
export function findByCategory(manifest: Manifest, category: string): ManifestElement[] {
  const normalizedCategory = normalize(category)
  return manifest.elements.filter((el) => normalize(el.category) === normalizedCategory)
}

/**
 * Generate context elements for LLM (reduced info)
 *
 * @param manifest The manifest
 * @returns Array of context elements with only id, label, description, keywords, category
 */
export function getContextElements(manifest: Manifest): ManifestContextElement[] {
  return manifest.elements.map((el) => ({
    id: el.id,
    label: el.label,
    description: el.description,
    keywords: el.keywords,
    category: el.category,
  }))
}
