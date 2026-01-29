/**
 * Clippi Reference Backend Implementation
 *
 * This is a minimal Express server that demonstrates how to implement
 * the Clippi backend contract. It handles intent classification and
 * returns appropriate responses for the chat widget.
 *
 * In production, you would:
 * 1. Use your own authentication
 * 2. Connect to your preferred LLM provider
 * 3. Add rate limiting and error handling
 * 4. Store conversation history if needed
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = join(__dirname, '..', '..', '..')

const app = express()
app.use(express.json())

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})

// Serve clippi packages (for import map resolution)
app.use('/@clippi/core', express.static(join(ROOT_DIR, 'packages/core/dist')))
app.use('/@clippi/cursor', express.static(join(ROOT_DIR, 'packages/cursor/dist')))
app.use('/@clippi/chat', express.static(join(ROOT_DIR, 'packages/chat/dist')))

// Serve demo app static files
app.use(express.static(join(ROOT_DIR, 'examples/demo-app')))

// Configuration
const PORT = process.env.PORT || 3001
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock' // 'openai' | 'anthropic' | 'gemini' | 'mock'

/**
 * Simple keyword-based intent classification
 * In production, use an LLM for better accuracy
 */
function classifyIntent(query, manifest) {
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/)

  let bestMatch = null
  let bestScore = 0

  // Score each element and find the best match
  for (const element of manifest) {
    const keywords = [
      ...element.keywords,
      element.label.toLowerCase(),
      ...element.description.toLowerCase().split(' ')
    ]

    // Calculate score based on keyword matches
    let score = 0
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      // Exact word match in query (higher score)
      if (queryWords.includes(kwLower)) {
        score += 3
      }
      // Partial match (query contains keyword or vice versa)
      else if (queryLower.includes(kwLower) || kwLower.includes(queryLower)) {
        score += 1
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = { type: 'guide', elementId: element.id, score }
    }
  }

  if (bestMatch && bestScore >= 1) {
    return bestMatch
  }

  return { type: 'text', score: 0 }
}

/**
 * Check if user has access based on conditions
 * In production, this would check against your user database
 */
function checkAccess(elementId, context) {
  // Demo: always allow access
  // In production, you would:
  // 1. Look up the element's conditions from the full manifest
  // 2. Evaluate against the user's context
  // 3. Return blocked response with reason if not allowed
  return { allowed: true }
}

/**
 * Generate a text response for non-guide queries
 * In production, use an LLM for natural responses
 */
function generateTextResponse(query, manifest) {
  // Simple fallback responses
  const greetings = ['hi', 'hello', 'hey', 'help']
  if (greetings.some(g => query.toLowerCase().includes(g))) {
    return `Hi! I can help you navigate the app. Try asking about: ${manifest.map(e => e.label).join(', ')}`
  }

  return `I'm not sure how to help with that. I can guide you through: ${manifest.map(e => e.label).join(', ')}`
}

/**
 * POST /api/clippi/chat
 *
 * Main chat endpoint. Receives user messages and returns appropriate responses.
 *
 * Request body:
 * {
 *   messages: [{ role: 'user' | 'assistant', content: string }],
 *   context: { plan?: string, permissions?: string[], state?: object },
 *   manifest: [{ id, label, description, keywords, category }]
 * }
 *
 * Response:
 * {
 *   action: 'guide' | 'blocked' | 'text',
 *   elementId?: string,      // For 'guide'
 *   instruction?: string,    // For 'guide'
 *   reason?: { type, missing?, message? },  // For 'blocked'
 *   content?: string         // For 'text'
 * }
 */
app.post('/api/clippi/chat', async (req, res) => {
  try {
    const { messages, context = {}, manifest = [] } = req.body

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' })
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'user') {
      return res.status(400).json({ error: 'Last message must be from user' })
    }

    const query = lastMessage.content

    // Classify intent
    const intent = classifyIntent(query, manifest)

    if (intent.type === 'guide') {
      // Check access
      const access = checkAccess(intent.elementId, context)

      if (!access.allowed) {
        return res.json({
          action: 'blocked',
          elementId: intent.elementId,
          reason: {
            type: access.reason || 'permission',
            missing: access.missing,
            message: access.message || 'Access denied'
          }
        })
      }

      // Find the element for instruction
      const element = manifest.find(e => e.id === intent.elementId)

      return res.json({
        action: 'guide',
        elementId: intent.elementId,
        instruction: element?.description || 'Let me show you...'
      })
    }

    // Text response fallback
    const content = generateTextResponse(query, manifest)
    return res.json({
      action: 'text',
      content
    })

  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: LLM_PROVIDER })
})

// Start server
app.listen(PORT, () => {
  console.log(``)
  console.log(`  Clippi Demo running at http://localhost:${PORT}`)
  console.log(``)
  console.log(`  Open the URL above and click the chat bubble in the bottom-right corner.`)
  console.log(`  Try asking: "How do I export data?"`)
  console.log(``)
})
