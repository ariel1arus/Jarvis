# Jarvis Private AI — Architecture

> Jarvis is a **private, local-first AI assistant**. The application, database, and
> orchestration all run on the user's own machine (Windows host + Docker Desktop/WSL2,
> reachable over Tailscale). The **only** data that crosses the network boundary is the
> message content the user explicitly sends to their configured LLM provider.

This document is the single source of truth for how the system is wired, who owns what,
what may import what, and how we expand it. Read it before touching any cross-cutting code.

---

## 1. High-Level Overview

Jarvis is a Next.js 16 App Router application backed by PostgreSQL (via Prisma 7 with the
`pg` driver adapter) and the Vercel AI SDK v6 for model streaming. It is designed so that
a single user owns their entire conversation history, memory, and (later) voice/video
context locally, while delegating only raw token generation to a cloud LLM API — and
eventually to a fully local model.

```
                         ┌──────────────────────────────────────────────┐
                         │                Your Machine                    │
                         │                                                │
  ┌──────────┐  HTTPS    │  ┌────────────┐    ┌──────────────────────┐   │
  │ Browser  │◀─────────▶│  │ Next.js 16 │    │ PostgreSQL 17 (Docker)│   │
  │ (Tailscale)          │  │ App Router │◀──▶│  jarvis_db + pgvector  │   │
  └──────────┘           │  │            │    └──────────────────────┘   │
                         │  │  API Layer │                                │
                         │  │  Agent     │    ┌──────────────────────┐   │
                         │  │  Layer     │───▶│  Memory / Safety libs │   │
                         │  └─────┬──────┘    └──────────────────────┘   │
                         │        │                                       │
                         └────────┼───────────────────────────────────────┘
                                  │  role + content ONLY
                                  ▼
                         ┌──────────────────┐
                         │ LLM Provider API │  (OpenAI now; local model later)
                         └──────────────────┘
```

**Local-first invariants:**
- No PII, session IDs, titles, timestamps, or DB metadata are ever sent off-machine.
- The database is never exposed to the public internet; access is via localhost or Tailscale.
- Cloud egress is a single, auditable function call away from being replaced with a local model.

---

## 2. Component Responsibilities

| Layer | Location | Responsibility | May NOT do |
|-------|----------|----------------|-----------|
| **Frontend** | `src/app/`, `src/components/`, `src/hooks/` | Render UI, manage client state, stream tokens into the DOM, mode selection | Import Prisma, read env secrets, call the LLM directly |
| **API** | `src/app/api/` | HTTP boundary, request validation (Zod), auth/rate-limit hookpoints, persistence orchestration, response streaming | Contain business logic that belongs in agents; hold prompt text |
| **AI Agent** | `src/agents/` | Build system prompts, dispatch by mode, run `streamText`, gate tools, persist assistant output via `onFinish` | Talk to the DB directly except through `src/chat/history.ts`; bypass the safety layer |
| **Memory** | `src/memory/` (Phase 4+) | Embed, store, retrieve, rank, and token-budget memory chunks; produce injection text | Inject memory as chat messages (system prompt only) |
| **Safety** | `src/lib/safety.ts`, `src/middleware.ts` (to create) | Egress projection, PII detection/redaction, prompt-injection stripping, rate limiting, approval gating | Be optional or bypassable for any external side effect |
| **Persistence** | `src/chat/history.ts`, `src/lib/prisma.ts` | All DB reads/writes; Prisma singleton with driver adapter | Be imported from `src/components/` or `src/app/(client)` |
| **Infrastructure** | `docker-compose.yml`, `prisma/`, `src/lib/env.ts` | Postgres + pgvector, migrations, validated env contract | — |

---

## 3. Folder Structure

### Current (live)
```
src/
  app/
    api/
      chat/route.ts            # POST: stream a model response, persist on finish
      sessions/route.ts        # GET list / POST create
      sessions/[id]/route.ts   # GET one / DELETE  (PATCH missing — Phase 2)
    chat/                      # chat UI route
    layout.tsx  page.tsx  globals.css
  agents/
    jarvis.ts                  # runJarvis() — thin streamText wrapper (Phase 1)
    types.ts                   # AgentInput, SimpleMessage
    prompts/system.ts          # buildSystemPrompt(mode)
  chat/
    history.ts                 # createSession/getSession/listSessions/appendMessage/...
    types.ts                   # SessionWithMessages, SessionSummary
  components/                  # UI (owned by frontend agent)
  hooks/                       # client hooks
  lib/
    env.ts                     # zod-validated env (ARCHITECT-owned)
    types.ts                   # Mode, MODE_LABELS/COLORS/... (ARCHITECT-owned)
    prisma.ts                  # Prisma singleton + pg adapter
    openai.ts                  # DEAD CODE — remove in Phase 3
  generated/prisma/            # generated client — import from @/generated/prisma/client
prisma/schema.prisma           # models + enums (ARCHITECT-owned)
docker-compose.yml             # postgres:17
```

