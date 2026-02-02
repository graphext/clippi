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
type Page = Awaited<ReturnType<Browser['newPage']>>

/**
 * Validate command options
 */
export interface ValidateOptions {
  manifest?: string
  conditions?: boolean
  flows?: boolean
  url?: string
  e2e?: boolean
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
 * Result of e2e path validation
 */
interface E2EPathResult {
  targetId: string
  success: boolean
  stepsCompleted: number
  totalSteps: number
  failedAt?: {
    step: number
    reason: string
  }
}

/**
 * Check if a success condition is met on the page
 */
async function checkSuccessCondition(
  page: Page,
  condition: Record<string, unknown>
): Promise<{ met: boolean; reason?: string }> {
  // Check URL conditions
  if (condition.url_contains) {
    const url = page.url()
    if (!url.includes(condition.url_contains as string)) {
      return { met: false, reason: `URL doesn't contain "${condition.url_contains}"` }
    }
  }

  if (condition.url_matches) {
    const url = page.url()
    const regex = new RegExp(condition.url_matches as string)
    if (!regex.test(url)) {
      return { met: false, reason: `URL doesn't match pattern "${condition.url_matches}"` }
    }
  }

  // Check visibility conditions
  if (condition.visible) {
    const selector = condition.visible as string
    try {
      const isVisible = await page.locator(selector).isVisible({ timeout: 100 })
      if (!isVisible) {
        return { met: false, reason: `Element "${selector}" not visible` }
      }
    } catch {
      return { met: false, reason: `Element "${selector}" not found` }
    }
  }

  // Check existence conditions
  if (condition.exists) {
    const selector = condition.exists as string
    try {
      const count = await page.locator(selector).count()
      if (count === 0) {
        return { met: false, reason: `Element "${selector}" doesn't exist` }
      }
    } catch {
      return { met: false, reason: `Element "${selector}" not found` }
    }
  }

  // Check value conditions
  if (condition.value && typeof condition.value === 'object') {
    const valueCondition = condition.value as {
      selector: string
      equals?: string
      contains?: string
      not_empty?: boolean
    }
    try {
      const element = page.locator(valueCondition.selector)
      const value = await element.inputValue().catch(() => element.textContent())

      if (valueCondition.equals !== undefined && value !== valueCondition.equals) {
        return { met: false, reason: `Value "${value}" doesn't equal "${valueCondition.equals}"` }
      }
      if (valueCondition.contains !== undefined && !value?.includes(valueCondition.contains)) {
        return { met: false, reason: `Value "${value}" doesn't contain "${valueCondition.contains}"` }
      }
      if (valueCondition.not_empty && (!value || value.trim() === '')) {
        return { met: false, reason: `Value is empty` }
      }
    } catch {
      return { met: false, reason: `Element "${valueCondition.selector}" not found` }
    }
  }

  // Check attribute conditions
  if (condition.attribute && typeof condition.attribute === 'object') {
    const attrCondition = condition.attribute as {
      selector: string
      name: string
      value: string
    }
    try {
      const element = page.locator(attrCondition.selector)
      const attrValue = await element.getAttribute(attrCondition.name)
      if (attrValue !== attrCondition.value) {
        return {
          met: false,
          reason: `Attribute "${attrCondition.name}" is "${attrValue}", expected "${attrCondition.value}"`,
        }
      }
    } catch {
      return { met: false, reason: `Element "${attrCondition.selector}" not found` }
    }
  }

  // Click condition - just means "clicked", we assume it's met after clicking
  if (condition.click) {
    return { met: true }
  }

  return { met: true }
}

/**
 * Execute a single path end-to-end
 */
async function executePath(
  page: Page,
  target: ManifestTarget,
  url: string
): Promise<E2EPathResult> {
  const result: E2EPathResult = {
    targetId: target.id,
    success: false,
    stepsCompleted: 0,
    totalSteps: target.path?.length ?? 0,
  }

  if (!target.path || target.path.length === 0) {
    // Single-step target - just click it
    result.totalSteps = 1
    try {
      const strategies = target.selector?.strategies ?? []
      let clicked = false

      for (const strategy of strategies) {
        const selector = strategyToPlaywrightSelector(strategy)
        try {
          await page.locator(selector).first().click({ timeout: 5000 })
          clicked = true
          break
        } catch {
          continue
        }
      }

      if (clicked) {
        result.stepsCompleted = 1
        result.success = true
      } else {
        result.failedAt = { step: 1, reason: 'Could not find/click target element' }
      }
    } catch (e) {
      result.failedAt = { step: 1, reason: e instanceof Error ? e.message : String(e) }
    }
    return result
  }

  // Multi-step path
  for (let i = 0; i < target.path.length; i++) {
    const step = target.path[i]
    const stepNum = i + 1

    try {
      // Find and click the element
      const strategies = step.selector?.strategies ?? []
      let clicked = false

      for (const strategy of strategies) {
        const selector = strategyToPlaywrightSelector(strategy)
        try {
          const locator = page.locator(selector).first()

          // Wait for element to be visible and clickable
          await locator.waitFor({ state: 'visible', timeout: 5000 })

          // Scroll into view if needed
          await locator.scrollIntoViewIfNeeded()

          // Click
          await locator.click({ timeout: 5000 })
          clicked = true
          break
        } catch {
          continue
        }
      }

      if (!clicked) {
        result.failedAt = { step: stepNum, reason: `Could not find/click element for step ${stepNum}` }
        return result
      }

      // Wait for success condition (if defined)
      if (step.success_condition) {
        // Poll for condition with timeout
        const maxWait = 10000
        const pollInterval = 200
        let elapsed = 0
        let conditionMet = false
        let lastReason = ''

        while (elapsed < maxWait) {
          const check = await checkSuccessCondition(page, step.success_condition as Record<string, unknown>)
          if (check.met) {
            conditionMet = true
            break
          }
          lastReason = check.reason ?? 'Unknown'
          await page.waitForTimeout(pollInterval)
          elapsed += pollInterval
        }

        if (!conditionMet) {
          result.failedAt = {
            step: stepNum,
            reason: `Success condition not met after ${maxWait}ms: ${lastReason}`,
          }
          return result
        }
      } else {
        // No success condition - wait a bit for any transitions
        await page.waitForTimeout(500)
      }

      result.stepsCompleted = stepNum
    } catch (e) {
      result.failedAt = { step: stepNum, reason: e instanceof Error ? e.message : String(e) }
      return result
    }
  }

  result.success = true
  return result
}

/**
 * Run end-to-end validation for all paths
 */
async function validateE2E(
  manifest: Manifest,
  url: string
): Promise<{ results: E2EPathResult[]; errors: string[] }> {
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

  const results: E2EPathResult[] = []
  const errors: string[] = []

  let browser: Browser | null = null

  try {
    console.log(`🌐 Launching browser for E2E validation...`)
    try {
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      browser = await playwright.chromium.launch({
        headless: true,
        executablePath: executablePath || undefined,
      })
    } catch (launchError) {
      const errorMsg = launchError instanceof Error ? launchError.message : String(launchError)
      if (errorMsg.includes("Executable doesn't exist")) {
        errors.push('Playwright browser not installed. Run: npx playwright install chromium')
      } else {
        errors.push(`Failed to launch browser: ${errorMsg}`)
      }
      return { results, errors }
    }

    const targetsWithPaths = manifest.targets.filter((t) => t.path && t.path.length > 0)
    console.log(`🔍 Testing ${targetsWithPaths.length} paths end-to-end...\n`)

    for (const target of targetsWithPaths) {
      // Create a fresh page for each path
      const page = await browser.newPage()

      try {
        // Navigate to start URL
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(500)

        // Execute the path
        process.stdout.write(`   ⏳ ${target.id}...`)
        const pathResult = await executePath(page, target, url)
        results.push(pathResult)

        // Report result
        if (pathResult.success) {
          console.log(`\r   ✅ ${target.id}: ${pathResult.stepsCompleted}/${pathResult.totalSteps} steps completed`)
        } else {
          console.log(
            `\r   ❌ ${target.id}: Failed at step ${pathResult.failedAt?.step}/${pathResult.totalSteps}`
          )
          console.log(`      Reason: ${pathResult.failedAt?.reason}`)
        }
      } finally {
        await page.close()
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

  // Run E2E validation (if --e2e flag and --url provided)
  let e2eResults: E2EPathResult[] = []
  if (options.e2e) {
    if (!options.url) {
      result.errors.push('--e2e requires --url flag to specify the application URL')
      result.valid = false
    } else {
      console.log('') // Add spacing
      const { results: e2eTestResults, errors: e2eErrors } = await validateE2E(manifest, options.url)

      if (e2eErrors.length > 0) {
        result.errors.push(...e2eErrors)
        result.valid = false
      } else {
        e2eResults = e2eTestResults

        // Report e2e summary
        console.log('')
        console.log('🎯 E2E Path Validation:')

        const passed = e2eResults.filter((r) => r.success).length
        const failed = e2eResults.filter((r) => !r.success).length

        if (failed > 0) {
          result.valid = false
          for (const failedResult of e2eResults.filter((r) => !r.success)) {
            result.errors.push(
              `${failedResult.targetId}: E2E failed at step ${failedResult.failedAt?.step} - ${failedResult.failedAt?.reason}`
            )
          }
        }

        console.log(`   Passed: ${passed}/${e2eResults.length}`)
        console.log('')
      }
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

  if (e2eResults.length > 0) {
    const passed = e2eResults.filter((r) => r.success).length
    console.log(`   - E2E paths: ${passed}/${e2eResults.length} passed`)
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
