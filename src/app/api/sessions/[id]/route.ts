import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, deleteSession, updateSession } from '@/chat/history'
import { Prisma } from '@/generated/prisma/client'

const patchSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    mode: z.enum(['CHAT', 'REFLECTION', 'RESEARCH', 'VOICE', 'VIDEO']).optional(),
  })
  .refine((d) => d.title !== undefined || d.mode !== undefined, {
    message: 'At least one of title or mode is required',
  })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(session)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const session = await updateSession(id, parsed.data)
    return Response.json(session)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }
    throw err
  }
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
