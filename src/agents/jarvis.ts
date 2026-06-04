import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { env } from '@/lib/env'
import type { AgentInput } from './types'
import { buildSystemPrompt } from './prompts/system'
import { reflectionSafetyCheck } from './safety'
import { sanitiseForModel } from '@/lib/safety'
import {
  getEmbedding,
  retrieveMemories,
  applyTokenBudget,
  evictExpired,
  storeMemory,
} from '@/memory'

// Phase 4: inject memory context into the system prompt and persist
// the assistant response as an episodic memory.
// Phase 5: safety pre-check intercepts distress before any model call in
// REFLECTION mode; user input is sanitised before it reaches the model.
// Phase 6 will add the tool-calling loop for RESEARCH mode.

/**
 * Anything `runJarvis` returns must expose `toTextStreamResponse()` so the
 * chat route can stream it uniformly. The streamText result satisfies this;
 * the safety-override path provides a minimal compatible shape.
 */
type JarvisResult = { toTextStreamResponse: () => Response }

/** Deliver a fixed override as a plain-text stream, bypassing the model. */
function overrideResponse(text: string): JarvisResult {
  return {
    toTextStreamResponse: () =>
      new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
  }
}

export async function runJarvis({
  sessionId,
  mode,
  messages,
  onFinish,
}: AgentInput): Promise<JarvisResult> {
  const lastUserMsg =
    [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // Sanitise before the message touches embeddings, safety checks, or the model.
  const safeUserMsg = sanitiseForModel(lastUserMsg)

  // Safety pre-check: in REFLECTION mode, intercept moderate/crisis distress
  // BEFORE any embedding or model call happens.
  if (mode === 'REFLECTION') {
    const safety = reflectionSafetyCheck(safeUserMsg)
    if (!safety.safe) {
      if (onFinish) {
        await onFinish({ text: safety.responseOverride })
      }
      return overrideResponse(safety.responseOverride)
    }
  }

  // Graceful degradation: a memory failure must never break the chat.
  let memoryContext = ''
  try {
    // Fire-and-forget eviction of expired chunks.
    evictExpired(sessionId).catch(console.error)

    if (safeUserMsg) {
      const qEmbed = await getEmbedding(safeUserMsg)
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
    // tools are intentionally omitted — REFLECTION and CHAT receive none;
    // Phase 6 adds tool-calling for RESEARCH mode only.
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
