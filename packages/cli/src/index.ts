import { Command } from 'commander'
import { init } from './commands/init.js'
import { serve } from './commands/serve.js'
import { validate } from './commands/validate.js'

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
  .action(async (options) => {
    await validate({
      manifest: options.manifest,
      conditions: options.conditions,
      flows: options.flows,
      url: options.url,
    })
  })

// Parse and execute
program.parse()
