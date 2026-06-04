'use client'

import { useState } from 'react'
import type { Mode } from '@/lib/types'

interface ReflectionDisclaimerProps {
  mode: Mode
}

export function ReflectionDisclaimer({ mode }: ReflectionDisclaimerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (mode !== 'REFLECTION' || dismissed) {
    return null
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4">
      <div className="flex items-start gap-3 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3">
        <p className="flex-1 text-xs leading-relaxed text-violet-300">
          Reflection mode is for personal exploration — not therapy. Jarvis is not a licensed
          professional. If you&apos;re in crisis, please contact a real professional or helpline.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="mt-0.5 shrink-0 text-violet-400 hover:text-violet-200 transition-colors leading-none text-base"
        >
          &times;
        </button>
      </div>
    </div>
  )
}
