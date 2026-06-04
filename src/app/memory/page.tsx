import { prisma } from '@/lib/prisma'
import { MemoryKind } from '@/generated/prisma/client'
import { DeleteMemoryButton } from '@/components/memory/DeleteMemoryButton'

const KIND_BADGE: Record<MemoryKind, string> = {
  short_term: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  long_term: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  episodic: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
}

const KIND_LABEL: Record<MemoryKind, string> = {
  short_term: 'short-term',
  long_term: 'long-term',
  episodic: 'episodic',
}

function relativeExpiry(expiresAt: Date | null): string {
  if (!expiresAt) return 'permanent'
  const diffMs = expiresAt.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'expired'
  if (diffDays === 0) return 'expires today'
  if (diffDays === 1) return 'expires in 1 day'
  return `expires in ${diffDays} days`
}

export default async function MemoryPage() {
  const chunks = await prisma.memoryChunk.findMany({
    select: {
      id: true,
      sessionId: true,
      messageId: true,
      kind: true,
      content: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return (
    <div className="min-h-full flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Memory</h1>
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs font-medium tabular-nums">
            {chunks.length}
          </span>
        </div>

        {/* Empty state */}
        {chunks.length === 0 && (
          <p className="text-sm text-zinc-600">No memory chunks stored yet.</p>
        )}

        {/* Memory list */}
        {chunks.length > 0 && (
          <div className="flex flex-col gap-1">
            {chunks.map((chunk) => {
              const truncated =
                chunk.content.length > 120
                  ? chunk.content.slice(0, 120) + '…'
                  : chunk.content

              const expiry = relativeExpiry(chunk.expiresAt)
              const isPermanent = !chunk.expiresAt

              return (
                <div
                  key={chunk.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl border border-zinc-800 hover:bg-zinc-900 transition-colors"
                >
                  {/* Kind badge */}
                  <span
                    className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${KIND_BADGE[chunk.kind]}`}
                  >
                    {KIND_LABEL[chunk.kind]}
                  </span>

                  {/* Main content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <p
                      className="text-sm text-zinc-300 leading-snug"
                      title={chunk.content}
                    >
                      {truncated}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-zinc-600 font-mono">
                        {chunk.sessionId.slice(0, 8)}
                      </span>
                      <span className="text-xs text-zinc-700">
                        {chunk.createdAt.toLocaleDateString()}
                      </span>
                      <span
                        className={`text-xs ${isPermanent ? 'text-zinc-600' : 'text-zinc-500'}`}
                      >
                        {expiry}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  <DeleteMemoryButton id={chunk.id} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
