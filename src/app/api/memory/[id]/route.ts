import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await prisma.memoryChunk.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }
}
