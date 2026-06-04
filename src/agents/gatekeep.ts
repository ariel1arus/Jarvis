import { getTool, type ActionKind } from './tools/registry'
import type { PlanStep } from './planner'

export type GatekeeperVerdict =
  | { allowed: true; kind: 'read_only'; requiresApproval: false }
  | { allowed: true; kind: 'local_mutation' | 'external_side_effect'; requiresApproval: true }
  | { allowed: false; reason: string }

/**
 * Checks a single tool call against the mode gate and action-kind rules.
 *
 * Hard rules:
 * - CHAT and REFLECTION: all OpenClaw tools blocked unconditionally.
 * - Unknown tool: blocked.
 * - Mode not in tool's allowedModes: blocked.
 * - read_only: auto-approved.
 * - local_mutation: requires user approval + dry-run.
 * - external_side_effect: requires explicit user approval + dry-run; never auto-executed.
 */
export function gatekeepStep(toolName: string, mode: string): GatekeeperVerdict {
  if (mode === 'CHAT' || mode === 'REFLECTION') {
    return { allowed: false, reason: `OpenClaw tools are not available in ${mode} mode.` }
  }

  const tool = getTool(toolName)
  if (!tool) {
    return { allowed: false, reason: `Unknown tool: "${toolName}". Check the tool registry.` }
  }

  if (!(tool.allowedModes as string[]).includes(mode)) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is not available in ${mode} mode. Allowed: ${tool.allowedModes.join(', ')}.`,
    }
  }

  const kind: ActionKind = tool.kind

  if (kind === 'read_only') {
    return { allowed: true, kind: 'read_only', requiresApproval: false }
  }

  return { allowed: true, kind, requiresApproval: true }
}

export interface StepVerdict {
  step: PlanStep
  verdict: GatekeeperVerdict
}

/** Gate an entire plan. Returns verdicts in step order. */
export function gatekeepPlan(steps: PlanStep[], mode: string): StepVerdict[] {
  return steps.map((step) => ({ step, verdict: gatekeepStep(step.toolName, mode) }))
}

/** True when the plan has at least one blocked step. */
export function planHasBlockedSteps(verdicts: StepVerdict[]): boolean {
  return verdicts.some((v) => !v.verdict.allowed)
}

/** True when any step is an external side effect (highest-risk category). */
export function planHasExternalSideEffects(verdicts: StepVerdict[]): boolean {
  return verdicts.some(
    (v) => v.verdict.allowed && v.verdict.kind === 'external_side_effect'
  )
}
