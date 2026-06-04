import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { env } from '@/lib/env'
import type { AgentInput } from './types'
import { buildSystemPrompt } from './prompts/system'
import {
  getEmbedding,
  retrieveMemories,
  applyTokenBudget,
  evictExpired,
  storeMemory,
} from '@/memory'

// Phase 4: inject memory context into the system prompt and persist
// the assistant response as an episodic memory.
// Phase 5 will wrap with safety pre/post checks.
// Phase 6 will add the tool-calling loop for RESEARCH mode.

export async function runJarvis({ sessionId, mode, messages, onFinish }: AgentInput) {
  const lastUserMsg =
    [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // Graceful degradation: a memory failure must never break the chat.
  let memoryContext = ''
  try {
    // Fire-and-forget eviction of expired chunks.
    evictExpired(sessionId).catch(console.error)

    if (lastUserMsg) {
      const qEmbed = await getEmbedding(lastUserMsg)
      const hits = await retrieveMemories(sessionId, qEmbed)
      const budgeted = applyTokenBudget(hits)
      memoryContext = budgeted.map((h) => h.content).join('\n')
    }
  } catch (err) {
    console.error('[jarvis] memory retrieval failed, proceeding without context', err)
  }

  const system = buildSystemPrompt(mode, memoryContext || undefined)

  return streamText({
    model: openai(env.OPENAI_MODEL),
    system,
    // SimpleMessage is structurally compatible with ModelMessage for text-only content
    messages: messages as NonNullable<Parameters<typeof streamText>[0]['messages']>,
    maxRetries: 3,
    abortSignal: AbortSignal.timeout(30_000),
    onFinish: async (event) => {
      const { inputTokens, outputTokens } = event.usage
      console.log(
        `[jarvis] tokens — in: ${inputTokens ?? '?'} out: ${outputTokens ?? '?'} model: ${env.OPENAI_MODEL}`
      )

      // Persist the assistant response as an episodic memory (fire-and-forget).
      if (event.text) {
        getEmbedding(event.text)
          .then((embedding) =>
            storeMemory({
              sessionId,
              kind: 'episodic',
              content: event.text,
              embedding,
            })
          )
          .catch(console.error)
      }

      if (onFinish) {
        await onFinish({ text: event.text })
      }
    },
  })
}
