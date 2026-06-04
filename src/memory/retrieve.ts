import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'

export type MemoryHit = {
  id: string
  content: string
  kind: string
  distance: number
}

export async function retrieveMemories(
  sessionId: string,
  queryEmbedding: number[],
  topK = env.MEMORY_TOP_K
): Promise<MemoryHit[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`

  const rows = await prisma.$queryRaw<MemoryHit[]>`
    SELECT
      id,
      content,
      kind::text AS kind,
      (embedding <=> ${vectorStr}::vector) AS distance
    FROM "MemoryChunk"
    WHERE "sessionId" = ${sessionId}
      AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
    ORDER BY distance ASC
    LIMIT ${topK}
  `

  return rows
}
