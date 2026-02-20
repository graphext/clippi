import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Generate command options
 */
export interface GenerateOptions {
  tasks?: string
  url?: string
  output?: string
  provider?: 'gemini' | 'openai' | 'anthropic'
  model?: string
  headless?: boolean
  docs?: string
  timeout?: number
  config?: string
}

/**
 * Check if Python and required packages are installed
 */
function checkPythonDependencies(): { ok: boolean; error?: string } {
  try {
    // Check Python version
    const pythonVersion = execSync('python3 --version', { encoding: 'utf-8' }).trim()
    const versionMatch = pythonVersion.match(/Python (\d+)\.(\d+)/)
    if (versionMatch) {
      const major = parseInt(versionMatch[1], 10)
      const minor = parseInt(versionMatch[2], 10)
      if (major < 3 || (major === 3 && minor < 11)) {
        return {
          ok: false,
          error: `Python 3.11+ is required. Found: ${pythonVersion}`,
        }
      }
    }
  } catch {
    return {
      ok: false,
      error:
        'Python 3.11+ is required but not found. Install it from https://python.org',
    }
  }

  // Check if browser-use is installed
  try {
    execSync('python3 -c "import browser_use"', { encoding: 'utf-8' })
  } catch {
    return {
      ok: false,
      error: `browser-use package not installed. Run:
    cd agent && pip install -r requirements.txt
    playwright install chromium`,
    }
  }

  return { ok: true }
}

/**
 * Parse a tasks file
 */
function parseTasksFile(
  path: string
): Array<{ description: string; id?: string; category?: string; keywords?: string[] }> {
  const content = readFileSync(path, 'utf-8').trim()

  // Try JSON first
  try {
    const data = JSON.parse(content)
    if (Array.isArray(data)) {
      return data.map((item) =>
        typeof item === 'string' ? { description: item } : item
      )
    }
  } catch {
    // Not JSON
  }

  // Plain text (one task per line)
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => ({ description: line }))
}

/**
 * Find the agent directory
 */
function findAgentDir(): string | null {
  // Check common locations
  const candidates = [
    join(process.cwd(), 'agent'),
    join(process.cwd(), '..', 'agent'),
    join(__dirname, '..', '..', '..', '..', 'agent'),
  ]

  for (const dir of candidates) {
    if (existsSync(join(dir, 'clippi_agent', 'cli.py'))) {
      return resolve(dir)
    }
  }

  return null
}

/**
 * Generate manifest using the Python agent
 */
export async function generate(options: GenerateOptions = {}): Promise<void> {
  console.log('🤖 Clippi Generate - AI Agent Manifest Generation\n')

  // Check Python dependencies
  const depCheck = checkPythonDependencies()
  if (!depCheck.ok) {
    console.error(`❌ ${depCheck.error}`)
    process.exit(1)
  }

  // Find agent directory
  const agentDir = findAgentDir()
  if (!agentDir) {
    console.error('❌ Could not find agent directory.')
    console.error('   Make sure the agent/ folder exists with the Python agent code.')
    process.exit(1)
  }

  // Check for API key
  const provider = options.provider ?? 'gemini'
  const apiKeyVar = {
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  }[provider]

  if (!process.env[apiKeyVar]) {
    console.error(`❌ ${apiKeyVar} environment variable is required`)
    console.error(`\n   Set it with: export ${apiKeyVar}=your-api-key`)
    if (provider === 'gemini') {
      console.error('   Get a key at: https://aistudio.google.com/apikey')
    }
    process.exit(1)
  }

  // Build arguments for Python CLI
  const args: string[] = ['-m', 'clippi_agent.cli']

  if (options.config) {
    args.push('--config', options.config)
  } else {
    if (!options.url) {
      console.error('❌ --url is required')
      console.error('   Usage: clippi generate --url https://myapp.com --tasks tasks.txt')
      process.exit(1)
    }
    if (!options.tasks) {
      console.error('❌ --tasks is required')
      console.error('   Usage: clippi generate --url https://myapp.com --tasks tasks.txt')
      process.exit(1)
    }

    // Validate tasks file exists
    if (!existsSync(options.tasks)) {
      console.error(`❌ Tasks file not found: ${options.tasks}`)
      process.exit(1)
    }

    // Parse and show tasks
    const tasks = parseTasksFile(options.tasks)
    console.log(`📋 Tasks to explore (${tasks.length}):`)
    tasks.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task.description}`)
    })
    console.log('')

    args.push('--url', options.url)
    args.push('--tasks', resolve(options.tasks))
  }

  if (options.output) {
    args.push('--output', resolve(options.output))
  }
  if (options.provider) {
    args.push('--provider', options.provider)
  }
  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.headless === false) {
    args.push('--no-headless')
  }
  if (options.docs) {
    args.push('--docs', resolve(options.docs))
  }
  if (options.timeout) {
    args.push('--timeout', String(options.timeout))
  }

  // Run the Python agent
  return new Promise((resolvePromise, reject) => {
    const child = spawn('python3', args, {
      cwd: agentDir,
      env: { ...process.env, PYTHONPATH: agentDir },
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      const text = data.toString()
      stdout += text
      process.stdout.write(text)
    })

    child.stderr?.on('data', (data) => {
      const text = data.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Manifest generation complete!')
        resolvePromise()
      } else {
        console.error(`\n❌ Agent exited with code ${code}`)
        reject(new Error(`Agent failed with code ${code}`))
      }
    })

    child.on('error', (err) => {
      console.error(`\n❌ Failed to start agent: ${err.message}`)
      reject(err)
    })
  })
}
