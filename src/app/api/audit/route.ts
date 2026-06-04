import { type NextRequest } from 'next/server'
import { listAuditLogs } from '@/chat/audit'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const sessionId = searchParams.get('sessionId') ?? undefined
  const take = Math.min(parseInt(searchParams.get('take') ?? '50', 10), 200)

  const logs = await listAuditLogs(sessionId, take)
  return Response.json({ logs })
}
