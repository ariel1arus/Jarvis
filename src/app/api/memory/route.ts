import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') ?? undefined

  const chunks = await prisma.memoryChunk.findMany({
    select: {
      id: true,
      sessionId: true,
      messageId: true,
      kind: true,
      content: true,
      createdAt: true,
      expiresAt: true,
    },
    where: sessionId ? { sessionId } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return Response.json(chunks)
}
