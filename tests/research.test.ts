import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeWebSearch } from '../src/agents/tools/webSearch'
import { buildSystemPrompt } from '../src/agents/prompts/system'
import { env } from '../src/lib/env'

// ---------------------------------------------------------------------------
// executeWebSearch — unit tests (no real HTTP)
// ---------------------------------------------------------------------------

describe('executeWebSearch — graceful fallback', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = env.BRAVE_SEARCH_API_KEY
    env.BRAVE_SEARCH_API_KEY = undefined
  })

  afterEach(() => {
    env.BRAVE_SEARCH_API_KEY = saved
  })

  it('returns unavailable result when API key is absent', async () => {
    const results = await executeWebSearch('test')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Search unavailable')
    expect(results[0].snippet).toContain('BRAVE_SEARCH_API_KEY')
  })
})

describe('executeWebSearch — network error handling', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = env.BRAVE_SEARCH_API_KEY
    env.BRAVE_SEARCH_API_KEY = 'fake-key'
  })

  afterEach(() => {
    env.BRAVE_SEARCH_API_KEY = saved
  })

  it('returns error result when fetch throws', async () => {
    const original = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const results = await executeWebSearch('test')
    expect(results[0].title).toBe('Search error')
    global.fetch = original
  })

  it('returns error result on non-200 HTTP response', async () => {
    const original = global.fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    const results = await executeWebSearch('test')
    expect(results[0].title).toBe('Search failed')
    expect(results[0].snippet).toContain('429')
    global.fetch = original
  })
})

describe('executeWebSearch — result mapping', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = env.BRAVE_SEARCH_API_KEY
    env.BRAVE_SEARCH_API_KEY = 'fake-key'
  })

  afterEach(() => {
    env.BRAVE_SEARCH_API_KEY = saved
  })

  it('maps Brave API response fields correctly', async () => {
    const original = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Result 1', url: 'https://example.com/1', description: 'Snippet 1' },
            { title: 'Result 2', url: 'https://example.com/2', description: 'Snippet 2' },
          ],
        },
      }),
    })
    const results = await executeWebSearch('test')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' })
    global.fetch = original
  })

  it('caps results at 5', async () => {
    const original = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: Array.from({ length: 10 }, (_, i) => ({
            title: `R${i}`,
            url: `https://example.com/${i}`,
            description: `S${i}`,
          })),
        },
      }),
    })
    const results = await executeWebSearch('test')
    expect(results).toHaveLength(5)
    global.fetch = original
  })
})

// ---------------------------------------------------------------------------
// System prompt — RESEARCH mode citation format
// ---------------------------------------------------------------------------

describe('RESEARCH system prompt', () => {
  const prompt = buildSystemPrompt('RESEARCH')

  it('includes citation instruction', () => {
    expect(prompt).toContain('[1]')
  })

  it('requires Sources section', () => {
    expect(prompt).toContain('## Sources')
  })

  it('instructs not to fabricate citations', () => {
    expect(prompt.toLowerCase()).toContain('fabricat')
  })

  it('CHAT prompt does not contain citation instructions', () => {
    const chat = buildSystemPrompt('CHAT')
    expect(chat).not.toContain('## Sources')
  })
})
