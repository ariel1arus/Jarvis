import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuditLog, patchAuditLog } from '@/chat/audit'
import { createOpenClawClient } from '@/lib/openclaw'

const bodySchema = z.object({
  confirmed: z.boolean(),
  // External side effects require the user to type "CONFIRM" to prevent accidental execution
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
  if (!log) return Response.json({ error: 'Audit entry not found' }, { status: 404 })
  if (log.status !== 'pending') {
    return Response.json({ error: `Entry is already ${log.status}` }, { status: 409 })
  }

  if (!confirmed) {
    await patchAuditLog(id, { status: 'rejected', rejectedReason: 'User declined' })
    return Response.json({ status: 'rejected' })
  }

  if (log.actionKind === 'external_side_effect' && confirmationPhrase !== 'CONFIRM') {
    return Response.json(
      { error: 'External side effects require confirmationPhrase: "CONFIRM"' },
      { status: 422 }
    )
  }

  await patchAuditLog(id, { status: 'approved' })

  const oclaw = createOpenClawClient()
  try {
    const text = await oclaw.delegate(log.goal)
    await patchAuditLog(id, { status: 'executed', output: { text }, executedAt: new Date() })
    return Response.json({ status: 'executed', output: text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await patchAuditLog(id, { status: 'failed', rejectedReason: msg })
    return Response.json({ status: 'failed', error: msg }, { status: 502 })
  }
}
