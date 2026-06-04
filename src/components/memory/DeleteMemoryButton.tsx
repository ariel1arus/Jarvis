'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface DeleteMemoryButtonProps {
  id: string
}

export function DeleteMemoryButton({ id }: DeleteMemoryButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDelete() {
    setPending(true)
    try {
      await fetch(`/api/memory/${id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40 px-2 py-1 rounded hover:bg-zinc-800"
      aria-label="Delete memory chunk"
    >
      {pending ? 'Deleting...' : 'Delete'}
    </button>
  )
}
