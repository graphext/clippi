/**
 * Selector strategy type - determines how to find an element in the DOM
 */
export type SelectorStrategyType = 'testId' | 'aria' | 'css' | 'text'

/**
 * Individual selector strategy with its value
 */
export interface SelectorStrategy {
  type: SelectorStrategyType
  value: string
  /** For text strategy: which HTML tag to match */
  tag?: string
}

/**
 * Selector with multiple fallback strategies (tried in order)
 */
export interface Selector {
  strategies: SelectorStrategy[]
}

/**
 * Success condition for determining when a step is complete
 */
export interface SuccessCondition {
  /** URL contains this substring */
  url_contains?: string
  /** URL matches this regex pattern */
  url_matches?: string
  /** Element matching this selector is visible */
  visible?: string | Selector
  /** Element matching this selector exists in DOM */
  exists?: string | Selector
  /** Attribute check */
  attribute?: {
    selector: string | Selector
    name: string
    value?: string
  }
}

/**
 * A single step in a multi-step path
 */
export interface PathStep {
  selector: Selector
  instruction: string
  success_condition?: SuccessCondition
  /** Marks this as the final step in the path */
  final?: boolean
}

/**
 * What to do when an element is blocked due to conditions
 */
export interface OnBlocked {
  message: string
  /** Element ID to suggest as alternative */
  suggest?: string
}

/**
 * A guidable element in the manifest
 */
export interface ManifestElement {
  id: string
  selector: Selector
  label: string
  description: string
  keywords: string[]
  category: string
  /** Multi-step path to reach this element */
  path?: PathStep[]
  /** Condition DSL string or JS function string */
  conditions?: string
  /** What to show when blocked */
  on_blocked?: OnBlocked
}

/**
 * Manifest metadata
 */
export interface ManifestMeta {
  app_name?: string
  version?: string
  app_version?: string
  generated_at?: string
  generator?: string
}

/**
 * Manifest defaults
 */
export interface ManifestDefaults {
  timeout_ms?: number
}

/**
 * The complete manifest schema
 */
export interface Manifest {
  $schema?: string
  meta?: ManifestMeta
  defaults?: ManifestDefaults
  elements: ManifestElement[]
}

/**
 * Reduced manifest element for LLM context (guide.context.json)
 */
export interface ManifestContextElement {
  id: string
  label: string
  description: string
  keywords: string[]
  category: string
}

/**
 * The reduced manifest for LLM context
 */
export interface ManifestContext {
  elements: ManifestContextElement[]
}
