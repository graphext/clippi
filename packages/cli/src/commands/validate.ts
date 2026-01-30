import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateManifest,
  parseCondition,
  ConditionParseError,
  type Manifest,
  type ManifestTarget,
} from '@clippi/core'

/**
 * Validate command options
 */
export interface ValidateOptions {
  manifest?: string
  conditions?: boolean
  flows?: boolean
  url?: string
}

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate condition syntax for a target
 */
function validateConditions(target: ManifestTarget): string[] {
  const errors: string[] = []

  if (target.conditions) {
    try {
      parseCondition(target.conditions)
    } catch (error) {
      if (error instanceof ConditionParseError) {
        errors.push(`${target.id}: Invalid condition - ${error.message}`)
      } else {
        errors.push(`${target.id}: Invalid condition - ${error}`)
      }
    }
  }

  return errors
}

/**
 * Validate selector strategies for a target
 */
function validateSelectors(target: ManifestTarget): string[] {
  const errors: string[] = []
  const warnings: string[] = []

  const { selector } = target
  if (!selector || !selector.strategies || selector.strategies.length === 0) {
    errors.push(`${target.id}: No selector strategies defined`)
    return errors
  }

  // Check for recommended strategies
  const hasTestId = selector.strategies.some((s) => s.type === 'testId')
  const hasAria = selector.strategies.some((s) => s.type === 'aria')

  if (!hasTestId && !hasAria) {
    warnings.push(`${target.id}: Consider adding testId or aria selector for stability`)
  }

  // Validate each strategy
  for (const strategy of selector.strategies) {
    if (!strategy.value || strategy.value.trim() === '') {
      errors.push(`${target.id}: Empty value in ${strategy.type} selector`)
    }

    if (strategy.type === 'css') {
      // Basic CSS selector syntax check
      try {
        if (typeof document !== 'undefined') {
          document.querySelector(strategy.value)
        }
      } catch {
        errors.push(`${target.id}: Invalid CSS selector "${strategy.value}"`)
      }
    }
  }

  return [...errors, ...warnings]
}

/**
 * Validate path steps for a target
 */
function validatePath(target: ManifestTarget): string[] {
  const errors: string[] = []

  if (!target.path || target.path.length === 0) {
    return errors // Path is optional
  }

  let hasFinal = false
  for (let i = 0; i < target.path.length; i++) {
    const step = target.path[i]

    if (!step.selector || !step.selector.strategies || step.selector.strategies.length === 0) {
      errors.push(`${target.id}: Path step ${i + 1} has no selector`)
    }

    if (!step.instruction || step.instruction.trim() === '') {
      errors.push(`${target.id}: Path step ${i + 1} has no instruction`)
    }

    if (step.final) {
      if (hasFinal) {
        errors.push(`${target.id}: Multiple steps marked as final`)
      }
      hasFinal = true
    }
  }

  // Last step should be final
  const lastStep = target.path[target.path.length - 1]
  if (!lastStep.final) {
    errors.push(`${target.id}: Last path step should be marked as final`)
  }

  return errors
}

/**
 * Validate a manifest file
 */
export async function validate(options: ValidateOptions = {}): Promise<void> {
  const manifestPath = options.manifest ?? join(process.cwd(), 'guide.manifest.json')

  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}`)
    process.exit(1)
  }

  console.log(`🔍 Validating ${manifestPath}...\n`)

  let manifest: Manifest
  try {
    const content = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(content)
  } catch (error) {
    console.error(`❌ Failed to parse manifest: ${error}`)
    process.exit(1)
  }

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  }

  // Basic schema validation
  const schemaValidation = validateManifest(manifest)
  if (!schemaValidation.valid) {
    result.valid = false
    result.errors.push(...schemaValidation.errors)
  }

  // Validate each target
  for (const target of manifest.targets) {
    // Validate selectors
    const selectorIssues = validateSelectors(target)
    for (const issue of selectorIssues) {
      if (issue.includes('Consider')) {
        result.warnings.push(issue)
      } else {
        result.errors.push(issue)
        result.valid = false
      }
    }

    // Validate conditions (if --conditions flag)
    if (options.conditions) {
      const conditionErrors = validateConditions(target)
      if (conditionErrors.length > 0) {
        result.errors.push(...conditionErrors)
        result.valid = false
      }
    }

    // Validate paths (if --flows flag)
    if (options.flows) {
      const pathErrors = validatePath(target)
      if (pathErrors.length > 0) {
        result.errors.push(...pathErrors)
        result.valid = false
      }
    }
  }

  // Check for duplicate IDs
  const ids = manifest.targets.map((t) => t.id)
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicates.length > 0) {
    result.valid = false
    result.errors.push(`Duplicate target IDs: ${[...new Set(duplicates)].join(', ')}`)
  }

  // Print results
  if (result.errors.length > 0) {
    console.log('❌ Errors:')
    result.errors.forEach((err) => console.log(`   - ${err}`))
    console.log('')
  }

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:')
    result.warnings.forEach((warn) => console.log(`   - ${warn}`))
    console.log('')
  }

  // Summary
  console.log(`📊 Summary:`)
  console.log(`   - Targets: ${manifest.targets.length}`)
  console.log(`   - Errors: ${result.errors.length}`)
  console.log(`   - Warnings: ${result.warnings.length}`)
  console.log('')

  if (result.valid) {
    console.log('✅ Manifest is valid!')
    process.exit(0)
  } else {
    console.log('❌ Manifest has errors')
    process.exit(1)
  }
}
