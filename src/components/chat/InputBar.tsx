'use client'

import { type FormEvent, useRef, useEffect } from 'react'

interface InputBarProps {
  input: string
  isLoading: boolean
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}

export function InputBar({ input, isLoading, onInputChange, onSubmit }: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  // Restore focus when the AI finishes responding
  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus()
    }
  }, [isLoading])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim()) {
        e.currentTarget.form?.requestSubmit()
      }
    }
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
      <form
        onSubmit={onSubmit}
        className="max-w-2xl mx-auto flex items-end gap-3 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-zinc-600 transition-colors"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message Jarvis
        </label>
        <textarea
          ref={textareaRef}
          id="chat-input"
          value={input}
          onChange={onInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Message Jarvis…"
          disabled={isLoading}
          rows={1}
          className="flex-1 bg-transparent text-zinc-100 text-sm placeholder-zinc-600 resize-none outline-none leading-relaxed disabled:opacity-50 min-h-[24px]"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Send"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 12V2M7 2L2 7M7 2L12 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>
      <p className="text-center text-xs text-zinc-700 mt-2">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
