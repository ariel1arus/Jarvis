import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { runJarvis } from '@/agents/jarvis'
import { appendMessage, getSession, updateSessionTitle } from '@/chat/history'
import { MODES } from '@/lib/types'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  mode: z.enum(MODES),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().max(8000),
    })
  ),
})

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { sessionId, mode, messages } = parsed.data
  const lastMessage = messages[messages.length - 1]

  if (lastMessage?.role === 'user') {
    await appendMessage(sessionId, 'user', lastMessage.content)

    // Auto-title from the first user message
    const session = await getSession(sessionId)
    if (session && session.messages.length <= 1 && session.title === 'New conversation') {
      const title = lastMessage.content.slice(0, 60).replace(/\n/g, ' ').trim()
      if (title) await updateSessionTitle(sessionId, title)
    }
  }

  const result = runJarvis({
    sessionId,
    mode,
    messages,
    onFinish: async ({ text }) => {
      try {
        await appendMessage(sessionId, 'assistant', text)
      } catch (err) {
        console.error('Failed to persist assistant message for session', sessionId, err)
      }
    },
  })

  return result.toTextStreamResponse()
}
