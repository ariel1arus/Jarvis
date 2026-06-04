import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { env } from '@/lib/env'
import type { AgentInput } from './types'
import { buildSystemPrompt } from './prompts/system'

// Phase 1: direct streamText with no memory, tools, or safety checks.
// Phase 4 will inject memory context into the system prompt.
// Phase 5 will wrap with safety pre/post checks.
// Phase 6 will add the tool-calling loop for RESEARCH mode.

export function runJarvis({ mode, messages, onFinish }: AgentInput) {
  const system = buildSystemPrompt(mode)

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
      if (onFinish) {
        await onFinish({ text: event.text })
      }
    },
  })
}
