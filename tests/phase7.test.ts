import { describe, it, expect } from 'vitest'
import { gatekeepStep, gatekeepPlan, planHasBlockedSteps, planHasExternalSideEffects } from '../src/agents/gatekeep'
import { getTool, toolsForPrompt, TOOL_REGISTRY } from '../src/agents/tools/registry'
import { createOpenClawClient } from '../src/lib/openclaw'
import { env } from '../src/lib/env'

// ---------------------------------------------------------------------------
// Registry — structural checks
// ---------------------------------------------------------------------------

describe('tool registry', () => {
  it('every tool has a non-empty description', () => {
    for (const t of Object.values(TOOL_REGISTRY)) {
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('no tool allows CHAT or REFLECTION mode', () => {
    for (const t of Object.values(TOOL_REGISTRY)) {
      expect(t.allowedModes).not.toContain('CHAT')
      expect(t.allowedModes).not.toContain('REFLECTION')
    }
  })

  it('getTool returns undefined for unknown names', () => {
    expect(getTool('does.not.exist')).toBeUndefined()
  })

  it('toolsForPrompt includes all registry keys', () => {
    const prompt = toolsForPrompt()
    for (const name of Object.keys(TOOL_REGISTRY)) {
      expect(prompt).toContain(name)
    }
  })
})

// ---------------------------------------------------------------------------
// Gatekeep — mode blocking
// ---------------------------------------------------------------------------

describe('gatekeepStep — mode blocking', () => {
  it('blocks all tools in CHAT mode', () => {
    const v = gatekeepStep('browser.navigate', 'CHAT')
    expect(v.allowed).toBe(false)
    expect((v as { reason: string }).reason).toMatch(/CHAT/)
  })

  it('blocks all tools in REFLECTION mode', () => {
    const v = gatekeepStep('browser.navigate', 'REFLECTION')
    expect(v.allowed).toBe(false)
    expect((v as { reason: string }).reason).toMatch(/REFLECTION/)
  })

  it('blocks unknown tool names', () => {
    const v = gatekeepStep('hacker.tool', 'RESEARCH')
    expect(v.allowed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gatekeep — action-kind rules
// ---------------------------------------------------------------------------

describe('gatekeepStep — action kinds', () => {
  it('read_only: allowed, no approval required', () => {
    const v = gatekeepStep('browser.navigate', 'RESEARCH')
    expect(v.allowed).toBe(true)
    if (v.allowed) {
      expect(v.kind).toBe('read_only')
      expect(v.requiresApproval).toBe(false)
    }
  })

  it('local_mutation: allowed but requires approval', () => {
    const v = gatekeepStep('browser.click', 'RESEARCH')
    expect(v.allowed).toBe(true)
    if (v.allowed) {
      expect(v.kind).toBe('local_mutation')
      expect(v.requiresApproval).toBe(true)
    }
  })

  it('external_side_effect: allowed but requires approval', () => {
    const v = gatekeepStep('browser.submit', 'RESEARCH')
    expect(v.allowed).toBe(true)
    if (v.allowed) {
      expect(v.kind).toBe('external_side_effect')
      expect(v.requiresApproval).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Gatekeep — plan-level helpers
// ---------------------------------------------------------------------------

describe('gatekeepPlan helpers', () => {
  const readStep = { toolName: 'browser.navigate', input: { url: 'https://example.com' }, reasoning: 'r' }
  const mutateStep = { toolName: 'browser.click', input: { selector: '#btn' }, reasoning: 'r' }
  const externalStep = { toolName: 'browser.submit', input: { selector: 'form' }, reasoning: 'r' }
  const badStep = { toolName: 'unknown.tool', input: {}, reasoning: 'r' }

  it('pure read plan has no blocked steps', () => {
    const verdicts = gatekeepPlan([readStep], 'RESEARCH')
    expect(planHasBlockedSteps(verdicts)).toBe(false)
    expect(planHasExternalSideEffects(verdicts)).toBe(false)
  })

  it('plan with unknown tool is blocked', () => {
    const verdicts = gatekeepPlan([badStep], 'RESEARCH')
    expect(planHasBlockedSteps(verdicts)).toBe(true)
  })

  it('plan with external step detected correctly', () => {
    const verdicts = gatekeepPlan([readStep, externalStep], 'RESEARCH')
    expect(planHasExternalSideEffects(verdicts)).toBe(true)
  })

  it('CHAT mode blocks all steps in a plan', () => {
    const verdicts = gatekeepPlan([readStep, mutateStep], 'CHAT')
    expect(planHasBlockedSteps(verdicts)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OpenClaw adapter — stub when disabled
// ---------------------------------------------------------------------------

describe('createOpenClawClient — stub path', () => {
  it('returns stub output when OPENCLAW_ENABLED is false', async () => {
    const saved = env.OPENCLAW_ENABLED
    env.OPENCLAW_ENABLED = false
    const client = createOpenClawClient()
    const result = await client.invoke('browser.navigate', { url: 'https://example.com' })
    expect(result.stub).toBe(true)
    env.OPENCLAW_ENABLED = saved
  })

  it('stub dry-run also returns stub flag', async () => {
    const saved = env.OPENCLAW_ENABLED
    env.OPENCLAW_ENABLED = false
    const client = createOpenClawClient()
    const result = await client.dryRun('browser.click', { selector: '#x' })
    expect(result.stub).toBe(true)
    expect(result.dryRun).toBe(true)
    env.OPENCLAW_ENABLED = saved
  })
})
