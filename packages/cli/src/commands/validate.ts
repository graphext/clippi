import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateManifest,
  parseCondition,
  ConditionParseError,
  type Manifest,
  type ManifestElement,
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
 * Validate condition syntax for an element
 */
function validateConditions(element: ManifestElement): string[] {
  const errors: string[] = []

  if (element.conditions) {
    try {
      parseCondition(element.conditions)
    } catch (error) {
      if (error instanceof ConditionParseError) {
        errors.push(`${element.id}: Invalid condition - ${error.message}`)
      } else {
        errors.push(`${element.id}: Invalid condition - ${error}`)
      }
    }
  }

  return errors
}

/**
 * Validate selector strategies for an element
 */
function validateSelectors(element: ManifestElement): string[] {
  const errors: string[] = []
  const warnings: string[] = []

  const { selector } = element
  if (!selector || !selector.strategies || selector.strategies.length === 0) {
    errors.push(`${element.id}: No selector strategies defined`)
    return errors
  }

  // Check for recommended strategies
  const hasTestId = selector.strategies.some((s) => s.type === 'testId')
  const hasAria = selector.strategies.some((s) => s.type === 'aria')

  if (!hasTestId && !hasAria) {
    warnings.push(`${element.id}: Consider adding testId or aria selector for stability`)
  }

  // Validate each strategy
  for (const strategy of selector.strategies) {
    if (!strategy.value || strategy.value.trim() === '') {
      errors.push(`${element.id}: Empty value in ${strategy.type} selector`)
    }

    if (strategy.type === 'css') {
      // Basic CSS selector syntax check
      try {
        if (typeof document !== 'undefined') {
          document.querySelector(strategy.value)
        }
      } catch {
        errors.push(`${element.id}: Invalid CSS selector "${strategy.value}"`)
      }
    }
  }

  return [...errors, ...warnings]
}

/**
 * Validate path steps for an element
 */
function validatePath(element: ManifestElement): string[] {
  const errors: string[] = []

  if (!element.path || element.path.length === 0) {
    return errors // Path is optional
  }

  let hasFinal = false
  for (let i = 0; i < element.path.length; i++) {
    const step = element.path[i]

    if (!step.selector || !step.selector.strategies || step.selector.strategies.length === 0) {
      errors.push(`${element.id}: Path step ${i + 1} has no selector`)
    }

    if (!step.instruction || step.instruction.trim() === '') {
      errors.push(`${element.id}: Path step ${i + 1} has no instruction`)
    }

    if (step.final) {
      if (hasFinal) {
        errors.push(`${element.id}: Multiple steps marked as final`)
      }
      hasFinal = true
    }
  }

  // Last step should be final
  const lastStep = element.path[element.path.length - 1]
  if (!lastStep.final) {
    errors.push(`${element.id}: Last path step should be marked as final`)
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

  // Validate each element
  for (const element of manifest.elements) {
    // Validate selectors
    const selectorIssues = validateSelectors(element)
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
      const conditionErrors = validateConditions(element)
      if (conditionErrors.length > 0) {
        result.errors.push(...conditionErrors)
        result.valid = false
      }
    }

    // Validate paths (if --flows flag)
    if (options.flows) {
      const pathErrors = validatePath(element)
      if (pathErrors.length > 0) {
        result.errors.push(...pathErrors)
        result.valid = false
      }
    }
  }

  // Check for duplicate IDs
  const ids = manifest.elements.map((e) => e.id)
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicates.length > 0) {
    result.valid = false
    result.errors.push(`Duplicate element IDs: ${[...new Set(duplicates)].join(', ')}`)
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
  console.log(`   - Elements: ${manifest.elements.length}`)
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
