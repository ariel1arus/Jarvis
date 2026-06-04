import { prisma } from '@/lib/prisma'

export async function evictExpired(sessionId: string): Promise<void> {
  await prisma.memoryChunk.deleteMany({
    where: {
      sessionId,
      expiresAt: { lt: new Date() },
    },
  })
}
