import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuditLog, patchAuditLog } from '@/chat/audit'
import { createOpenClawClient } from '@/lib/openclaw'

const bodySchema = z.object({
  confirmed: z.boolean(),
  // Required for external_side_effect: user must type "CONFIRM" to proceed
  confirmationPhrase: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const { confirmed, confirmationPhrase } = parsed.data

  const log = await getAuditLog(id)
  if (!log) {
    return Response.json({ error: 'Audit entry not found' }, { status: 404 })
  }
  if (log.status !== 'pending') {
    return Response.json({ error: `Entry is already ${log.status}`, status: log.status }, { status: 409 })
  }

  if (!confirmed) {
    await patchAuditLog(id, { status: 'rejected', rejectedReason: 'User declined' })
    return Response.json({ status: 'rejected' })
  }

  // External side effects require the confirmation phrase to prevent accidental clicks
  if (log.actionKind === 'external_side_effect' && confirmationPhrase !== 'CONFIRM') {
    return Response.json(
      { error: 'External side effects require confirmationPhrase: "CONFIRM"' },
      { status: 422 }
    )
  }

  const oclaw = createOpenClawClient()
  try {
    const output = await oclaw.invoke(log.toolName, log.input as Record<string, unknown>)
    await patchAuditLog(id, { status: 'executed', output, executedAt: new Date() })
    return Response.json({ status: 'executed', output })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await patchAuditLog(id, { status: 'failed', rejectedReason: msg })
    return Response.json({ status: 'failed', error: msg }, { status: 502 })
  }
}
