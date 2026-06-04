import { env } from '@/lib/env'

export type OpenClawInput = Record<string, unknown>
export type OpenClawOutput = Record<string, unknown>

export interface OpenClawClient {
  invoke(tool: string, input: OpenClawInput): Promise<OpenClawOutput>
  dryRun(tool: string, input: OpenClawInput): Promise<OpenClawOutput>
}

class HttpOpenClawClient implements OpenClawClient {
  constructor(
    private readonly base: string,
    private readonly key: string | undefined
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.key) h['Authorization'] = `Bearer ${this.key}`
    return h
  }

  async invoke(tool: string, input: OpenClawInput): Promise<OpenClawOutput> {
    const res = await fetch(`${this.base}/tools/invoke`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ tool, input, dryRun: false }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`OpenClaw invoke failed: HTTP ${res.status}`)
    return res.json() as Promise<OpenClawOutput>
  }

  async dryRun(tool: string, input: OpenClawInput): Promise<OpenClawOutput> {
    const res = await fetch(`${this.base}/tools/invoke`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ tool, input, dryRun: true }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`OpenClaw dry-run failed: HTTP ${res.status}`)
    return res.json() as Promise<OpenClawOutput>
  }
}

// Returned when OPENCLAW_ENABLED=false — safe to use in tests and dev.
class StubOpenClawClient implements OpenClawClient {
  async invoke(tool: string, input: OpenClawInput): Promise<OpenClawOutput> {
    return { stub: true, tool, input, note: 'OPENCLAW_ENABLED is false' }
  }
  async dryRun(tool: string, input: OpenClawInput): Promise<OpenClawOutput> {
    return { stub: true, tool, input, dryRun: true, note: 'OPENCLAW_ENABLED is false' }
  }
}

export function createOpenClawClient(): OpenClawClient {
  if (!env.OPENCLAW_ENABLED) return new StubOpenClawClient()
  return new HttpOpenClawClient(env.OPENCLAW_GATEWAY_URL, env.OPENCLAW_API_KEY)
}
