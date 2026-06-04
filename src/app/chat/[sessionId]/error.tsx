'use client'

import { useEffect } from 'react'

export default function ChatError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[--color-background] text-[--color-foreground] px-4">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-rose-400"
            />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-zinc-100">Something went wrong</h2>
        <p className="text-sm text-zinc-500">
          {error.message || 'An unexpected error occurred loading this conversation.'}
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-700 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <button
        onClick={unstable_retry}
        className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-medium hover:bg-zinc-700 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
