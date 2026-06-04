import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { env } from '@/lib/env'

export type ActionKind = 'read_only' | 'local_mutation' | 'external_side_effect'

export type GatekeepResult =
  | { blocked: true; reason: string }
  | { blocked: false; actionKind: ActionKind; summary: string; reasoning: string }

const ClassificationSchema = z.object({
  actionKind: z.enum(['read_only', 'local_mutation', 'external_side_effect']),
  summary: z.string().describe('One sentence: what OpenClaw will do'),
  reasoning: z.string().describe('Why this classification was chosen'),
})

const SYSTEM = `Classify a user goal by the highest-risk action it would require to complete.

Categories:
- read_only: browsing, searching, reading content, taking screenshots. No data sent externally, no accounts touched.
- local_mutation: interacts with browser UI locally (clicking, typing, navigating) but does NOT submit data to external servers.
- external_side_effect: sends data externally — submitting forms, purchasing, sending messages/emails, creating/deleting accounts, uploading files, or any externally-visible change.

Be conservative: when unsure between two categories, choose the higher-risk one.`

/**
 * Classifies a goal and enforces the mode gate.
 * CHAT and REFLECTION are hard-blocked — no LLM call is made for them.
 */
export async function classifyGoal(goal: string, mode: string): Promise<GatekeepResult> {
  if (mode === 'CHAT' || mode === 'REFLECTION') {
    return { blocked: true, reason: `Action delegation is not available in ${mode} mode.` }
  }

  try {
    const { object } = await generateObject({
      model: openai(env.OPENAI_MODEL),
      schema: ClassificationSchema,
      system: SYSTEM,
      prompt: goal,
      maxRetries: 2,
    })
    return { blocked: false, ...object }
  } catch {
    // Fail safe: treat classification failures as external_side_effect (highest gate)
    return {
      blocked: false,
      actionKind: 'external_side_effect',
      summary: goal,
      reasoning: 'Classification failed — defaulting to highest-risk category.',
    }
  }
}
