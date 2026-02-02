/**
 * Manifest types for export (matching @clippi/core schema)
 * These are the types we export TO, not the internal recording types
 */

export interface ManifestMeta {
  app_name?: string
  version?: string
  generated_at: string
  generator: string
}

export interface ManifestDefaults {
  timeout_ms?: number
}

export interface SelectorStrategy {
  type: 'testId' | 'aria' | 'css' | 'text'
  value: string
  tag?: string
}

export interface Selector {
  strategies: SelectorStrategy[]
}

export interface SuccessCondition {
  url_contains?: string
  url_matches?: string
  visible?: string | Selector
  exists?: string | Selector
  attribute?: {
    selector: string | Selector
    name: string
    value?: string
  }
}

export interface PathStep {
  selector: Selector
  instruction: string
  action?: 'click' | 'type' | 'select' | 'clear'
  input?: string
  success_condition?: SuccessCondition
  final?: boolean
}

export interface OnBlocked {
  message: string
  suggest?: string
}

export interface ManifestTarget {
  id: string
  selector: Selector
  label: string
  description: string
  keywords: string[]
  category: string
  path?: PathStep[]
  conditions?: string
  on_blocked?: OnBlocked
}

export interface Manifest {
  $schema?: string
  meta?: ManifestMeta
  defaults?: ManifestDefaults
  targets: ManifestTarget[]
}
