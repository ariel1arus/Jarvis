import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { MemoryKind } from '@/generated/prisma/client'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function computeExpiry(kind: MemoryKind): Date | null {
  switch (kind) {
    case 'short_term':
      return new Date(Date.now() + 24 * HOUR_MS)
    case 'episodic':
      return new Date(Date.now() + 30 * DAY_MS)
    case 'long_term':
      return null
    default:
      return null
  }
}

export async function storeMemory(params: {
  sessionId: string
  messageId?: string
  kind: MemoryKind
  content: string
  embedding: number[]
}): Promise<string> {
  const { sessionId, messageId, kind, content, embedding } = params
  const id = randomUUID()
  const expiresAt = computeExpiry(kind)
  const vectorStr = `[${embedding.join(',')}]`

  await prisma.$executeRaw`
    INSERT INTO "MemoryChunk" (id, "sessionId", "messageId", kind, content, embedding, "createdAt", "expiresAt")
    VALUES (
      ${id},
      ${sessionId},
      ${messageId ?? null},
      ${kind}::"MemoryKind",
      ${content},
      ${vectorStr}::vector,
      NOW(),
      ${expiresAt}
    )
  `

  return id
}
