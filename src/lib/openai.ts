import OpenAI from 'openai'
import { env } from '@/lib/env'

const globalForOpenAI = globalThis as unknown as { openai: OpenAI }

export const openai =
  globalForOpenAI.openai ??
  new OpenAI({ apiKey: env.OPENAI_API_KEY })

if (process.env.NODE_ENV !== 'production') {
  globalForOpenAI.openai = openai
}
