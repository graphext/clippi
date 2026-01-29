import { existsSync, readFileSync, watchFile } from 'node:fs'
import { join } from 'node:path'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { generateContext, validateManifest, type Manifest } from '@clippi/core'

/**
 * Serve command options
 */
export interface ServeOptions {
  port?: number
  manifest?: string
  open?: boolean
}

/**
 * Mock chat response (for development)
 */
function mockChatResponse(manifest: Manifest, query: string): object {
  // Simple keyword matching for demo
  const queryLower = query.toLowerCase()

  for (const element of manifest.elements) {
    const keywords = [...element.keywords, element.label.toLowerCase()]
    const match = keywords.some(kw => queryLower.includes(kw.toLowerCase()))
    if (match) {
      return {
        action: 'guide',
        elementId: element.id,
        instruction: element.description,
      }
    }
  }

  return {
    action: 'text',
    content: `I couldn't find a specific guide for "${query}". Try asking about: ${manifest.elements.map(e => e.label).join(', ')}`,
  }
}

/**
 * Start the development server
 *
 * Features:
 * - Serves the manifest file
 * - Mock chat endpoint
 * - Hot reload on manifest changes
 * - CORS enabled
 */
export async function serve(options: ServeOptions = {}): Promise<void> {
  const port = options.port ?? 3001
  const manifestPath = options.manifest ?? join(process.cwd(), 'guide.manifest.json')

  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}`)
    console.error('   Run "npx clippi init" first.')
    process.exit(1)
  }

  let manifest: Manifest
  let context: ReturnType<typeof generateContext>

  /**
   * Load and validate manifest
   */
  function loadManifest(): void {
    try {
      const content = readFileSync(manifestPath, 'utf-8')
      manifest = JSON.parse(content)

      const validation = validateManifest(manifest)
      if (!validation.valid) {
        console.error('⚠️  Manifest validation warnings:')
        validation.errors.forEach((err) => console.error(`   - ${err}`))
      }

      context = generateContext(manifest)
      console.log(`✅ Loaded manifest with ${manifest.elements.length} elements`)
    } catch (error) {
      console.error(`❌ Failed to load manifest: ${error}`)
    }
  }

  // Initial load
  loadManifest()

  // Watch for changes
  watchFile(manifestPath, { interval: 500 }, () => {
    console.log('\n🔄 Manifest changed, reloading...')
    loadManifest()
  })

  // Create HTTP server
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Route: GET /guide.manifest.json
    if (req.method === 'GET' && req.url === '/guide.manifest.json') {
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify(manifest, null, 2))
      return
    }

    // Route: GET /guide.context.json
    if (req.method === 'GET' && req.url === '/guide.context.json') {
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify(context, null, 2))
      return
    }

    // Route: POST /api/clippi/chat (mock endpoint)
    if (req.method === 'POST' && req.url === '/api/clippi/chat') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const messages = data.messages || []
          const lastMessage = messages[messages.length - 1]
          const query = lastMessage?.content || ''

          const response = mockChatResponse(manifest, query)

          res.setHeader('Content-Type', 'application/json')
          res.writeHead(200)
          res.end(JSON.stringify(response))
        } catch (error) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
      return
    }

    // Route: GET / (info page)
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.writeHead(200)
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Clippi Dev Server</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
    a { color: #6366f1; }
  </style>
</head>
<body>
  <h1>🎯 Clippi Dev Server</h1>
  <p>The development server is running.</p>

  <h2>Available Endpoints</h2>
  <ul>
    <li><a href="/guide.manifest.json"><code>GET /guide.manifest.json</code></a> - Full manifest</li>
    <li><a href="/guide.context.json"><code>GET /guide.context.json</code></a> - LLM context (reduced)</li>
    <li><code>POST /api/clippi/chat</code> - Mock chat endpoint</li>
  </ul>

  <h2>Elements (${manifest.elements.length})</h2>
  <ul>
    ${manifest.elements.map(e => `<li><strong>${e.label}</strong> (${e.id})</li>`).join('\n    ')}
  </ul>

  <h2>Usage</h2>
  <p>Add this to your app:</p>
  <pre><code>&lt;script type="module"&gt;
import { Clippi } from '@clippi/chat'

Clippi.init({
  manifest: 'http://localhost:${port}/guide.manifest.json',
  llm: { endpoint: 'http://localhost:${port}/api/clippi/chat' }
})
&lt;/script&gt;

&lt;clippi-chat /&gt;</code></pre>
</body>
</html>
      `)
      return
    }

    // 404
    res.writeHead(404)
    res.end('Not Found')
  })

  server.listen(port, () => {
    console.log(`\n🚀 Clippi dev server running at http://localhost:${port}\n`)
    console.log('Endpoints:')
    console.log(`  - GET  http://localhost:${port}/guide.manifest.json`)
    console.log(`  - GET  http://localhost:${port}/guide.context.json`)
    console.log(`  - POST http://localhost:${port}/api/clippi/chat`)
    console.log('\n📁 Watching for manifest changes...\n')
  })
}
