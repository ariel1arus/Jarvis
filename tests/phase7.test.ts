import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifyGoal } from '../src/agents/gatekeep'
import { createOpenClawClient } from '../src/lib/openclaw'
import { env } from '../src/lib/env'

// ---------------------------------------------------------------------------
// Gatekeep — mode blocking (pure, no LLM call)
// ---------------------------------------------------------------------------

describe('classifyGoal — mode blocking', () => {
  it('blocks CHAT mode without calling the LLM', async () => {
    const result = await classifyGoal('search the web', 'CHAT')
    expect(result.blocked).toBe(true)
    expect((result as { reason: string }).reason).toMatch(/CHAT/)
  })

  it('blocks REFLECTION mode without calling the LLM', async () => {
    const result = await classifyGoal('find something', 'REFLECTION')
    expect(result.blocked).toBe(true)
    expect((result as { reason: string }).reason).toMatch(/REFLECTION/)
  })
})

// ---------------------------------------------------------------------------
// Gatekeep — LLM classification (mocked generateObject)
// ---------------------------------------------------------------------------

describe('classifyGoal — LLM classification', () => {
  beforeEach(() => {
    vi.mock('ai', async (importOriginal) => {
      const actual = await importOriginal<typeof import('ai')>()
      return {
        ...actual,
        generateObject: vi.fn(),
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns read_only for a browsing goal', async () => {
    const { generateObject } = await import('ai')
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { actionKind: 'read_only', summary: 'Read page content', reasoning: 'No mutation' },
    } as never)

    const result = await classifyGoal('read the headlines on bbc.com', 'RESEARCH')
    expect(result.blocked).toBe(false)
    if (!result.blocked) expect(result.actionKind).toBe('read_only')
  })

  it('returns external_side_effect for a form-submission goal', async () => {
    const { generateObject } = await import('ai')
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        actionKind: 'external_side_effect',
        summary: 'Submit contact form',
        reasoning: 'Sends data externally',
      },
    } as never)

    const result = await classifyGoal('submit the contact form on example.com', 'RESEARCH')
    expect(result.blocked).toBe(false)
    if (!result.blocked) expect(result.actionKind).toBe('external_side_effect')
  })

  it('fails safe to external_side_effect when LLM throws', async () => {
    const { generateObject } = await import('ai')
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('LLM down'))

    const result = await classifyGoal('do something', 'RESEARCH')
    expect(result.blocked).toBe(false)
    if (!result.blocked) expect(result.actionKind).toBe('external_side_effect')
  })
})

// ---------------------------------------------------------------------------
// OpenClaw adapter — stub when disabled
// ---------------------------------------------------------------------------

describe('createOpenClawClient — stub path', () => {
  it('returns stub text when OPENCLAW_ENABLED is false', async () => {
    const saved = env.OPENCLAW_ENABLED
    env.OPENCLAW_ENABLED = false
    const client = createOpenClawClient()
    const result = await client.delegate('open google.com')
    expect(result).toContain('[STUB]')
    env.OPENCLAW_ENABLED = saved
  })

  it('stub dry-run also returns stub text', async () => {
    const saved = env.OPENCLAW_ENABLED
    env.OPENCLAW_ENABLED = false
    const client = createOpenClawClient()
    const result = await client.dryRun('click the button')
    expect(result).toContain('[STUB DRY RUN]')
    env.OPENCLAW_ENABLED = saved
  })

  it('uses OPENCLAW_API_KEY when set', () => {
    const saved = env.OPENCLAW_ENABLED
    const savedKey = env.OPENCLAW_API_KEY
    env.OPENCLAW_ENABLED = true
    env.OPENCLAW_API_KEY = 'custom-key'
    // createOpenClawClient should not throw
    expect(() => createOpenClawClient()).not.toThrow()
    env.OPENCLAW_ENABLED = saved
    env.OPENCLAW_API_KEY = savedKey
  })

  it('falls back to OPENAI_API_KEY when OPENCLAW_API_KEY is not set', () => {
    const saved = env.OPENCLAW_ENABLED
    const savedKey = env.OPENCLAW_API_KEY
    env.OPENCLAW_ENABLED = true
    env.OPENCLAW_API_KEY = undefined
    expect(() => createOpenClawClient()).not.toThrow()
    env.OPENCLAW_ENABLED = saved
    env.OPENCLAW_API_KEY = savedKey
  })
})
