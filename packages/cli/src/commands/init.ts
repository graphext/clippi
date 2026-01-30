import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { generateManifest, generateConfig } from '../templates/manifest.js'

/**
 * Init command options
 */
export interface InitOptions {
  force?: boolean
}

/**
 * Initialize a new Clippi project
 *
 * Creates:
 * - guide.manifest.json (starter manifest)
 * - clippi.config.js (configuration file)
 * - public/ directory if it doesn't exist
 */
export async function init(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd()
  const manifestPath = join(cwd, 'guide.manifest.json')
  const configPath = join(cwd, 'clippi.config.js')
  const publicDir = join(cwd, 'public')

  // Get app name from directory name
  const appName = basename(cwd)

  console.log('🚀 Initializing Clippi project...\n')

  // Check for existing files
  if (!options.force) {
    if (existsSync(manifestPath)) {
      console.error('❌ guide.manifest.json already exists. Use --force to overwrite.')
      process.exit(1)
    }
    if (existsSync(configPath)) {
      console.error('❌ clippi.config.js already exists. Use --force to overwrite.')
      process.exit(1)
    }
  }

  // Create public directory if needed
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true })
    console.log('📁 Created public/ directory')
  }

  // Write manifest
  const manifest = generateManifest(appName)
  writeFileSync(manifestPath, manifest, 'utf-8')
  console.log('📝 Created guide.manifest.json')

  // Write config
  const config = generateConfig()
  writeFileSync(configPath, config, 'utf-8')
  console.log('⚙️  Created clippi.config.js')

  console.log('\n✅ Clippi initialized successfully!\n')
  console.log('Next steps:')
  console.log('  1. Edit guide.manifest.json to define your UI targets')
  console.log('  2. Run "npx clippi serve" to start the development server')
  console.log('  3. Run "npx clippi validate" to check your selectors\n')
}
