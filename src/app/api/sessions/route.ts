import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSession, listSessions } from '@/chat/history'

const createSchema = z.object({
  mode: z.enum(['CHAT', 'REFLECTION', 'RESEARCH', 'VOICE', 'VIDEO']).default('CHAT'),
  title: z.string().max(120).optional(),
})

export async function GET() {
  const sessions = await listSessions()
  return Response.json(sessions)
}

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = createSchema.safeParse(raw)

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const session = await createSession(parsed.data.mode, parsed.data.title)
  return Response.json(session, { status: 201 })
}
