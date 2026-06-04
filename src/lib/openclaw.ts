import { env } from '@/lib/env'

export interface OpenClawClient {
  /** Delegate a goal to OpenClaw's AI brain for full autonomous execution. */
  delegate(goal: string): Promise<string>
  /** Ask OpenClaw to describe what it would do without executing anything. */
  dryRun(goal: string): Promise<string>
}

type ChatMessage = { role: 'user' | 'system' | 'assistant'; content: string }

class HttpOpenClawClient implements OpenClawClient {
  constructor(
    private readonly base: string,
    private readonly key: string,
    private readonly model: string
  ) {}

  private async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.key}`,
      },
      body: JSON.stringify({ model: this.model, messages }),
      // Autonomous execution can take time — 2-minute timeout
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`OpenClaw request failed: HTTP ${res.status}`)
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content ?? ''
  }

  async delegate(goal: string): Promise<string> {
    return this.chat([{ role: 'user', content: goal }])
  }

  async dryRun(goal: string): Promise<string> {
    return this.chat([
      {
        role: 'system',
        content:
          'DRY RUN MODE: Describe in detail what steps you would take and what external interactions ' +
          'would occur. Do NOT execute any actions, submit any forms, send any data, or open any URLs.',
      },
      { role: 'user', content: goal },
    ])
  }
}

class StubOpenClawClient implements OpenClawClient {
  async delegate(goal: string): Promise<string> {
    return `[STUB] OpenClaw disabled. Would have executed: ${goal}`
  }
  async dryRun(goal: string): Promise<string> {
    return `[STUB DRY RUN] OpenClaw disabled. Would preview: ${goal}`
  }
}

export function createOpenClawClient(): OpenClawClient {
  if (!env.OPENCLAW_ENABLED) return new StubOpenClawClient()
  // Gateway auth token takes priority; fall back to OPENCLAW_API_KEY, then OPENAI_API_KEY
  const key = env.OPENCLAW_GATEWAY_TOKEN ?? env.OPENCLAW_API_KEY ?? env.OPENAI_API_KEY
  return new HttpOpenClawClient(env.OPENCLAW_GATEWAY_URL, key, env.OPENAI_MODEL)
}
