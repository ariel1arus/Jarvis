import { notFound } from 'next/navigation'
import { getSession } from '@/chat/history'
import { ChatWindow } from '@/components/chat/ChatWindow'
import type { Mode } from '@/lib/types'
import type { ChatMessage } from '@/hooks/useStreamingChat'

export default async function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const session = await getSession(sessionId)

  if (!session) notFound()

  const initialMessages: ChatMessage[] = session.messages.map((m) => ({
    id: m.id,
    role: m.role as ChatMessage['role'],
    content: m.content,
    createdAt: m.createdAt,
  }))

  return (
    <ChatWindow
      sessionId={session.id}
      mode={session.mode as Mode}
      initialMessages={initialMessages}
    />
  )
}
