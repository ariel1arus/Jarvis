import { listSessions } from '@/chat/history'
import { SessionSidebar } from '@/components/chat/SessionSidebar'
import type { SessionSummary } from '@/chat/types'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const sessions = (await listSessions()) as SessionSummary[]

  return (
    <div className="flex h-full">
      <SessionSidebar sessions={sessions} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
    </div>
  )
}
