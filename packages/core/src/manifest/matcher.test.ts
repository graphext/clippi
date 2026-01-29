import { describe, it, expect } from 'vitest'
import { findById, matchByQuery, findBestMatch, findByCategory } from './matcher.js'
import type { Manifest } from '../types/manifest.js'

const mockManifest: Manifest = {
  elements: [
    {
      id: 'export-csv',
      selector: { strategies: [{ type: 'testId', value: 'export-btn' }] },
      label: 'Export to CSV',
      description: 'Export your data to CSV format',
      keywords: ['export', 'download', 'csv', 'data'],
      category: 'data',
    },
    {
      id: 'create-dataset',
      selector: { strategies: [{ type: 'testId', value: 'create-btn' }] },
      label: 'Create Dataset',
      description: 'Create a new dataset',
      keywords: ['create', 'new', 'dataset'],
      category: 'data',
    },
    {
      id: 'settings',
      selector: { strategies: [{ type: 'testId', value: 'settings-btn' }] },
      label: 'Settings',
      description: 'Open application settings',
      keywords: ['settings', 'preferences', 'config'],
      category: 'navigation',
    },
  ],
}

describe('findById', () => {
  it('finds element by exact id', () => {
    const result = findById(mockManifest, 'export-csv')
    expect(result?.id).toBe('export-csv')
  })

  it('returns undefined for non-existent id', () => {
    const result = findById(mockManifest, 'non-existent')
    expect(result).toBeUndefined()
  })
})

describe('matchByQuery', () => {
  it('matches by keyword', () => {
    const results = matchByQuery(mockManifest, 'export')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].element.id).toBe('export-csv')
  })

  it('matches by label', () => {
    const results = matchByQuery(mockManifest, 'Settings')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].element.id).toBe('settings')
  })

  it('returns empty array for no matches', () => {
    const results = matchByQuery(mockManifest, 'xyznonexistent')
    expect(results).toHaveLength(0)
  })

  it('respects limit option', () => {
    const results = matchByQuery(mockManifest, 'data', { limit: 1 })
    expect(results).toHaveLength(1)
  })

  it('includes match score and type', () => {
    const results = matchByQuery(mockManifest, 'export')
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0].matchType).toBeDefined()
  })
})

describe('findBestMatch', () => {
  it('returns best matching element', () => {
    const result = findBestMatch(mockManifest, 'how do I export data?')
    expect(result?.id).toBe('export-csv')
  })

  it('returns undefined for no match', () => {
    const result = findBestMatch(mockManifest, 'xyznonexistent')
    expect(result).toBeUndefined()
  })
})

describe('findByCategory', () => {
  it('returns all elements in category', () => {
    const results = findByCategory(mockManifest, 'data')
    expect(results).toHaveLength(2)
    expect(results.map(e => e.id)).toContain('export-csv')
    expect(results.map(e => e.id)).toContain('create-dataset')
  })

  it('is case-insensitive', () => {
    const results = findByCategory(mockManifest, 'DATA')
    expect(results).toHaveLength(2)
  })

  it('returns empty array for non-existent category', () => {
    const results = findByCategory(mockManifest, 'nonexistent')
    expect(results).toHaveLength(0)
  })
})