### Planned (by phase)
```
src/agents/router.ts           # Phase 1.5+  mode auto-detection
src/memory/                    # Phase 4     embed/retrieve/rank/inject
src/agents/tools/              # Phase 6     research tools + registry
src/agents/safety.ts           # ships Phase 5 (BEFORE Reflection prod)
src/lib/safety.ts              # Phase 5     sanitise/detectPII/redactForExternal
src/middleware.ts              # Phase 3/5   token-bucket rate limiting
src/voice/                     # Phase 8     STT/TTS/VAD
src/video/                     # Phase 9     frame extraction + consent
```

---

## 4. Service Boundaries (Import Rules)

These are **hard rules**, to be enforced by an ESLint `no-restricted-imports` rule.

```
ALLOWED IMPORT DIRECTION (top may import bottom, never the reverse):

  src/app/(client) , src/components/ , src/hooks/
        │  may import: src/lib/types, src/agents/types (types only)
        ▼
  src/app/api/            ── may import: src/agents, src/chat, src/lib, src/memory, src/lib/safety
        ▼
  src/agents/             ── may import: src/chat/history, src/memory, src/lib/safety, src/lib/env, src/lib/types
        ▼
  src/chat/history.ts , src/memory/   ── may import: src/lib/prisma, src/lib/types
        ▼
  src/lib/prisma.ts , src/lib/env.ts  ── leaf; import nothing app-internal
```

Concrete prohibitions:
- **Components/hooks must never import `@/lib/prisma`, `@/chat/history`, or `@/lib/env`.** Type-only imports of `@/lib/types` and `@/agents/types` are fine.
- **Agents must not call Prisma directly** — only via `src/chat/history.ts` (and `src/memory/` in Phase 4+).
- **The generated client is imported from `@/generated/prisma/client`, never `@prisma/client`.**
- **Secrets are read only in `src/lib/env.ts` / `src/lib/prisma.ts` / server-only agent code.** Never `NEXT_PUBLIC_*` a secret.

---

## 5. Security Model

### 5.1 Egress boundary
Today the privacy boundary is enforced **by convention only** — `runJarvis` passes whatever
`messages` it receives to `streamText`. Harden it:
- Add an **egress projection function** that reduces any internal message object to `{ role, content }` and nothing else before it reaches `streamText`.
- Add a `no-restricted-imports` lint rule preventing client code from importing server-side modules.
- Add a **boundary unit test** asserting that session IDs, titles, timestamps, and DB metadata never appear in the payload handed to the SDK.

### 5.2 `src/lib/safety.ts` (to create — Phase 5)
Regex-first, no ML:
- `sanitiseForModel(content): { text, flags }` — strip role-override attempts, instruction-override markers, prompt-boundary spoofing.
- `detectPII(content): PiiMatch[]`
- `redactForExternal(content): string`

### 5.3 Rate limiting — `src/middleware.ts` (to create)
In-memory **token bucket**, **Node.js runtime** (not Edge), keyed by client IP:

| Route | Capacity | Refill |
|-------|----------|--------|
| `/api/chat` | 20 | 1 / 3s |
| `/api/sessions*` | 60 | 1 / 1s |

### 5.4 Secret management
- `.env.local` is gitignored; **add `.env.example`** with placeholders.
- **The live OpenAI key currently in `.env.local` must be treated as compromised and rotated.**
- **The Postgres password is `1234` in `docker-compose.yml` — change it** and bind Postgres to localhost/Tailscale only.
- Add a **pre-commit secret scanner**. Never `NEXT_PUBLIC_*` a secret.

### 5.5 Telemetry opt-out
- Set `NEXT_TELEMETRY_DISABLED=1` in `.env`.
- Set `poweredByHeader: false` (and the telemetry/header fields) in `next.config.ts` — confirm exact field names against `node_modules/next/dist/docs/` first.

