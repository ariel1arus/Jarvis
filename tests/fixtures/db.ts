import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Points at the test database defined in .env.test (jarvis_test).
// DATABASE_URL is loaded by vitest's setupFiles: ['dotenv/config'].
function createTestClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = createTestClient()

/**
 * Truncates all mutable tables in the correct dependency order.
 * Messages reference ChatSession via a foreign key, so messages must be
 * deleted first, then sessions.
 *
 * Call this in beforeEach / afterEach to keep test suites isolated.
 */
export async function cleanupDb(): Promise<void> {
  await prisma.message.deleteMany()
  await prisma.chatSession.deleteMany()
}
