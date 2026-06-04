/**
 * TASK-24 — Wire format verification test (Phase 1 exit criterion)
 *
 * This test answers the question:
 *   Does toTextStreamResponse() from ai v6 emit plain UTF-8 text tokens,
 *   or does it emit AI SDK data-stream protocol tokens like `0:"hello "`,
 *   `d:{...}`, `e:{...}`?
 *
 * FINDING (confirmed by reading node_modules/ai/dist/index.js):
 *
 *   toTextStreamResponse() calls createTextStreamResponse(), which pipes
 *   `this.textStream` through a TextEncoderStream and returns a Response
 *   with Content-Type: text/plain; charset=utf-8.
 *
 *   `textStream` is built from the internal base stream by a TransformStream
 *   that discards every part EXCEPT `text-delta`, and for those it enqueues
 *   only `part.text` — the raw string token.
 *
 *   Therefore the wire bytes are PLAIN UTF-8 text deltas with NO framing.
 *   Chunks do NOT match the data-stream protocol prefix pattern /^\d+:"/.
 *
 * CONTRAST — toUIMessageStreamResponse() (NOT used by this route):
 *
 *   In AI SDK v6, toUIMessageStreamResponse() emits Server-Sent Events (SSE)
 *   format: each chunk is a line starting with `data: ` followed by a JSON
 *   object, e.g.:
 *     data: {"type":"start"}
 *     data: {"type":"text-delta","id":"text-1","delta":"Hi"}
 *     data: [DONE]
 *
 *   This is NOT the numeric-prefix format (0:"…") from AI SDK v3/v4 but is
 *   still structured framing that a plain TextDecoder must not try to parse
 *   as prose.
 *
 * IMPLICATION FOR THE FRONTEND:
 *   The /api/chat route calls result.toTextStreamResponse(), so the frontend
 *   hook must read the response as a plain ReadableStream<Uint8Array> decoded
 *   as UTF-8 text. It must NOT attempt to parse data-stream or SSE framing.
 *   If it calls useChat() expecting SSE/data-stream format it will receive
 *   garbled output.
 */

import { describe, it, expect } from 'vitest'
import { streamText } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test'

// ---------------------------------------------------------------------------
// Helper: collect all chunks from a Response body stream as decoded strings.
// ---------------------------------------------------------------------------
async function collectResponseChunks(response: Response): Promise<string[]> {
  if (!response.body) {
    throw new Error('Response has no body')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value, { stream: true }))
  }

  // Flush any remaining bytes held by the streaming decoder.
  const trailing = decoder.decode()
  if (trailing.length > 0) chunks.push(trailing)

  return chunks
}

// ---------------------------------------------------------------------------
// The data-stream protocol prefix pattern (AI SDK v3/v4 style).
// In that protocol every chunk starts with a numeric code followed by a colon
// and a double-quote, e.g. `0:"hello "`, `d:{…}`, `e:{…}`.
// AI SDK v6 toUIMessageStreamResponse() uses SSE (`data: {...}`) instead.
// ---------------------------------------------------------------------------
const DATA_STREAM_PREFIX = /^\d+:"/

