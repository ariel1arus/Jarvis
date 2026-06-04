'use client'

import { useState, useEffect } from 'react'
import type { Mode } from '@/lib/types'

interface MoodEntry {
  mood: string
  timestamp: string
}

const MOOD_OPTIONS: { label: string; emoji: string }[] = [
  { emoji: '😔', label: 'Low' },
  { emoji: '😕', label: 'Struggling' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '🙂', label: 'Okay' },
  { emoji: '😊', label: 'Good' },
]

const STORAGE_KEY_ENABLED = 'jarvis_mood_tracking_enabled'
const STORAGE_KEY_LOG = 'jarvis_mood_log'
const MAX_ENTRIES = 30

interface MoodCheckInProps {
  mode: Mode
}

export function MoodCheckIn({ mode }: MoodCheckInProps) {
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Read persisted tracking preference after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_ENABLED)
    if (stored === 'true') {
      setTrackingEnabled(true)
    }
    setHydrated(true)
  }, [])

  if (mode !== 'REFLECTION') {
    return null
  }

  // Avoid rendering interactive controls until localStorage is read
  if (!hydrated) {
    return null
  }

  function handleToggle() {
    const next = !trackingEnabled
    setTrackingEnabled(next)
    localStorage.setItem(STORAGE_KEY_ENABLED, String(next))
    if (!next) {
      setSelectedMood(null)
    }
  }

  function handleMoodSelect(mood: string) {
    setSelectedMood(mood)

    const raw = localStorage.getItem(STORAGE_KEY_LOG)
    const log: MoodEntry[] = raw ? (JSON.parse(raw) as MoodEntry[]) : []
    const entry: MoodEntry = { mood, timestamp: new Date().toISOString() }
    const updated = [...log, entry].slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(updated))
  }

  return (
    <div className="border-t border-violet-500/10 bg-zinc-950 px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            type="button"
            role="switch"
            aria-checked={trackingEnabled}
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 ${
              trackingEnabled ? 'bg-violet-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                trackingEnabled ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-xs text-zinc-400">Track mood</span>
        </label>

        {trackingEnabled && (
          <div className="flex items-center gap-1.5" role="group" aria-label="How are you feeling?">
            {MOOD_OPTIONS.map(({ emoji, label }) => {
              const isSelected = selectedMood === label
              return (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => handleMoodSelect(label)}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                    isSelected
                      ? 'border-violet-500/40 bg-violet-500/20 text-violet-200'
                      : 'border-zinc-700 bg-transparent text-zinc-400 hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300'
                  }`}
                >
                  <span aria-hidden="true">{emoji}</span>
                  {isSelected && (
                    <span aria-hidden="true" className="text-violet-300">
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
