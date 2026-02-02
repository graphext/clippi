import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateManifest,
  parseCondition,
  ConditionParseError,
  type Manifest,
  type ManifestTarget,
  type SelectorStrategy,
} from '@clippi/core'

/**
 * Playwright types (dynamically imported)
 */
type Browser = Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>

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
    } catch (err) {
      if (err instanceof ConditionParseError) {
        errors.push(`${target.id}: Invalid condition - ${err.message}`)
      } else {
        errors.push(`${target.id}: Invalid condition - ${err}`)
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
 * Result of validating a selector against a live page
 */
interface SelectorValidationResult {
  targetId: string
  strategy: SelectorStrategy
  found: boolean
  elementCount: number
  error?: string
}

/**
 * Convert a selector strategy to a Playwright-compatible selector
 */
function strategyToPlaywrightSelector(strategy: SelectorStrategy): string {
  switch (strategy.type) {
    case 'testId':
      return `[data-testid="${strategy.value}"]`
    case 'aria':
      return `[aria-label="${strategy.value}"]`
    case 'css':
      return strategy.value
    case 'text':
      // Playwright text selector with optional tag filter
      if (strategy.tag) {
        return `${strategy.tag}:has-text("${strategy.value}")`
      }
      return `text="${strategy.value}"`
    default:
      return strategy.value
  }
}

/**
 * Validate all selectors against a live page using Playwright
 */
async function validateSelectorsWithPlaywright(
  manifest: Manifest,
  url: string
): Promise<{ results: SelectorValidationResult[]; errors: string[] }> {
  // Dynamically import Playwright
  let playwright
  try {
    playwright = await import('playwright')
  } catch {
    return {
      results: [],
      errors: [
        'Playwright is not installed. Run: npx playwright install chromium',
        'Or install with: pnpm add -D playwright && npx playwright install chromium',
      ],
    }
  }

  const results: SelectorValidationResult[] = []
  const errors: string[] = []

  let browser: Browser | null = null

  try {
    console.log(`🌐 Launching browser...`)
    try {
      // Support custom executable path via environment variable
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      browser = await playwright.chromium.launch({
        headless: true,
        executablePath: executablePath || undefined,
      })
    } catch (launchError) {
      const errorMsg = launchError instanceof Error ? launchError.message : String(launchError)
      if (errorMsg.includes("Executable doesn't exist")) {
        errors.push(
          'Playwright browser not installed. Run: npx playwright install chromium'
        )
      } else {
        errors.push(`Failed to launch browser: ${errorMsg}`)
      }
      return { results, errors }
    }
    const page = await browser.newPage()

    console.log(`📄 Navigating to ${url}...`)
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    } catch (navError) {
      errors.push(`Failed to navigate to ${url}: ${navError}`)
      return { results, errors }
    }

    // Wait a bit for any dynamic content
    await page.waitForTimeout(1000)

    console.log(`🔍 Testing selectors...\n`)

    // Test each target's selectors
    for (const target of manifest.targets) {
      const strategies = target.selector?.strategies ?? []

      for (const strategy of strategies) {
        const selector = strategyToPlaywrightSelector(strategy)
        let found = false
        let elementCount = 0
        let error: string | undefined

        try {
          const elements = await page.locator(selector).all()
          elementCount = elements.length
          found = elementCount > 0
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        }

        results.push({
          targetId: target.id,
          strategy,
          found,
          elementCount,
          error,
        })
      }

      // Also test path step selectors if flows validation is needed
      if (target.path) {
        for (let i = 0; i < target.path.length; i++) {
          const step = target.path[i]
          const stepStrategies = step.selector?.strategies ?? []

          for (const strategy of stepStrategies) {
            const selector = strategyToPlaywrightSelector(strategy)
            let found = false
            let elementCount = 0
            let error: string | undefined

            try {
              const elements = await page.locator(selector).all()
              elementCount = elements.length
              found = elementCount > 0
            } catch (e) {
              error = e instanceof Error ? e.message : String(e)
            }

            results.push({
              targetId: `${target.id} (path step ${i + 1})`,
              strategy,
              found,
              elementCount,
              error,
            })
          }
        }
      }
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  return { results, errors }
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

  // Validate selectors against live page (if --url flag)
  let liveValidationResults: SelectorValidationResult[] = []
  if (options.url) {
    console.log('') // Add spacing
    const { results: liveResults, errors: liveErrors } = await validateSelectorsWithPlaywright(
      manifest,
      options.url
    )

    if (liveErrors.length > 0) {
      result.errors.push(...liveErrors)
      result.valid = false
    } else {
      liveValidationResults = liveResults

      // Group results by target
      const byTarget = new Map<string, SelectorValidationResult[]>()
      for (const r of liveResults) {
        const existing = byTarget.get(r.targetId) ?? []
        existing.push(r)
        byTarget.set(r.targetId, existing)
      }

      // Check each target has at least one working selector
      for (const [targetId, strategies] of byTarget) {
        const anyFound = strategies.some((s) => s.found)
        if (!anyFound) {
          result.valid = false
          const strategyList = strategies
            .map((s) => `${s.strategy.type}:${s.strategy.value}`)
            .join(', ')
          result.errors.push(`${targetId}: No selector found element on page (tried: ${strategyList})`)
        }
      }

      // Report detailed results
      console.log('🌐 Live Page Validation:')
      for (const [targetId, strategies] of byTarget) {
        const working = strategies.filter((s) => s.found)
        const failing = strategies.filter((s) => !s.found)

        if (working.length > 0 && failing.length === 0) {
          console.log(`   ✅ ${targetId}: All ${working.length} selectors found`)
        } else if (working.length > 0) {
          console.log(`   ⚠️  ${targetId}: ${working.length}/${strategies.length} selectors found`)
          for (const f of failing) {
            console.log(`      ❌ ${f.strategy.type}:${f.strategy.value}`)
          }
        } else {
          console.log(`   ❌ ${targetId}: No selectors found`)
          for (const f of failing) {
            console.log(`      ❌ ${f.strategy.type}:${f.strategy.value}`)
          }
        }
      }
      console.log('')
    }
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

  if (liveValidationResults.length > 0) {
    const found = liveValidationResults.filter((r) => r.found).length
    const total = liveValidationResults.length
    console.log(`   - Selectors tested: ${found}/${total} found`)
  }

  console.log('')

  if (result.valid) {
    console.log('✅ Manifest is valid!')
    process.exit(0)
  } else {
    console.log('❌ Manifest has errors')
    process.exit(1)
  }
}
