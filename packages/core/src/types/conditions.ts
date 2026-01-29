/**
 * User context provided by the application for condition evaluation
 */
export interface UserContext {
  /** User's plan: 'free', 'pro', 'enterprise', etc. */
  plan?: string
  /** User's permissions: ['data:export', 'admin:delete', etc.] */
  permissions?: string[]
  /** Application state: { has_data: true, has_payment_method: false, etc. } */
  state?: Record<string, boolean | string | number>
  /** Feature flags: { new_export_v2: true, etc. } */
  flags?: Record<string, boolean>
}

/**
 * Parsed condition node types
 */
export type ParsedConditionType = 'simple' | 'and' | 'or'

/**
 * A simple condition: plan:pro, permission:data:export, state:has_data, flag:new_export
 */
export interface SimpleCondition {
  type: 'simple'
  category: 'plan' | 'permission' | 'state' | 'flag'
  value: string
}

/**
 * Logical AND condition: and:[cond1,cond2,...]
 */
export interface AndCondition {
  type: 'and'
  conditions: ParsedCondition[]
}

/**
 * Logical OR condition: or:[cond1,cond2,...]
 */
export interface OrCondition {
  type: 'or'
  conditions: ParsedCondition[]
}

/**
 * Union type of all parsed conditions
 */
export type ParsedCondition = SimpleCondition | AndCondition | OrCondition

/**
 * Result of condition evaluation
 */
export interface ConditionResult {
  /** Whether the condition is satisfied */
  allowed: boolean
  /** Reason for blocking (if not allowed) */
  reason?: 'plan' | 'permission' | 'state' | 'flag'
  /** What's missing (e.g., 'pro' for plan, 'data:export' for permission) */
  missing?: string
  /** Human-readable message */
  message?: string
}
