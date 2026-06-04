import type { ChatSession, Message } from '@/generated/prisma/client'

export type { ChatSession, Message }

export type SessionWithMessages = ChatSession & { messages: Message[] }

export type SessionSummary = ChatSession & { messages: Message[] }
