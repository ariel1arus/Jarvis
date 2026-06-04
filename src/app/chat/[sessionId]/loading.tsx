export default function ChatLoading() {
  return (
    <div className="flex h-full bg-[--color-background]">
      {/* Chat area skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages area */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
          {/* Skeleton message rows */}
          <div className="flex gap-3 items-start">
            <div className="w-7 h-7 rounded-full bg-[--color-surface] shrink-0 animate-pulse" />
            <div className="flex flex-col gap-2 flex-1 max-w-lg">
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-3/4" />
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-1/2" />
            </div>
          </div>
          <div className="flex gap-3 items-start justify-end">
            <div className="flex flex-col gap-2 items-end max-w-lg">
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-56" />
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-40" />
            </div>
            <div className="w-7 h-7 rounded-full bg-[--color-surface] shrink-0 animate-pulse" />
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-7 h-7 rounded-full bg-[--color-surface] shrink-0 animate-pulse" />
            <div className="flex flex-col gap-2 flex-1 max-w-xl">
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-full" />
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-5/6" />
              <div className="h-4 rounded-lg bg-[--color-surface] animate-pulse w-2/3" />
            </div>
          </div>
        </div>

        {/* Input bar skeleton */}
        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
          <div className="max-w-2xl mx-auto h-12 rounded-2xl bg-[--color-surface] animate-pulse" />
        </div>
      </div>
    </div>
  )
}
