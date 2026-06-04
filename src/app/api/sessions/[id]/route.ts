import { type NextRequest } from 'next/server'
import { getSession, deleteSession } from '@/chat/history'
import { Prisma } from '@/generated/prisma/client'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(session)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteSession(id)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }
    throw err
  }
  return new Response(null, { status: 204 })
}
