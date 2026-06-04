import { prisma } from '@/lib/prisma'
import type { ActionKind, AuditStatus } from '@/generated/prisma/client'

export type { ActionKind, AuditStatus }

export interface AuditEntry {
  sessionId?: string
  goal: string
  actionKind: ActionKind
  status: AuditStatus
  dryRunOutput?: unknown
  output?: unknown
  rejectedReason?: string
}

/** Insert a new audit entry. Returns the generated id. */
export async function appendAuditLog(entry: AuditEntry): Promise<string> {
  const row = await prisma.auditLog.create({
    data: {
      sessionId: entry.sessionId ?? null,
      goal: entry.goal,
      actionKind: entry.actionKind,
      status: entry.status,
      dryRunOutput: entry.dryRunOutput != null ? (entry.dryRunOutput as object) : undefined,
      output: entry.output != null ? (entry.output as object) : undefined,
      rejectedReason: entry.rejectedReason ?? null,
    },
  })
  return row.id
}

/** Update an existing audit entry (status transitions and output). */
export async function patchAuditLog(
  id: string,
  patch: {
    status?: AuditStatus
    output?: unknown
    dryRunOutput?: unknown
    rejectedReason?: string
    executedAt?: Date
  }
) {
  await prisma.auditLog.update({
    where: { id },
    data: {
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.output !== undefined && { output: patch.output as object }),
      ...(patch.dryRunOutput !== undefined && { dryRunOutput: patch.dryRunOutput as object }),
      ...(patch.rejectedReason !== undefined && { rejectedReason: patch.rejectedReason }),
      ...(patch.executedAt !== undefined && { executedAt: patch.executedAt }),
    },
  })
}

/** Fetch log entries, newest first. Optionally scoped to a session. */
export async function listAuditLogs(sessionId?: string, take = 50) {
  return prisma.auditLog.findMany({
    where: sessionId ? { sessionId } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
  })
}

/** Fetch a single entry by id. */
export async function getAuditLog(id: string) {
  return prisma.auditLog.findUnique({ where: { id } })
}
