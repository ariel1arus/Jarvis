import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 30

// In-memory store keyed by IP. Safe for single-process deployment.
// Intentionally not shared across processes — reset on restart is acceptable.
const store = new Map<string, { count: number; resetAt: number }>()

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/chat')) {
    return NextResponse.next()
  }

  const ip = getIp(request)
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return NextResponse.next()
  }

  entry.count += 1

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/chat',
}
