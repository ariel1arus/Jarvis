# Jarvis Private AI — Agent Flow

How requests are routed to agents, how the model is invoked, and how memory and safety
wrap the call. Grounded in `src/agents/jarvis.ts`, `src/agents/types.ts`, and
`src/agents/prompts/system.ts`.

---

## 1. Current State

`runJarvis()` is a **thin `streamText` wrapper**, mode-hardcoded to `gpt-4o`, with
**no memory, no tools, and no safety checks**. It builds a system prompt with
`buildSystemPrompt(mode)` and streams. Everything below is the target architecture.

---

## 2. Message Contract (v6 invariants — CRITICAL)

```ts
type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string }

interface AgentInput {
  sessionId: string
  mode: Mode
  messages: SimpleMessage[]
  onFinish?: (args: { text: string }) => Promise<void> | void
}
```

Vercel AI SDK **v6** rules — deviating breaks the build or the stream:
- Use `streamText` from `ai` and `openai` from `@ai-sdk/openai`.
- Serialize with **`toTextStreamResponse()` only**. `toDataStreamResponse` **does not exist in v6**.
- Cast messages as `NonNullable<Parameters<typeof streamText>[0]['messages']>`.
- `onFinish` receives **`{ text }`**.
- **`toTextStreamResponse()` wire format is UNVERIFIED** — it may emit protocol tokens
  (e.g. `0:"..."`). E2E must assert the DOM contains no such tokens. (Top-5 risk.)

---

## 3. Agent Definitions (all 8)

| Agent | Mode / Phase | Tools | Persists | Notes |
|-------|--------------|-------|----------|-------|
| **Router** | FUTURE | no | no | Classifies mode from input; precedence below |
| **General Assistant** | CHAT | **no** | yes | Default conversational agent |
| **Reflection** | REFLECTION | **no** | yes | No advice/diagnosis/tools/external calls |
| **Research** | RESEARCH | **YES** | yes | **Only** mode that receives tools |
| **Planning** | FUTURE | n/a | — | Decompose goals into steps |
| **Memory** | Phase 4 | no | no | Retrieve + rank + inject into system prompt |
| **Safety** | Phase 5 (ships before Reflection prod) | no | logs | Pre/post checks + approval gates |
| **Tool** | FUTURE | executes | logs | Runs side-effecting actions behind gates |

**Tool gating is a hard structural gate:** the `tools` array is passed to `streamText`
**only when `mode === RESEARCH`**. CHAT and REFLECTION must **never** receive tools — the
tool set is structurally empty for them, not merely instructed-away.

---

## 4. Routing Logic

```
Precedence:  explicit user selection  >  Router auto-detection  >  CHAT fallback
```
- If the user explicitly picked a mode, honor it — Router never overrides.
- Router auto-detection is FUTURE (`src/agents/router.ts`).
- When nothing classifies, fall back to CHAT.

---

## 5. Message Flow

```
1. API route Zod-validates body, applies rate limit.
2. appendMessage(sessionId, 'user', content)   ◀── user message persisted BEFORE the model call
3. runJarvis(AgentInput)  →  streamText(model, system, messages[, tools if RESEARCH])
4. toTextStreamResponse()  streams tokens to the browser
5. onFinish({ text })  →  appendMessage(sessionId, 'assistant', text)   ◀── persisted IN onFinish
```

The user message is committed **before** the model call so a crash mid-stream never loses
user input. The assistant message is committed **only** on successful `onFinish`.

---

## 6. Memory Retrieval Flow (Phase 4)

```
user turn ─▶ embed query ─▶ pgvector ANN (HNSW, cosine) ─▶ rank ─▶ token-budget
                                                                       │
                                                  inject into SYSTEM PROMPT only
                                                                       │
                                                              buildSystemPrompt(mode, memory)
```
- **Memory is injected into the system prompt ONLY — never as chat messages.**
- Retrieval is **token-budgeted**; budget is enforced before injection.
- `buildSystemPrompt` needs a memory-injection parameter (it has no injection point today).

---

## 7. Safety Flow (Phase 5 — ships BEFORE Reflection goes to prod)

```
inbound content ─▶ sanitiseForModel()  ─▶ detectPII()  ─▶ redactForExternal()
                       │ strip role-override / instruction-override / boundary spoof
                       ▼
                 egress projection: { role, content } ONLY  ─▶ streamText
outbound text  ─▶ post-check (distress signals, policy) ─▶ approval gate (if tool action)
```
- Regex-first, no ML. Lives in `src/lib/safety.ts` (to create).
- The **egress projection** guarantees that session IDs, titles, timestamps, and DB
  metadata never reach the provider.
