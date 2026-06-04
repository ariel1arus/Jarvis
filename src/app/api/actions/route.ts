import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { MODES } from '@/lib/types'
import { classifyGoal } from '@/agents/gatekeep'
import { appendAuditLog, patchAuditLog } from '@/chat/audit'
import { createOpenClawClient } from '@/lib/openclaw'

const bodySchema = z.object({
  goal: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  mode: z.enum(MODES),
})

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
    return Response.json({ error: `Action delegation is not available in ${mode} mode.` }, { status: 403 })
  }

  // Classify the goal — determines approval tier
  const classification = await classifyGoal(goal, mode)
  if (classification.blocked) {
    return Response.json({ error: classification.reason }, { status: 403 })
  }

  const oclaw = createOpenClawClient()

  if (classification.actionKind === 'read_only') {
    // Auto-approve: log → execute → update log
    const auditId = await appendAuditLog({
      sessionId,
      goal,
      actionKind: 'read_only',
      status: 'auto_approved',
    })

    try {
      const text = await oclaw.delegate(goal)
      await patchAuditLog(auditId, { status: 'executed', output: { text }, executedAt: new Date() })
      return Response.json({ auditId, status: 'executed', summary: classification.summary, output: text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await patchAuditLog(auditId, { status: 'failed', rejectedReason: msg })
      return Response.json({ auditId, status: 'failed', error: msg }, { status: 502 })
    }
  }

  // local_mutation or external_side_effect: dry-run first, then await explicit approval
  let dryRunText = ''
  try {
    dryRunText = await oclaw.dryRun(goal)
  } catch {
    dryRunText = 'Dry-run preview unavailable.'
  }

  const auditId = await appendAuditLog({
    sessionId,
    goal,
    actionKind: classification.actionKind,
    status: 'pending',
    dryRunOutput: { text: dryRunText },
  })

  return Response.json({
    auditId,
    status: 'pending',
    summary: classification.summary,
    actionKind: classification.actionKind,
    dryRunPreview: dryRunText,
    nextStep:
      classification.actionKind === 'external_side_effect'
        ? 'POST /api/actions/:auditId/approve with { confirmed: true, confirmationPhrase: "CONFIRM" }'
        : 'POST /api/actions/:auditId/approve with { confirmed: true }',
    warning:
      classification.actionKind === 'external_side_effect'
        ? 'This action will send data to an external server and cannot be undone.'
        : 'This action will modify local state.',
  })
}
