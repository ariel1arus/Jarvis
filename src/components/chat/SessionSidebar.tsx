'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { SessionSummary } from '@/chat/types'
import { MODE_DOT_COLORS, MODE_LABELS } from '@/lib/types'

interface SessionSidebarProps {
  sessions: SessionSummary[]
}

export function SessionSidebar({ sessions }: SessionSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    setDeletingId(id)
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    if (pathname === `/chat/${id}`) router.push('/')
    else router.refresh()
    setDeletingId(null)
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col h-full border-r border-zinc-800 bg-zinc-950">
      <div className="p-3 border-b border-zinc-800">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <span className="text-base leading-none">&#8962;</span>
          Jarvis
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <p className="px-3 py-4 text-xs text-zinc-600 text-center">No conversations yet</p>
        )}
        {sessions.map((session) => {
          const isActive = pathname === `/chat/${session.id}`
          return (
            <div
              key={session.id}
              className={`
                group relative flex items-center rounded-xl text-sm transition-colors
                ${isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}
              `}
            >
              <Link
                href={`/chat/${session.id}`}
                className="flex items-start gap-2 px-3 py-2.5 flex-1 min-w-0 pr-8"
              >
                <span className={`mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full ${MODE_DOT_COLORS[session.mode]}`} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium leading-snug">{session.title}</p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">{MODE_LABELS[session.mode]}</p>
                </div>
              </Link>
              <button
                onClick={(e) => handleDelete(e, session.id)}
                disabled={deletingId === session.id}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-50"
                aria-label="Delete conversation"
              >
                &times;
              </button>
            </div>
          )
        })}
      </div>

      <div className="p-3 border-t border-zinc-800">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors border border-dashed border-zinc-800 hover:border-zinc-700"
        >
          + New conversation
        </Link>
      </div>
    </aside>
  )
}
