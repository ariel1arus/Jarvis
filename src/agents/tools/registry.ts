import { z } from 'zod'

export type ActionKind = 'read_only' | 'local_mutation' | 'external_side_effect'

// Modes that may EVER trigger OpenClaw tools.
// CHAT and REFLECTION must never appear here — this is enforced at type level.
export type AllowedMode = 'RESEARCH'

export interface RegistryTool {
  name: string
  description: string
  kind: ActionKind
  allowedModes: ReadonlyArray<AllowedMode>
  inputSchema: z.ZodTypeAny
  browserProfile?: string
}

export const TOOL_REGISTRY: Record<string, RegistryTool> = {
  'browser.navigate': {
    name: 'browser.navigate',
    description: 'Open a URL in the OpenClaw browser and return page text',
    kind: 'read_only',
    allowedModes: ['RESEARCH'],
    inputSchema: z.object({ url: z.string().url() }),
    browserProfile: 'openclaw',
  },
  'browser.snapshot': {
    name: 'browser.snapshot',
    description: 'Take a screenshot of the current browser page',
    kind: 'read_only',
    allowedModes: ['RESEARCH'],
    inputSchema: z.object({ profile: z.string().default('openclaw') }),
    browserProfile: 'openclaw',
  },
  'browser.read': {
    name: 'browser.read',
    description: 'Read the full text content of the current browser page',
    kind: 'read_only',
    allowedModes: ['RESEARCH'],
    inputSchema: z.object({ profile: z.string().default('openclaw') }),
    browserProfile: 'openclaw',
  },
  'browser.click': {
    name: 'browser.click',
    description: 'Click an element on the current page (local interaction only)',
    kind: 'local_mutation',
    allowedModes: ['RESEARCH'],
    inputSchema: z.object({
      selector: z.string(),
      profile: z.string().default('openclaw'),
    }),
    browserProfile: 'openclaw',
  },
  'browser.type': {
    name: 'browser.type',
    description: 'Type text into a field on the current page',
    kind: 'local_mutation',
    allowedModes: ['RESEARCH'],
    inputSchema: z.object({
      selector: z.string(),
      text: z.string(),
      profile: z.string().default('openclaw'),
    }),
    browserProfile: 'openclaw',
  },
  'browser.submit': {
    name: 'browser.submit',
    description: 'Submit a form — sends data to an external server',
    kind: 'external_side_effect',
    allowedModes: ['RESEARCH'],
    inputSchema: z.object({
      selector: z.string(),
      profile: z.string().default('openclaw'),
    }),
    browserProfile: 'openclaw',
  },
}

export function getTool(name: string): RegistryTool | undefined {
  return TOOL_REGISTRY[name]
}

/** Formatted list for use in LLM prompts. */
export function toolsForPrompt(): string {
  return Object.values(TOOL_REGISTRY)
    .map((t) => `- ${t.name} [${t.kind}]: ${t.description}`)
    .join('\n')
}
