# Jarvis Private AI — Roadmap

Ten phases from the current chat MVP to a fully personal, optionally-local Jarvis. Each
phase lists **Goal, Deliverables, Acceptance Criteria, Owner, Dependencies, Risks**.

**Owner key:** FE = Frontend · BE = Backend/Persistence · AI = AI Systems · SAFE = Safety · QA = QA · ARCH = Architect · INFRA = Infrastructure.

> **Hard sequencing rule:** the **Safety layer (Phase 5 work) ships before Reflection
> reaches production.** Code comments currently say "safety checks (Phase 6)" — that is a
> numbering bug; safety must precede prod Reflection.

---

## Phase 1 — UI + Chat (CURRENT)

- **Goal:** Stream a model response in a chosen mode and render it.
- **Done:** mode selector + types (`src/lib/types.ts`), `runJarvis` streaming wrapper, `buildSystemPrompt`, session history functions, chat/sessions API routes, Prisma singleton with pg adapter.
- **Missing (QA):** `toTextStreamResponse()` wire format unverified; no `loading.tsx` / `error.tsx` / `not-found.tsx`; `listSessions` uses a hard `take: 50` cap instead of cursor pagination; no ARIA roles; `Message.role` unconstrained.
- **Acceptance:** create→chat→reload renders persisted history; **no protocol tokens** (e.g. `0:"`) appear in the DOM; all three route segments (`loading/error/not-found`) exist.
- **Owner:** FE + AI · **Deps:** none · **Risks:** wire-format leak into UI; zero test infrastructure.

## Phase 2 — Persistence Hardening

- **Goal:** Trustworthy schema, complete CRUD, correct error codes.
- **Deliverables:** `Role` enum + `Message.role: Role`; `@@index([sessionId])`, `@@index([updatedAt(sort: Desc)])`; **`PATCH /api/sessions/:id`** (rename/mode); `SessionSummary` type fix; cursor pagination in `listSessions`; last-message preview; `jarvis_test` service in `docker-compose.yml`.
- **Acceptance:** `deleteSession` on a missing id returns **404**, not 500; PATCH renames a session; integration tests run against real `jarvis_test`; soft-delete decision recorded.
- **Owner:** BE + ARCH (schema) + QA · **Deps:** Phase 1 · **Risks:** `Message.role` backfill before enum migration; no live-data migration plan; undecided soft-delete.

## Phase 3 — OpenAI Integration Hardening

- **Goal:** Production-grade model calls.
- **Deliverables:** model config (no hardcoded `gpt-4o`); retry + timeout; token counting; **remove dead `src/lib/openai.ts`**; verify `toTextStreamResponse()` wire format; rate-limit middleware live for `/api/chat`.
- **Acceptance:** model id is configurable via env (declared in `src/lib/env.ts`); transient failures retry with backoff; per-request token usage logged; verified clean stream.
- **Owner:** AI + ARCH (env) · **Deps:** Phase 2 · **Risks:** `env.ts` **crashes the server at startup if `OPENAI_API_KEY` is missing** — document this tradeoff (fail-fast is intentional); unbounded token cost without counting.

## Phase 4 — Memory System

- **Goal:** Retrieve relevant past context and inject it safely.
- **Deliverables:** `CREATE EXTENSION vector`; `MemoryChunk` model (+ `@@index([sessionId])`, `@@index([kind])`, HNSW cosine index via raw SQL); embedding strategy; `src/memory/` (embed/retrieve/rank/budget); `buildSystemPrompt` injection point; TTL/eviction policy; basic memory-management UI.
- **Acceptance:** retrieval returns ranked, token-budgeted chunks **injected into the system prompt only**; eviction removes stale chunks; user can view/delete memories.
- **Owner:** BE (schema) + AI (retrieval) + FE (UI) · **Deps:** Phase 2, 3 · **Risks:** embedding cost/leakage; no injection point today; unbounded growth without TTL.

## Phase 5 — Reflection Mode (Safety ships here)

- **Goal:** Ship Reflection with non-bypassable guardrails — **safety pre-check is a prerequisite, not a follow-up.**
- **Deliverables:** `src/lib/safety.ts` (`sanitiseForModel`, `detectPII`, `redactForExternal`); `src/agents/safety.ts`; egress projection + boundary unit test; rate limiting on reflection; mood extraction **opt-in, default OFF**; Reflection titles default to `"Reflection — {date}"`; system-prompt privacy claim corrected.
- **Acceptance:** REFLECTION receives **zero tools** structurally; distress-signal pre-check runs before every Reflection turn; boundary test proves only `{role, content}` egresses; mood is never recorded unless opted in.
- **Owner:** SAFE + AI · **Deps:** Phase 3 · **Risks:** prompt-layer steering mistaken for a guarantee; **"safety (Phase 6)" comment ordering bug** — safety must ship before Reflection prod.

