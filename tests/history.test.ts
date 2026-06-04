import { describe, it, expect, beforeEach } from 'vitest'
import { prisma, cleanupDb } from './fixtures/db'
import {
  createSession,
  getSession,
  listSessions,
  appendMessage,
  updateSession,
  deleteSession,
} from '@/chat/history'

beforeEach(() => cleanupDb())

describe('createSession', () => {
  it('creates with default title and given mode', async () => {
    const s = await createSession('CHAT')
    expect(s.id).toBeTruthy()
    expect(s.mode).toBe('CHAT')
    expect(s.title).toBe('New conversation')
  })

  it('accepts a custom title', async () => {
    const s = await createSession('REFLECTION', 'My journal')
    expect(s.title).toBe('My journal')
    expect(s.mode).toBe('REFLECTION')
  })
})

describe('getSession', () => {
  it('returns session with messages ordered asc', async () => {
    const s = await createSession('CHAT')
    await appendMessage(s.id, 'user', 'Hello')
    await appendMessage(s.id, 'assistant', 'Hi there')
    const found = await getSession(s.id)
    expect(found?.messages).toHaveLength(2)
    expect(found?.messages[0].role).toBe('user')
    expect(found?.messages[1].role).toBe('assistant')
  })

  it('returns null for an unknown id', async () => {
    expect(await getSession('does-not-exist')).toBeNull()
  })
})

describe('listSessions', () => {
  it('returns empty array when there are no sessions', async () => {
    expect(await listSessions()).toHaveLength(0)
  })

  it('includes last-message preview (one message per session)', async () => {
    const s = await createSession('CHAT')
    await appendMessage(s.id, 'user', 'preview text')
    await appendMessage(s.id, 'assistant', 'reply')
    const sessions = await listSessions()
    // take:1 with desc createdAt means the last message is returned
    expect(sessions[0].messages).toHaveLength(1)
    expect(sessions[0].messages[0].content).toBe('reply')
  })

  it('orders sessions by updatedAt desc', async () => {
    const s1 = await createSession('CHAT', 'First')
    const s2 = await createSession('CHAT', 'Second')
    // Bump s1 so its updatedAt is newer than s2
    await appendMessage(s1.id, 'user', 'bump')
    const sessions = await listSessions()
    expect(sessions[0].id).toBe(s1.id)
    expect(sessions[1].id).toBe(s2.id)
  })

  it('supports cursor pagination', async () => {
    const s1 = await createSession('CHAT', 'A')
    const s2 = await createSession('CHAT', 'B')
    const s3 = await createSession('CHAT', 'C')
    // Touch s3 → s2 → s1 so updatedAt order is s1 > s2 > s3
    await appendMessage(s3.id, 'user', 'x')
    await appendMessage(s2.id, 'user', 'x')
    await appendMessage(s1.id, 'user', 'x')

    const page1 = await listSessions(undefined, 2)
    expect(page1).toHaveLength(2)
    expect(page1[0].id).toBe(s1.id)
    expect(page1[1].id).toBe(s2.id)

    const page2 = await listSessions(page1[page1.length - 1].id, 2)
    expect(page2).toHaveLength(1)
    expect(page2[0].id).toBe(s3.id)
  })

  it('returns empty page when cursor points to the last item', async () => {
    const s = await createSession('CHAT')
    const page2 = await listSessions(s.id)
    expect(page2).toHaveLength(0)
  })
})

describe('appendMessage', () => {
  it('persists message and bumps session updatedAt', async () => {
    const s = await createSession('CHAT')
    const before = s.updatedAt
    await appendMessage(s.id, 'user', 'hello')
    const found = await getSession(s.id)
    expect(found?.messages).toHaveLength(1)
    expect(found?.messages[0].content).toBe('hello')
    expect(found!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe('updateSession', () => {
  it('renames the title', async () => {
    const s = await createSession('CHAT', 'Old')
    const updated = await updateSession(s.id, { title: 'New' })
    expect(updated.title).toBe('New')
  })

  it('changes the mode', async () => {
    const s = await createSession('CHAT')
    const updated = await updateSession(s.id, { mode: 'RESEARCH' })
    expect(updated.mode).toBe('RESEARCH')
  })

  it('updates title and mode together', async () => {
    const s = await createSession('CHAT', 'Old')
    const updated = await updateSession(s.id, { title: 'New', mode: 'REFLECTION' })
    expect(updated.title).toBe('New')
    expect(updated.mode).toBe('REFLECTION')
  })

  it('throws P2025 for unknown session id', async () => {
    await expect(updateSession('no-such-id', { title: 'x' })).rejects.toMatchObject({
      code: 'P2025',
    })
  })
})

describe('deleteSession', () => {
  it('removes the session and cascades messages', async () => {
    const s = await createSession('CHAT')
    await appendMessage(s.id, 'user', 'bye')
    await deleteSession(s.id)
    expect(await getSession(s.id)).toBeNull()
    // Confirm messages were cascade-deleted
    const msgCount = await prisma.message.count({ where: { sessionId: s.id } })
    expect(msgCount).toBe(0)
  })

  it('throws P2025 for unknown session id', async () => {
    await expect(deleteSession('no-such-id')).rejects.toMatchObject({
      code: 'P2025',
    })
  })
})
