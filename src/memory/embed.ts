import { embed } from 'ai'
import { openai } from '@ai-sdk/openai'
import { env } from '@/lib/env'

export async function getEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(env.OPENAI_EMBEDDING_MODEL),
    value: text,
  })
  return embedding
}
