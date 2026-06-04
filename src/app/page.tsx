import Link from 'next/link'
import { listSessions } from '@/chat/history'
import { ModeSelector } from '@/components/chat/ModeSelector'
import { MODE_LABELS, MODE_DOT_COLORS } from '@/lib/types'
import type { SessionSummary } from '@/chat/types'

export default async function Home() {
  const sessions = (await listSessions()) as SessionSummary[]
  const recent = sessions.slice(0, 8)

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-violet-500/20">
            J
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Jarvis</h1>
          <p className="text-sm text-zinc-500">Private · Local · Yours</p>
        </div>

        <ModeSelector />

        {recent.length > 0 && (
          <div className="w-full">
            <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-3">Recent</p>
            <div className="flex flex-col gap-1">
              {recent.map((session: SessionSummary) => (
                <Link
                  key={session.id}
                  href={`/chat/${session.id}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-900 transition-colors group"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${MODE_DOT_COLORS[session.mode]}`} />
                  <span className="flex-1 text-sm text-zinc-400 group-hover:text-zinc-200 truncate transition-colors">
                    {session.title}
                  </span>
                  <span className="text-xs text-zinc-700 shrink-0">
                    {MODE_LABELS[session.mode]}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="w-full flex justify-center">
          <Link
            href="/memory"
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Memory
          </Link>
        </div>
      </div>
    </div>
  )
}
