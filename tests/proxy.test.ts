import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Reset the module between tests to flush the in-memory rate-limit store.
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function importProxy() {
  const mod = await import('@/proxy')
  return mod.proxy
}

function makeRequest(pathname: string, ip = '1.2.3.4') {
  const req = new NextRequest(`http://localhost${pathname}`, { method: 'POST' })
  // NextRequest doesn't accept custom headers via the constructor in the test env;
  // set x-forwarded-for directly on the headers instance.
  Object.defineProperty(req, 'headers', {
    value: new Headers({ 'x-forwarded-for': ip }),
    writable: false,
  })
  return req
}

describe('proxy rate limiter', () => {
  it('passes non-chat routes through unchanged', async () => {
    const proxy = await importProxy()
    const res = proxy(makeRequest('/api/sessions'))
    expect(res.status).toBe(200)
  })

  it('allows requests within the limit', async () => {
    const proxy = await importProxy()
    for (let i = 0; i < 30; i++) {
      const res = proxy(makeRequest('/api/chat'))
      expect(res.status).toBe(200)
    }
  })

  it('returns 429 after exceeding the limit', async () => {
    const proxy = await importProxy()
    for (let i = 0; i < 30; i++) {
      proxy(makeRequest('/api/chat'))
    }
    const res = proxy(makeRequest('/api/chat'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })

  it('rate-limits per IP — different IPs have independent counters', async () => {
    const proxy = await importProxy()
    for (let i = 0; i < 30; i++) {
      proxy(makeRequest('/api/chat', '1.2.3.4'))
    }
    // IP A is at the limit; IP B should still be free
    const resA = proxy(makeRequest('/api/chat', '1.2.3.4'))
    const resB = proxy(makeRequest('/api/chat', '5.6.7.8'))
    expect(resA.status).toBe(429)
    expect(resB.status).toBe(200)
  })

  it('resets counter after the window expires', async () => {
    const proxy = await importProxy()
    for (let i = 0; i < 30; i++) {
      proxy(makeRequest('/api/chat'))
    }
    expect(proxy(makeRequest('/api/chat')).status).toBe(429)

    // Advance past the 60s window
    vi.advanceTimersByTime(61_000)

    expect(proxy(makeRequest('/api/chat')).status).toBe(200)
  })
})
