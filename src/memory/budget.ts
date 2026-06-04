import { env } from '@/lib/env'
import type { MemoryHit } from './retrieve'

export function applyTokenBudget(
  hits: MemoryHit[],
  budgetTokens = env.MEMORY_TOKEN_BUDGET
): MemoryHit[] {
  const kept: MemoryHit[] = []
  let used = 0

  for (const hit of hits) {
    const cost = Math.ceil(hit.content.length / 4)
    if (used + cost > budgetTokens) break
    used += cost
    kept.push(hit)
  }

  return kept
}
