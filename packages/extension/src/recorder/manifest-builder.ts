/**
 * Manifest builder - converts recorded targets to @clippi/core manifest format
 */

import type { RecordedTarget, RecordedStep } from '../types/messages.js'
import type {
  Manifest,
  ManifestTarget,
  PathStep,
  Selector,
  SuccessCondition,
} from '../types/manifest.js'

/**
 * Build a complete manifest from recorded targets
 */
export function buildManifest(targets: RecordedTarget[]): Manifest {
  return {
    $schema: 'https://clippi.net/schema/manifest.v1.json',
    meta: {
      generated_at: new Date().toISOString(),
      generator: 'clippi-extension/0.1.0',
    },
    defaults: {
      timeout_ms: 10000,
    },
    targets: targets.map(convertTarget),
  }
}

/**
 * Convert a recorded target to manifest format
 */
function convertTarget(target: RecordedTarget): ManifestTarget {
  const steps = target.steps
  const hasMultipleSteps = steps.length > 1

  // For single-step targets, the target selector IS the final element
  // For multi-step targets, create a path
  const finalStep = steps[steps.length - 1]

  const manifestTarget: ManifestTarget = {
    id: sanitizeId(target.id),
    selector: finalStep?.selector || { strategies: [] },
    label: target.label,
    description: target.description,
    keywords: target.keywords,
    category: target.category,
  }

  if (hasMultipleSteps) {
    manifestTarget.path = steps.map((step, index) =>
      convertStep(step, index === steps.length - 1)
    )
  }

  return manifestTarget
}

/**
 * Convert a recorded step to a path step
 */
function convertStep(step: RecordedStep, isFinal: boolean): PathStep {
  const pathStep: PathStep = {
    selector: step.selector,
    instruction: step.instruction,
  }

  // Only include action if it's not 'click' (click is the default)
  if (step.action !== 'click') {
    pathStep.action = step.action
  }

  // Include input for type/select actions
  if (step.input && (step.action === 'type' || step.action === 'select')) {
    pathStep.input = step.input
  }

  // Convert success condition
  if (step.successCondition) {
    pathStep.success_condition = convertSuccessCondition(step.successCondition)
  }

  if (isFinal) {
    pathStep.final = true
  }

  return pathStep
}

/**
 * Convert success condition to manifest format
 */
function convertSuccessCondition(condition: RecordedStep['successCondition']): SuccessCondition {
  const result: SuccessCondition = {}

  if (condition?.urlContains) {
    result.url_contains = condition.urlContains
  }

  if (condition?.visible) {
    result.visible = condition.visible
  }

  if (condition?.exists) {
    result.exists = condition.exists
  }

  return result
}

/**
 * Sanitize a string to be used as an ID
 */
function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

/**
 * Merge new targets into an existing manifest
 */
export function mergeIntoManifest(
  existing: Manifest,
  newTargets: RecordedTarget[]
): Manifest {
  const existingIds = new Set(existing.targets.map((t) => t.id))
  const convertedTargets = newTargets.map(convertTarget)

  // Separate new and updated targets
  const toAdd: ManifestTarget[] = []
  const toUpdate: ManifestTarget[] = []

  for (const target of convertedTargets) {
    if (existingIds.has(target.id)) {
      toUpdate.push(target)
    } else {
      toAdd.push(target)
    }
  }

  // Update existing targets
  const updatedExisting = existing.targets.map((t) => {
    const update = toUpdate.find((u) => u.id === t.id)
    return update || t
  })

  return {
    ...existing,
    meta: {
      ...existing.meta,
      generated_at: new Date().toISOString(),
    },
    targets: [...updatedExisting, ...toAdd],
  }
}

/**
 * Export manifest as downloadable JSON
 */
export function downloadManifest(manifest: Manifest, filename = 'guide.manifest.json'): void {
  const json = JSON.stringify(manifest, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}
