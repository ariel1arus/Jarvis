import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/client'
import type { Mode } from '@/lib/types'

export async function createSession(mode: Mode, title = 'New conversation') {
  return prisma.chatSession.create({
    data: { mode, title },
  })
}

export async function getSession(id: string) {
  return prisma.chatSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function listSessions() {
  return prisma.chatSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  })
}

export async function appendMessage(sessionId: string, role: Role, content: string) {
  await prisma.$transaction([
    prisma.message.create({ data: { sessionId, role, content } }),
    prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ])
}

export async function updateSessionTitle(sessionId: string, title: string) {
  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { title },
  })
}

export async function deleteSession(id: string) {
  return prisma.chatSession.delete({ where: { id } })
}
