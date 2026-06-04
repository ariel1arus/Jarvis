import type { Mode } from '@/lib/types'

export type SimpleMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentInput {
  sessionId: string
  mode: Mode
  messages: SimpleMessage[]
  onFinish?: (args: { text: string }) => Promise<void> | void
}
