export const MODES = ['CHAT', 'REFLECTION', 'RESEARCH', 'VOICE', 'VIDEO'] as const
export type Mode = (typeof MODES)[number]

export const PHASE_1_MODES = ['CHAT', 'REFLECTION', 'RESEARCH'] as const satisfies readonly Mode[]

export const MODE_LABELS: Record<Mode, string> = {
  CHAT: 'Chat',
  REFLECTION: 'Reflect',
  RESEARCH: 'Research',
  VOICE: 'Voice',
  VIDEO: 'Video',
}

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  CHAT: 'Conversational assistant',
  REFLECTION: 'Thought exploration and self-awareness',
  RESEARCH: 'Deep research with sourcing',
  VOICE: 'Voice-first interaction',
  VIDEO: 'Video + body-language context',
}

export const MODE_COLORS: Record<Mode, string> = {
  CHAT: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  REFLECTION: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  RESEARCH: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  VOICE: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  VIDEO: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
}

export const MODE_DOT_COLORS: Record<Mode, string> = {
  CHAT: 'bg-blue-400',
  REFLECTION: 'bg-violet-400',
  RESEARCH: 'bg-emerald-400',
  VOICE: 'bg-orange-400',
  VIDEO: 'bg-rose-400',
}
