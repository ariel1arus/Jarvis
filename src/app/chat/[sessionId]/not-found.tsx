import Link from 'next/link'

export default function ChatNotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[--color-background] text-[--color-foreground] px-4">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-400"
            />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-zinc-100">Conversation not found</h2>
        <p className="text-sm text-zinc-500">
          This session may have been deleted or the link is no longer valid.
        </p>
      </div>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-medium hover:bg-zinc-700 transition-colors"
      >
        Back to home
      </Link>
    </div>
  )
}
