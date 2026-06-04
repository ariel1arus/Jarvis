import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { env } from '@/lib/env'
import { toolsForPrompt } from './tools/registry'

const PlanStepSchema = z.object({
  toolName: z.string().describe('Exact tool name from the available list'),
  input: z.record(z.string(), z.unknown()).describe('Tool input matching the tool schema'),
  reasoning: z.string().describe('Why this step is needed'),
})

const PlanSchema = z.object({
  summary: z.string().describe('One-sentence summary of what the plan will do'),
  steps: z.array(PlanStepSchema).max(10),
})

export type PlanStep = z.infer<typeof PlanStepSchema>
export type Plan = z.infer<typeof PlanSchema>

const SYSTEM = `You are a planning agent for a private local AI assistant called Jarvis.
Your job is to decompose a user goal into a minimal ordered sequence of tool calls.

Available tools:
${toolsForPrompt()}

Rules:
- Use ONLY tools from the list above. Do not invent tool names.
- Prefer read_only tools. Only include mutation or external_side_effect steps when strictly necessary to fulfill the goal.
- Warn in the step reasoning whenever a step has side effects.
- Keep the plan as short as possible — maximum 10 steps.
- Every step must include clear reasoning explaining why it is needed.`

export async function planGoal(goal: string): Promise<Plan> {
  const { object } = await generateObject({
    model: openai(env.OPENAI_MODEL),
    schema: PlanSchema,
    system: SYSTEM,
    prompt: goal,
    maxRetries: 2,
  })
  return object
}
