'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PHASE_1_MODES, MODE_LABELS, MODE_DESCRIPTIONS, MODE_COLORS } from '@/lib/types'
import type { Mode } from '@/lib/types'

export function ModeSelector() {
  const router = useRouter()
  const [selected, setSelected] = useState<Mode>('CHAT')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startConversation() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selected }),
      })
      if (!res.ok) {
        setError(`Failed to start conversation (${res.status})`)
        setLoading(false)
        return
      }
      const session = await res.json()
      if (session?.id) {
        router.push(`/chat/${session.id}`)
      } else {
        setError('Invalid session response from server')
        setLoading(false)
      }
    } catch {
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-2">
        {PHASE_1_MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => setSelected(mode)}
            aria-pressed={selected === mode}
            className={`
              flex flex-col items-center gap-1 px-5 py-3 rounded-2xl border text-sm font-medium
              transition-all duration-150 cursor-pointer
              ${selected === mode
                ? MODE_COLORS[mode]
                : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }
            `}
          >
            <span className="font-semibold">{MODE_LABELS[mode]}</span>
            <span className="text-xs opacity-70 font-normal">{MODE_DESCRIPTIONS[mode]}</span>
          </button>
        ))}
      </div>

      <button
        onClick={startConversation}
        disabled={loading}
        className="
          px-8 py-3 bg-zinc-100 text-zinc-900 rounded-2xl font-semibold text-sm
          hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        {loading ? 'Starting…' : 'New Conversation'}
      </button>

      {error && (
        <span className="text-rose-400 text-xs">{error}</span>
      )}
    </div>
  )
}
