import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { AgentInput } from './types'
import { buildSystemPrompt } from './prompts/system'

// Phase 1 mock: direct streamText with no memory, tools, or safety checks.
// Phase 2 will inject memory context into the system prompt.
// Phase 3 will add the tool-calling loop for RESEARCH mode.
// Phase 5 will wrap with safety pre/post checks.

export function runJarvis({ mode, messages, onFinish }: AgentInput) {
  const system = buildSystemPrompt(mode)

  return streamText({
    model: openai('gpt-4o'),
    system,
    // SimpleMessage is structurally compatible with ModelMessage for text-only content
    messages: messages as NonNullable<Parameters<typeof streamText>[0]['messages']>,
    onFinish: onFinish
      ? async (event) => {
          await onFinish({ text: event.text })
        }
      : undefined,
  })
}
