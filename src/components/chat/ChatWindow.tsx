'use client'

import { useEffect, useRef } from 'react'
import type { Mode } from '@/lib/types'
import { MODE_LABELS, MODE_COLORS } from '@/lib/types'
import { useStreamingChat, type ChatMessage } from '@/hooks/useStreamingChat'
import { MessageBubble, ThinkingBubble } from './MessageBubble'
import { InputBar } from './InputBar'

interface ChatWindowProps {
  sessionId: string
  mode: Mode
  initialMessages: ChatMessage[]
}

export function ChatWindow({ sessionId, mode, initialMessages }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { messages, input, setInput, sendMessage, isLoading, error } = useStreamingChat({
    sessionId,
    mode,
    initialMessages,
  })

  const lastMessage = messages[messages.length - 1]
  const isStreaming = isLoading && lastMessage?.role === 'assistant' && lastMessage.content === ''

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-6 py-3 border-b border-zinc-800 shrink-0">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${MODE_COLORS[mode]}`}>
          {MODE_LABELS[mode]}
        </span>
        {error && (
          <span className="ml-3 text-xs text-rose-400">{error}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
          {messages.length === 0 && (
            <div className="text-center text-zinc-600 text-sm mt-16">
              Start a conversation
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming && <ThinkingBubble />}
          <div ref={bottomRef} />
        </div>
      </div>

      <InputBar
        input={input}
        isLoading={isLoading}
        onInputChange={(e) => setInput(e.target.value)}
        onSubmit={sendMessage}
      />
    </div>
  )
}