describe('toTextStreamResponse() wire format', () => {
  /**
   * Build a mock model that emits a known sequence of text deltas.
   * The mock uses MockLanguageModelV3 from ai/test, which is the official
   * testing utility provided by the AI SDK.
   *
   * The model stream must emit LanguageModelV3StreamPart objects.
   * text-delta parts carry { type: 'text-delta', id: string, delta: string }.
   * A finish part is required to close the stream cleanly.
   */
  function buildMockModel(tokens: string[]) {
    const streamParts = [
      // text-start signals that a new text block is beginning
      { type: 'text-start' as const, id: 'text-1' },
      // text-delta parts carry the actual token strings
      ...tokens.map((delta) => ({
        type: 'text-delta' as const,
        id: 'text-1',
        delta,
      })),
      // text-end closes the text block
      { type: 'text-end' as const, id: 'text-1' },
      // finish is required by streamText to resolve onFinish / fullStream
      {
        type: 'finish' as const,
        finishReason: 'stop' as const,
        usage: { inputTokens: 1, outputTokens: tokens.length },
      },
    ]

    return new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream(streamParts),
        rawCall: { rawPrompt: null, rawSettings: {} },
        request: { body: '' },
      }),
    })
  }

  // -------------------------------------------------------------------------
  it('emits plain UTF-8 text tokens — no data-stream framing', async () => {
    const tokens = ['Hello', ', ', 'world', '!']
    const model = buildMockModel(tokens)

    const result = streamText({
      model,
      prompt: 'Say hello',
    })

    const response = result.toTextStreamResponse()

    // Verify Content-Type header is plain text, not event-stream or json.
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )

    const chunks = await collectResponseChunks(response)

    // Every received chunk must be a raw text token, not a framed protocol chunk.
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(DATA_STREAM_PREFIX)
    }

    // The concatenated chunks must equal the original message.
    const fullText = chunks.join('')
    expect(fullText).toBe('Hello, world!')
  })

  // -------------------------------------------------------------------------
  it('does NOT emit data-stream protocol tokens (0:"…", d:{…}, e:{…})', async () => {
    const tokens = ['0:"this looks', ' like a protocol token"']
    const model = buildMockModel(tokens)

    const result = streamText({
      model,
      prompt: 'Send a string that looks like a data-stream token',
    })

    const response = result.toTextStreamResponse()
    const chunks = await collectResponseChunks(response)

    // Even though the content itself starts with `0:"`, the chunk is just the
    // raw text — it is not the SDK wrapping it in framing. The concatenated
    // text will contain that literal string.
    const fullText = chunks.join('')
    expect(fullText).toBe('0:"this looks like a protocol token"')

    // Each individual chunk must be a raw text delta, not a framed envelope.
    // The first chunk IS `0:"this looks` which superficially matches the
    // pattern, but it is simply the raw content the model returned — not SDK
    // framing. We verify this by checking the response headers instead:
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )
    // A data-stream response would have content-type text/event-stream or
    // x-experimental-stream-data; this is unambiguously plain text.
  })

  // -------------------------------------------------------------------------
  it('compared: toUIMessageStreamResponse emits SSE-framed JSON (not plain text)', async () => {
    /**
     * FINDING — AI SDK v6 toUIMessageStreamResponse() wire format:
     *
     *   Unlike AI SDK v3/v4 which used numeric-prefix framing (0:"…"),
     *   AI SDK v6 toUIMessageStreamResponse() emits Server-Sent Events with
     *   JSON payloads:
     *
     *     data: {"type":"start"}
     *     data: {"type":"start-step"}
     *     data: {"type":"text-start","id":"text-1"}
     *     data: {"type":"text-delta","id":"text-1","delta":"Hi"}
     *     data: {"type":"text-end","id":"text-1"}
     *     data: {"type":"finish-step"}
     *     data: {"type":"finish"}
     *     data: [DONE]
     *
     *   This confirms that the /api/chat route MUST use toTextStreamResponse()
     *   (which it does) so that the frontend receives plain prose, not SSE
     *   envelopes that would be displayed verbatim to the user.
     */
    const tokens = ['Hi']
    const model = buildMockModel(tokens)

    const result = streamText({
      model,
      prompt: 'Hi',
    })

    const uiResponse = result.toUIMessageStreamResponse()
    const uiChunks = await collectResponseChunks(uiResponse)
    const uiFullText = uiChunks.join('')

    // The UI stream uses SSE `data: ` line prefix — not plain prose.
    expect(uiFullText).toMatch(/^data: /)
    // It embeds the text token inside a JSON envelope, not bare.
    expect(uiFullText).toContain('"type":"text-delta"')
    expect(uiFullText).toContain('"delta":"Hi"')
    // The stream ends with the SSE sentinel.
    expect(uiFullText).toContain('data: [DONE]')

    // Contrast: toTextStreamResponse() for the same model emits plain text.
    const plainResult = streamText({ model: buildMockModel(tokens), prompt: 'Hi' })
    const plainResponse = plainResult.toTextStreamResponse()
    const plainChunks = await collectResponseChunks(plainResponse)
    const plainFullText = plainChunks.join('')

    expect(plainFullText).toBe('Hi')
    // No SSE prefix, no JSON envelope.
    expect(plainFullText).not.toMatch(/^data: /)
    expect(plainFullText).not.toContain('"type"')
  })
})