- A **safety pre-check for distress signals is required for Reflection** and must ship in
  Phase 5, *before* Reflection reaches production.

---

## 8. Reflection Mode Flow

Reflection guardrails are **split across two layers** — this distinction is load-bearing:

| Layer | Mechanism | What it provides |
|-------|-----------|------------------|
| **Prompt layer** | `system.ts` REFLECTION prompt | *Steers* behavior: questions over advice, reflect-back, explore patterns |
| **App layer** | `runJarvis` + safety lib | *Guarantees*: hard, non-bypassable constraints |

**App-layer hard guarantees (cannot be prompted away):**
- **Tool set is structurally empty** for REFLECTION (no tools ever reach `streamText`).
- **No external calls** beyond the single LLM token stream.
- **Mood extraction is opt-in only — default OFF.**
- **REFLECTION session titles default to `"Reflection — {date}"`**, never derived from
  message content (avoids leaking sensitive content into list previews).
- Behavior contract: emotional acknowledgment + questions only — **no advice, no diagnosis**.

```
REFLECTION turn ─▶ safety pre-check (distress) ─▶ streamText (NO tools, system=reflection)
                                                       └─▶ onFinish persist (mood ONLY if opted in)
```

---

## 9. Research Mode Flow

```
streamText(tools) ─▶ tool loop ─▶ synthesize ─▶ cite sources ─▶ stream
```
- **Only** mode that receives tools.
- Needs a **`maxSteps` cap** on the tool loop and a **defined citation format** (both
  currently unspecified — Phase 6).
- All read-only research tools auto-approve + log; any tool that mutates or has external
  side effects routes through the approval gate (Section 12).

---

## 10. Voice Flow (Phase 8)

```
mic ─▶ Whisper STT ─▶ AgentInput ─▶ streamText ─▶ assistant text ─▶ strip markdown ─▶ TTS ─▶ speaker
```
- The VOICE system prompt already forbids markdown; **also strip markdown programmatically
  before TTS** (belt and suspenders).
- **Streaming audio ≠ streaming text** — TTS chunking is its own concern.

---

## 11. Video Flow (Phase 9)

```
camera ─▶ frame extraction ─▶ body-signal context ─▶ inject into SYSTEM PROMPT (not messages)
                                                          │
                                                   streamText(mode=VIDEO)
```
- Body-language/affect signals go into the **system prompt**, never as chat messages.
- **Privacy caveat:** frames (or derived features) sent to a vision model **leave the
  machine** — requires an explicit consent flow (see `architecture.md` §6 and `roadmap.md` Phase 9).

---

## 12. Browser Automation Flow (Phase 7) + Approval Gates

Browser automation is reachable **only** through:

```
Planning Agent ─▶ Safety gate ─▶ Tool Agent ─▶ browser
```

**Never invokable from CHAT or REFLECTION.** Every tool action is classified and gated:

| Action class | Gate policy |
|--------------|-------------|
| Read-only (fetch page, search) | Auto-approve + log |
| Local mutation (write file, edit local data) | Explicit user confirmation + **dry-run preview** |
| External side effect (email, calendar, purchase, form submit) | **Never auto-approvable**; dry-run mandatory; **full preview**; append-only **local action log** |

The action log is local and append-only; it is the audit trail for everything the Tool
Agent does on the user's behalf.

---

## 13. Ownership Map

| Path | State |
|------|-------|
| `src/agents/jarvis.ts` | live |
| `src/agents/prompts/system.ts` | live |
| `src/agents/router.ts` | FUTURE |
| `src/memory/` | Phase 4 |
| `src/agents/tools/` | Phase 6 |
| `src/agents/safety.ts` / `src/lib/safety.ts` | Phase 5 |
| `src/voice/` | FUTURE (Phase 8) |
| `src/video/` | FUTURE (Phase 9) |

---

## Appendix A — `onFinish` persistence contract
- User message: persisted **before** the model call.
- Assistant message: persisted **inside** `onFinish` via `appendMessage`.
- `onFinish` is optional in `AgentInput`; when absent, `runJarvis` skips persistence (used by previews/tests).

## Appendix B — Cross-team fix flagged by Safety
The BASE system prompt asserts **"All conversation data stays local"**, which is **false**
once messages are sent to a provider. Change it to **"…except messages sent to your
configured LLM provider."** Owner: AI agent (`src/agents/prompts/system.ts`).