### 5.6 Approval gates for tools (Phase 6/7)
| Action class | Policy |
|--------------|--------|
| Read-only | Auto-approve + log |
| Local mutation | Explicit confirmation + dry-run preview |
| External side effect (email, calendar, purchase) | **Never auto-approvable**; dry-run mandatory; full preview; append-only local action log |

---

## 6. Privacy Guarantee

> **"Everything runs on your machine. The only data that ever leaves is the message
> content you send to the LLM provider you configured — nothing else."**

This is the accurate, defensible claim. Note the following:

- **The system prompt currently claims "All conversation data stays local" — this is FALSE** and must be corrected to "…except messages sent to your configured LLM provider." (See `database.md` is not the owner; this is `src/agents/prompts/system.ts`, owned by the AI agent — flagged here for cross-team action.)
- **Caveat — Video (Phase 9):** frame-derived context that is sent to a vision model *does* leave the machine. This contradicts the unqualified "Private · Local · Yours" tagline and requires an explicit consent flow and a documented privacy model before shipping.
- Until a local model is wired (Phase 10), "local" applies to storage and orchestration, not to token generation.

---

## 7. Future Expansion Strategy

- **Local models (Phase 10):** the egress projection point is the single seam. Swap `@ai-sdk/openai` for a local provider behind the same `runJarvis` contract; no caller changes.
- **Multi-agent (Phase 1.5–7):** a Router classifies mode; specialized agents (Reflection, Research, Planning, Memory, Safety, Tool) are dispatched behind a stable `AgentInput` contract.
- **Voice (Phase 8):** Whisper STT → `AgentInput` → `streamText` → TTS, with markdown stripped before synthesis.
- **Video (Phase 9):** frame extraction → body-signal context injected into the **system prompt**, never as messages; gated by consent.
- **Browser automation (Phase 7):** only via Planning → Safety gate → Tool Agent; **never** from CHAT or REFLECTION.

---

## 8. Request & Dispatch Diagrams

### Chat request flow
```
Browser ──POST /api/chat {sessionId, mode, messages}──▶ API route
                                                          │
                       1. Zod-validate body              │
                       2. rate-limit (middleware)        │
                       3. appendMessage(user) BEFORE call│──▶ Postgres
                       4. runJarvis(AgentInput)          │
                                                          ▼
                                                   streamText(model, system, messages)
                                                          │
                          toTextStreamResponse() ◀────────┘
                                  │                       │ onFinish({text})
   Browser ◀── streamed tokens ───┘                       └──▶ appendMessage(assistant) ──▶ Postgres
```

### Agent dispatch
```
                       ┌──────────────────────────────┐
   mode (explicit) ───▶│   Routing precedence:        │
                       │   explicit > Router > CHAT    │
                       └───────────────┬──────────────┘
                                       ▼
        ┌──────────┬──────────────┬───────────────┬──────────────┐
        ▼          ▼              ▼               ▼              ▼
      CHAT     REFLECTION      RESEARCH         VOICE          VIDEO
   (general)  (no tools,    (tools ONLY      (STT→text     (frames→system
              no advice)    in this mode)     →TTS)         prompt context)
        │          │              │
        └──────────┴──────────────┴── system prompt (+ memory injection, Phase 4)
                                   └── tools[] passed to streamText ONLY when RESEARCH
```

See `agent-flow.md` for the full agent definitions and `roadmap.md` for phased delivery.

---

## 9. Testing Architecture

- **Unit:** `buildSystemPrompt`, Zod schemas, auto-title pure function, env validation, egress projection, safety regexes.
- **Integration:** every `src/chat/history.ts` function against the **real `jarvis_test` DB** (separate port); API routes with OpenAI mocked via **MSW**. **Never mock the DB** (`vi.mock` for the DB is banned).
- **E2E (Playwright):** full session lifecycle (create → chat → persist → reload → delete); streaming correctness (assert **no protocol tokens** like `0:"` appear in the DOM); error states.
- **CI gate:** `lint` + `tsc --noEmit` + `vitest` unit + `vitest` integration against a real Postgres service. **No PR merges with a failing type-check.**
- **`jarvis_test` is not yet in `docker-compose.yml`** — add it (Phase 2). Tests use `prisma migrate deploy`, not `migrate dev`.
