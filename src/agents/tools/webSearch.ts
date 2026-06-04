import { tool } from 'ai'
import { z } from 'zod'
import { env } from '@/lib/env'

export type SearchResult = { title: string; url: string; snippet: string }

const UNAVAILABLE: SearchResult[] = [
  {
    title: 'Search unavailable',
    url: '',
    snippet: 'Set BRAVE_SEARCH_API_KEY in your .env file to enable web search.',
  },
]

const inputSchema = z.object({
  query: z.string().describe('The search query'),
})

type WebSearchInput = z.infer<typeof inputSchema>

/** Exported for unit-testing without going through the Tool wrapper. */
export async function executeWebSearch(query: string): Promise<SearchResult[]> {
  if (!env.BRAVE_SEARCH_API_KEY) return UNAVAILABLE

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY,
        },
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!res.ok) {
      return [{ title: 'Search failed', url: '', snippet: `HTTP ${res.status}` }]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data?.web?.results ?? []).slice(0, 5).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
    }))
  } catch {
    return [{ title: 'Search error', url: '', snippet: 'Failed to reach search API.' }]
  }
}

export const webSearchTool = tool<WebSearchInput, SearchResult[]>({
  description:
    'Search the web for current information, recent events, or facts requiring up-to-date data. Returns up to 5 results.',
  inputSchema,
  execute: (input) => executeWebSearch(input.query),
})
