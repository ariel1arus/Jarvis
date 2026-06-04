import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { MODES } from '@/lib/types'
import { planGoal } from '@/agents/planner'
import { gatekeepPlan, planHasBlockedSteps } from '@/agents/gatekeep'
import { appendAuditLog, patchAuditLog } from '@/chat/audit'
import { createOpenClawClient } from '@/lib/openclaw'

const bodySchema = z.object({
  goal: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  mode: z.enum(MODES),
})

// CHAT and REFLECTION may never trigger this route.
const BLOCKED_MODES = new Set(['CHAT', 'REFLECTION'])

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { goal, sessionId, mode } = parsed.data

  if (BLOCKED_MODES.has(mode)) {
    return Response.json(
      { error: `Actions are not available in ${mode} mode.` },
      { status: 403 }
    )
  }

  // 1 — Plan
  let plan
  try {
    plan = await planGoal(goal)
  } catch (err) {
    console.error('[actions] planner failed', err)
    return Response.json({ error: 'Planning failed. Try rephrasing your goal.' }, { status: 502 })
  }

  // 2 — Gate every step
  const verdicts = gatekeepPlan(plan.steps, mode)

  if (planHasBlockedSteps(verdicts)) {
    const blocked = verdicts
      .filter((v) => !v.verdict.allowed)
      .map((v) => ({ toolName: v.step.toolName, reason: (v.verdict as { reason: string }).reason }))
    return Response.json({ error: 'Plan contains disallowed actions', blocked }, { status: 403 })
  }

  const oclaw = createOpenClawClient()
  const results = []

  for (const { step, verdict } of verdicts) {
    if (!verdict.allowed) continue // already handled above

    if (verdict.kind === 'read_only') {
      // Auto-approve: log → execute → update log
      const auditId = await appendAuditLog({
        sessionId,
        toolName: step.toolName,
        actionKind: 'read_only',
        input: step.input,
        status: 'auto_approved',
      })

      let output: Record<string, unknown>
      try {
        output = await oclaw.invoke(step.toolName, step.input)
        await patchAuditLog(auditId, { status: 'executed', output, executedAt: new Date() })
        results.push({ auditId, toolName: step.toolName, kind: 'read_only', status: 'executed', output })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await patchAuditLog(auditId, { status: 'failed', rejectedReason: msg })
        results.push({ auditId, toolName: step.toolName, kind: 'read_only', status: 'failed', error: msg })
      }
    } else {
      // local_mutation or external_side_effect: dry-run then await approval
      let dryRunOutput: Record<string, unknown> | undefined
      try {
        dryRunOutput = await oclaw.dryRun(step.toolName, step.input)
      } catch {
        dryRunOutput = { note: 'Dry-run unavailable' }
      }

      const auditId = await appendAuditLog({
        sessionId,
        toolName: step.toolName,
        actionKind: verdict.kind,
        input: step.input,
        status: 'pending',
        dryRunOutput,
      })

      results.push({
        auditId,
        toolName: step.toolName,
        kind: verdict.kind,
        status: 'pending',
        dryRunOutput,
        warning:
          verdict.kind === 'external_side_effect'
            ? 'This action sends data to an external server. Explicit confirmation required.'
            : 'This action modifies local state. Confirm to proceed.',
      })
    }
  }

  return Response.json({
    summary: plan.summary,
    sessionId,
    results,
  })
}
