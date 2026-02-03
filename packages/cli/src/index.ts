import { Command } from 'commander'
import { init } from './commands/init.js'
import { serve } from './commands/serve.js'
import { validate } from './commands/validate.js'
import { generate } from './commands/generate.js'

const program = new Command()

program
  .name('clippi')
  .description('CLI for Clippi - Visual cursor guidance library')
  .version('0.1.0')

// Init command
program
  .command('init')
  .description('Initialize a new Clippi project')
  .option('-f, --force', 'Overwrite existing files')
  .action(async (options) => {
    await init(options)
  })

// Serve command
program
  .command('serve')
  .description('Start development server with hot reload')
  .option('-p, --port <port>', 'Port to listen on', '3001')
  .option('-m, --manifest <path>', 'Path to manifest file', 'guide.manifest.json')
  .option('-o, --open', 'Open browser automatically')
  .action(async (options) => {
    await serve({
      port: parseInt(options.port, 10),
      manifest: options.manifest,
      open: options.open,
    })
  })

// Validate command
program
  .command('validate')
  .description('Validate manifest file')
  .option('-m, --manifest <path>', 'Path to manifest file', 'guide.manifest.json')
  .option('-c, --conditions', 'Validate condition syntax')
  .option('-f, --flows', 'Validate flow paths')
  .option('-u, --url <url>', 'URL to validate selectors against (requires playwright)')
  .option('-e, --e2e', 'Run end-to-end path validation (clicks through flows, requires --url)')
  .action(async (options) => {
    await validate({
      manifest: options.manifest,
      conditions: options.conditions,
      flows: options.flows,
      url: options.url,
      e2e: options.e2e,
    })
  })

// Generate command
program
  .command('generate')
  .description('Generate manifest using AI agent + Browser Use')
  .option('-u, --url <url>', 'URL of the application to explore')
  .option('-t, --tasks <path>', 'Path to tasks file (one task per line, or JSON)')
  .option('-o, --output <path>', 'Output path for manifest', 'guide.manifest.json')
  .option('-p, --provider <provider>', 'LLM provider (gemini, openai, anthropic)', 'gemini')
  .option('--model <model>', 'Model name', 'gemini-3-flash-preview')
  .option('--no-headless', 'Run browser with visible UI')
  .option('-d, --docs <path>', 'Path to documentation file for context')
  .option('--timeout <ms>', 'Timeout for operations in ms', '30000')
  .option('-c, --config <path>', 'Path to JSON config file')
  .action(async (options) => {
    await generate({
      url: options.url,
      tasks: options.tasks,
      output: options.output,
      provider: options.provider,
      model: options.model,
      headless: options.headless,
      docs: options.docs,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      config: options.config,
    })
  })

// Parse and execute
program.parse()
