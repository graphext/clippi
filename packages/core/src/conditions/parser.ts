import type { ParsedCondition, SimpleCondition, AndCondition, OrCondition } from '../types/conditions.js'

/**
 * Error thrown when parsing fails
 */
export class ConditionParseError extends Error {
  constructor(message: string, public readonly input: string) {
    super(message)
    this.name = 'ConditionParseError'
  }
}

/**
 * Valid categories for simple conditions
 */
const VALID_CATEGORIES = ['plan', 'permission', 'state', 'flag'] as const
type ValidCategory = typeof VALID_CATEGORIES[number]

function isValidCategory(s: string): s is ValidCategory {
  return VALID_CATEGORIES.includes(s as ValidCategory)
}

/**
 * Parse a simple condition like "plan:pro" or "permission:data:export"
 */
function parseSimple(input: string): SimpleCondition {
  const colonIndex = input.indexOf(':')
  if (colonIndex === -1) {
    throw new ConditionParseError(`Invalid simple condition format: "${input}". Expected "category:value"`, input)
  }

  const category = input.slice(0, colonIndex)
  const value = input.slice(colonIndex + 1)

  if (!isValidCategory(category)) {
    throw new ConditionParseError(
      `Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      input
    )
  }

  if (!value) {
    throw new ConditionParseError(`Missing value in condition: "${input}"`, input)
  }

  return {
    type: 'simple',
    category,
    value,
  }
}

/**
 * Find the matching closing bracket for an opening bracket
 */
function findClosingBracket(input: string, start: number): number {
  let depth = 1
  for (let i = start + 1; i < input.length; i++) {
    if (input[i] === '[') depth++
    if (input[i] === ']') depth--
    if (depth === 0) return i
  }
  return -1
}

/**
 * Split conditions at the top level (not inside brackets)
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '[') depth++
    if (input[i] === ']') depth--
    if (input[i] === ',' && depth === 0) {
      parts.push(input.slice(start, i).trim())
      start = i + 1
    }
  }

  // Add the last part
  const last = input.slice(start).trim()
  if (last) parts.push(last)

  return parts
}

/**
 * Parse a condition string into a ParsedCondition tree
 *
 * Supported formats:
 * - Simple: "plan:pro", "permission:data:export", "state:has_data", "flag:new_feature"
 * - AND: "and:[plan:pro,permission:admin]"
 * - OR: "or:[plan:pro,plan:enterprise]"
 * - Nested: "and:[or:[plan:pro,plan:enterprise],permission:data:export]"
 *
 * @param input The condition string to parse
 * @returns Parsed condition tree
 * @throws ConditionParseError if parsing fails
 */
export function parseCondition(input: string): ParsedCondition {
  const trimmed = input.trim()

  if (!trimmed) {
    throw new ConditionParseError('Empty condition string', input)
  }

  // Check for AND
  if (trimmed.startsWith('and:[')) {
    const closingIdx = findClosingBracket(trimmed, 4)
    if (closingIdx === -1 || closingIdx !== trimmed.length - 1) {
      throw new ConditionParseError(`Malformed and condition: missing or misplaced closing bracket`, input)
    }

    const inner = trimmed.slice(5, closingIdx)
    const parts = splitTopLevel(inner)

    if (parts.length < 2) {
      throw new ConditionParseError(`and condition requires at least 2 conditions`, input)
    }

    return {
      type: 'and',
      conditions: parts.map(parseCondition),
    } as AndCondition
  }

  // Check for OR
  if (trimmed.startsWith('or:[')) {
    const closingIdx = findClosingBracket(trimmed, 3)
    if (closingIdx === -1 || closingIdx !== trimmed.length - 1) {
      throw new ConditionParseError(`Malformed or condition: missing or misplaced closing bracket`, input)
    }

    const inner = trimmed.slice(4, closingIdx)
    const parts = splitTopLevel(inner)

    if (parts.length < 2) {
      throw new ConditionParseError(`or condition requires at least 2 conditions`, input)
    }

    return {
      type: 'or',
      conditions: parts.map(parseCondition),
    } as OrCondition
  }

  // Must be a simple condition
  return parseSimple(trimmed)
}

/**
 * Check if a string looks like a JS function (for advanced conditions)
 */
export function isJsFunctionCondition(input: string): boolean {
  const trimmed = input.trim()
  return trimmed.startsWith('(') || trimmed.startsWith('function') || trimmed.includes('=>')
}

/**
 * Stringify a parsed condition back to DSL format
 */
export function stringifyCondition(condition: ParsedCondition): string {
  switch (condition.type) {
    case 'simple':
      return `${condition.category}:${condition.value}`
    case 'and':
      return `and:[${condition.conditions.map(stringifyCondition).join(',')}]`
    case 'or':
      return `or:[${condition.conditions.map(stringifyCondition).join(',')}]`
  }
}
