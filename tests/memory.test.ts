import { describe, it, expect, beforeEach } from 'vitest'
import { prisma, cleanupDb } from './fixtures/db'
import { createSession } from '@/chat/history'
import { applyTokenBudget } from '@/memory/budget'
import { evictExpired } from '@/memory/evict'
import type { MemoryHit } from '@/memory/retrieve'

beforeEach(() => cleanupDb())

// ---------------------------------------------------------------------------
// applyTokenBudget — pure function, no DB needed
// ---------------------------------------------------------------------------

const hit = (content: string, distance = 0): MemoryHit => ({
  id: 'x',
  content,
  kind: 'episodic',
  distance,
})

describe('applyTokenBudget', () => {
  it('returns empty array for empty input', () => {
    expect(applyTokenBudget([], 100)).toEqual([])
  })

  it('keeps all hits that fit within the budget', () => {
    // 40 chars → ceil(40/4) = 10 tokens each; budget = 25 → fits 2
    const hits = [hit('a'.repeat(40)), hit('b'.repeat(40)), hit('c'.repeat(40))]
    const result = applyTokenBudget(hits, 25)
    expect(result).toHaveLength(2)
    expect(result[0].content[0]).toBe('a')
    expect(result[1].content[0]).toBe('b')
  })

  it('stops immediately if the first hit alone exceeds the budget', () => {
    const hits = [hit('x'.repeat(400))] // 100 tokens
    expect(applyTokenBudget(hits, 99)).toHaveLength(0)
  })

  it('includes a hit that exactly fills the remaining budget', () => {
    const hits = [hit('x'.repeat(400))] // 100 tokens
    expect(applyTokenBudget(hits, 100)).toHaveLength(1)
  })

  it('accumulates cost across multiple hits', () => {
    // 3 hits × 10 tokens = 30; budget 25 → only 2 fit
    const hits = Array.from({ length: 3 }, (_, i) => hit(String(i).padEnd(40, '0')))
    expect(applyTokenBudget(hits, 25)).toHaveLength(2)
  })

  it('preserves insertion order (closest first)', () => {
    const hits = [hit('first', 0.1), hit('second', 0.5)]
    const result = applyTokenBudget(hits, 1000)
    expect(result[0].content).toBe('first')
    expect(result[1].content).toBe('second')
  })

  it('returns all hits when budget is very large', () => {
    const hits = [hit('a'), hit('b'), hit('c')]
    expect(applyTokenBudget(hits, 99999)).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// evictExpired — integration against jarvis_test (real DB, pgvector installed)
// ---------------------------------------------------------------------------

// 1536-dim zero vector — valid for pgvector but cheap to construct in tests
const ZERO_VEC = `[${Array(1536).fill(0).join(',')}]`

describe('evictExpired', () => {
  it('deletes chunks whose expiresAt is in the past', async () => {
    const session = await createSession('CHAT')
    await prisma.$executeRaw`
      INSERT INTO "MemoryChunk" (id, "sessionId", kind, content, embedding, "createdAt", "expiresAt")
      VALUES
        ('expired-1', ${session.id}, 'short_term'::"MemoryKind", 'stale memory',
         ${ZERO_VEC}::vector, NOW(), NOW() - INTERVAL '1 hour'),
        ('live-1',    ${session.id}, 'long_term'::"MemoryKind",  'live memory',
         ${ZERO_VEC}::vector, NOW(), NULL)
    `

    await evictExpired(session.id)

    const remaining = await prisma.memoryChunk.findMany({
      select: { id: true },
      where: { sessionId: session.id },
    })
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('live-1')
  })

  it('leaves non-expired chunks untouched', async () => {
    const session = await createSession('CHAT')
    await prisma.$executeRaw`
      INSERT INTO "MemoryChunk" (id, "sessionId", kind, content, embedding, "createdAt", "expiresAt")
      VALUES ('future-1', ${session.id}, 'episodic'::"MemoryKind", 'future memory',
              ${ZERO_VEC}::vector, NOW(), NOW() + INTERVAL '1 day')
    `

    await evictExpired(session.id)

    const remaining = await prisma.memoryChunk.findMany({
      select: { id: true },
      where: { sessionId: session.id },
    })
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('future-1')
  })

  it('is a no-op when the session has no memory chunks', async () => {
    const session = await createSession('CHAT')
    await expect(evictExpired(session.id)).resolves.toBeUndefined()
  })

  it('only evicts chunks for the given sessionId', async () => {
    const s1 = await createSession('CHAT')
    const s2 = await createSession('CHAT')
    await prisma.$executeRaw`
      INSERT INTO "MemoryChunk" (id, "sessionId", kind, content, embedding, "createdAt", "expiresAt")
      VALUES
        ('s1-expired', ${s1.id}, 'short_term'::"MemoryKind", 'old',
         ${ZERO_VEC}::vector, NOW(), NOW() - INTERVAL '1 hour'),
        ('s2-expired', ${s2.id}, 'short_term'::"MemoryKind", 'old',
         ${ZERO_VEC}::vector, NOW(), NOW() - INTERVAL '1 hour')
    `

    // Only evict for s1
    await evictExpired(s1.id)

    const s1Remaining = await prisma.memoryChunk.findMany({ select: { id: true }, where: { sessionId: s1.id } })
    const s2Remaining = await prisma.memoryChunk.findMany({ select: { id: true }, where: { sessionId: s2.id } })
    expect(s1Remaining).toHaveLength(0)
    expect(s2Remaining).toHaveLength(1)
  })
})