## Phase 6 — Research Tools

- **Goal:** Tool-augmented Research mode with citations.
- **Deliverables:** tool schema; web-search tool; citation format; **`maxSteps` cap** on the tool loop; safety **post-check**; tools passed to `streamText` **only when `mode === RESEARCH`**.
- **Acceptance:** Research answers cite sources in the defined format; tool loop cannot exceed `maxSteps`; CHAT/REFLECTION still receive no tools; post-check runs on synthesized output.
- **Owner:** AI + SAFE · **Deps:** Phase 5 · **Risks:** undefined tool schema/citation format; phase-numbering conflict between code comments and this roadmap.

## Phase 7 — Agent Tool Use (Planning + Side Effects)

- **Goal:** Let Jarvis take gated actions, including browser automation.
- **Deliverables:** tool registry pattern; Planning agent; **approval gates** (read-only auto-approve+log; local mutation = confirm+dry-run; external side effect = never auto-approve, dry-run+preview); append-only **audit log**; human-in-the-loop confirmation for destructive actions.
- **Acceptance:** no external side effect executes without explicit confirmation + dry-run preview; every action is in the append-only log; browser automation reachable **only** via Planning → Safety → Tool, never from CHAT/REFLECTION.
- **Owner:** AI + SAFE · **Deps:** Phase 6 · **Risks:** missing registry pattern; destructive actions without HITL; audit-log gaps.

## Phase 8 — Voice

- **Goal:** Spoken in/out interaction.
- **Deliverables:** Whisper STT; TTS; VAD; **markdown stripping before TTS**; streaming-audio pipeline.
- **Acceptance:** spoken input transcribes into `AgentInput`; responses are markdown-free before synthesis; audio streams without waiting for full text.
- **Owner:** AI + FE · **Deps:** Phase 3 · **Risks:** STT/TTS integration unspecified; **streaming audio ≠ streaming text**; markdown leaking into speech.

## Phase 9 — Video

- **Goal:** Body-language-aware interaction.
- **Deliverables:** frame extraction; body-signal context injected into the **system prompt** (not messages); **explicit privacy model + consent flow**.
- **Acceptance:** video features are off until consent is granted; the UI states plainly that frames/features **leave the machine** when a vision model is used.
- **Owner:** AI + SAFE + FE · **Deps:** Phase 8 · **Risks:** **frames leaving the machine contradicts "Private · Local · Yours"** — must be resolved with consent + accurate claims before shipping.

## Phase 10 — Personal Jarvis

- **Goal:** A durable, portable, optionally-local personal assistant.
- **Deliverables:** user identity model; **local LLM fallback** (swap provider behind `runJarvis`, no caller changes); data export format; backup strategy.
- **Acceptance:** Jarvis runs end-to-end against a local model with no cloud egress; user can export and restore all data; documented backup/restore procedure.
- **Owner:** ARCH + BE + AI · **Deps:** Phases 1–9 · **Risks:** no identity model, export format, or backup strategy exists yet; local-model quality/latency parity.

---

## Cross-Cutting: Testing Gates (apply per phase)

- **Unit:** `buildSystemPrompt`, Zod schemas, auto-title pure fn, env validation, egress projection, safety regexes.
- **Integration:** all `src/chat/history.ts` fns against **real `jarvis_test`**; routes with OpenAI mocked via **MSW**. **DB is never mocked (`vi.mock` for DB banned).**
- **E2E (Playwright):** session lifecycle; streaming correctness (no protocol tokens in DOM); error states.
- **CI:** `lint` + `tsc --noEmit` + `vitest` unit + `vitest` integration (real Postgres service). **No merge on failing type-check.** Add coverage per phase.

## Top 5 Standing Risks
1. `toTextStreamResponse()` wire format unverified (Phase 1).
2. Zero test infrastructure today.
3. No `jarvis_test` service in `docker-compose.yml` (add Phase 2).
4. `env.ts` startup crash when secrets missing (intentional fail-fast — document it).
5. `Message.role` unconstrained until the `Role` enum lands (Phase 2).
