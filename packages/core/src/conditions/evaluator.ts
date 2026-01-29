import type {
  ParsedCondition,
  UserContext,
  ConditionResult,
} from '../types/conditions.js'
import { parseCondition, isJsFunctionCondition } from './parser.js'

/**
 * Evaluate a simple condition against user context
 */
function evaluateSimple(
  condition: { category: 'plan' | 'permission' | 'state' | 'flag'; value: string },
  context: UserContext
): ConditionResult {
  switch (condition.category) {
    case 'plan':
      if (context.plan === condition.value) {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: 'plan',
        missing: condition.value,
        message: `Requires ${condition.value} plan`,
      }

    case 'permission':
      if (context.permissions?.includes(condition.value)) {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: 'permission',
        missing: condition.value,
        message: `Requires ${condition.value} permission`,
      }

    case 'state':
      if (context.state?.[condition.value]) {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: 'state',
        missing: condition.value,
        message: `Requires ${condition.value}`,
      }

    case 'flag':
      if (context.flags?.[condition.value]) {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: 'flag',
        missing: condition.value,
        message: `Feature ${condition.value} is not enabled`,
      }

    default:
      return { allowed: true }
  }
}

/**
 * Evaluate a parsed condition tree against user context
 */
function evaluateParsed(condition: ParsedCondition, context: UserContext): ConditionResult {
  switch (condition.type) {
    case 'simple':
      return evaluateSimple(condition, context)

    case 'and': {
      // All conditions must pass
      for (const sub of condition.conditions) {
        const result = evaluateParsed(sub, context)
        if (!result.allowed) {
          return result
        }
      }
      return { allowed: true }
    }

    case 'or': {
      // At least one condition must pass
      let lastFailure: ConditionResult = { allowed: false }
      for (const sub of condition.conditions) {
        const result = evaluateParsed(sub, context)
        if (result.allowed) {
          return { allowed: true }
        }
        lastFailure = result
      }
      return lastFailure
    }
  }
}

/**
 * Evaluate a JS function condition (advanced, use with caution)
 *
 * WARNING: This uses new Function() to evaluate arbitrary code.
 * Only use with trusted manifests served from same-origin or CDN with SRI.
 */
function evaluateJsFunction(
  conditionStr: string,
  context: UserContext
): ConditionResult {
  try {
    // Create a function from the condition string
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('ctx', `return (${conditionStr})(ctx)`)
    const result = fn(context)

    if (typeof result === 'boolean') {
      return { allowed: result }
    }

    // If it returns an object, use it as the result
    if (typeof result === 'object' && result !== null) {
      return result as ConditionResult
    }

    return { allowed: Boolean(result) }
  } catch (error) {
    return {
      allowed: false,
      message: `Error evaluating condition: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Evaluate a condition string against user context
 *
 * Supports:
 * - Safe DSL: "plan:pro", "and:[plan:pro,permission:admin]", etc.
 * - JS functions (advanced): "({ plan }) => plan === 'pro'"
 *
 * @param conditionStr The condition string to evaluate
 * @param context The user context to evaluate against
 * @param allowJsFunction Whether to allow JS function conditions (default: false)
 * @returns ConditionResult with allowed status and optional reason/missing/message
 */
export function evaluateCondition(
  conditionStr: string,
  context: UserContext,
  allowJsFunction = false
): ConditionResult {
  if (!conditionStr || !conditionStr.trim()) {
    // No condition means always allowed
    return { allowed: true }
  }

  // Check if it's a JS function
  if (isJsFunctionCondition(conditionStr)) {
    if (!allowJsFunction) {
      return {
        allowed: false,
        message: 'JS function conditions are disabled. Use the safe DSL format.',
      }
    }
    return evaluateJsFunction(conditionStr, context)
  }

  // Parse and evaluate DSL
  const parsed = parseCondition(conditionStr)
  return evaluateParsed(parsed, context)
}

/**
 * Check if a condition is satisfied (simple boolean helper)
 */
export function checkCondition(
  conditionStr: string,
  context: UserContext,
  allowJsFunction = false
): boolean {
  return evaluateCondition(conditionStr, context, allowJsFunction).allowed
}
