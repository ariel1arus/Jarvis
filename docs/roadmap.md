# Jarvis Private AI — Roadmap

Ten phases from the current chat MVP to a fully personal, optionally-local Jarvis. Each
phase lists **Goal, Deliverables, Acceptance Criteria, Owner, Dependencies, Risks**.

**Owner key:** FE = Frontend · BE = Backend/Persistence · AI = AI Systems · SAFE = Safety · QA = QA · ARCH = Architect · INFRA = Infrastructure.

**Status:** Phases 1–6 shipped on `master`. Phase 7 is active.

---

## Phase 1 — UI + Chat ✓

- **Goal:** Stream a model response in a chosen mode and render it.
- **Done:** mode selector + types (`src/lib/types.ts`), `runJarvis` streaming wrapper, `buildSystemPrompt`, session history functions, chat/sessions API routes, Prisma singleton with pg adapter.
- **Missing (QA):** `toTextStreamResponse()` wire format unverified; no `loading.tsx` / `error.tsx` / `not-found.tsx`; `listSessions` uses a hard `take: 50` cap instead of cursor pagination; no ARIA roles; `Message.role` unconstrained.
- **Acceptance:** create→chat→reload renders persisted history; **no protocol tokens** (e.g. `0:"`) appear in the DOM; all three route segments (`loading/error/not-found`) exist.
- **Owner:** FE + AI · **Deps:** none · **Risks:** wire-format leak into UI; zero test infrastructure.

## Phase 2 — Persistence Hardening ✓

- **Goal:** Trustworthy schema, complete CRUD, correct error codes.
- **Deliverables:** `Role` enum + `Message.role: Role`; `@@index([sessionId])`, `@@index([updatedAt(sort: Desc)])`; **`PATCH /api/sessions/:id`** (rename/mode); `SessionSummary` type fix; cursor pagination in `listSessions`; last-message preview; `jarvis_test` service in `docker-compose.yml`.
- **Acceptance:** `deleteSession` on a missing id returns **404**, not 500; PATCH renames a session; integration tests run against real `jarvis_test`; soft-delete decision recorded.
- **Owner:** BE + ARCH (schema) + QA · **Deps:** Phase 1 · **Risks:** `Message.role` backfill before enum migration; no live-data migration plan; undecided soft-delete.

## Phase 3 — OpenAI Integration Hardening ✓

- **Goal:** Production-grade model calls.
- **Deliverables:** model config (no hardcoded `gpt-4o`); retry + timeout; token counting; **remove dead `src/lib/openai.ts`**; verify `toTextStreamResponse()` wire format; rate-limit middleware live for `/api/chat`.
- **Acceptance:** model id is configurable via env (declared in `src/lib/env.ts`); transient failures retry with backoff; per-request token usage logged; verified clean stream.
- **Owner:** AI + ARCH (env) · **Deps:** Phase 2 · **Risks:** `env.ts` **crashes the server at startup if `OPENAI_API_KEY` is missing** — document this tradeoff (fail-fast is intentional); unbounded token cost without counting.

## Phase 4 — Memory System ✓

- **Goal:** Retrieve relevant past context and inject it safely.
- **Deliverables:** `CREATE EXTENSION vector`; `MemoryChunk` model (+ `@@index([sessionId])`, `@@index([kind])`, HNSW cosine index via raw SQL); embedding strategy; `src/memory/` (embed/retrieve/rank/budget); `buildSystemPrompt` injection point; TTL/eviction policy; basic memory-management UI.
- **Acceptance:** retrieval returns ranked, token-budgeted chunks **injected into the system prompt only**; eviction removes stale chunks; user can view/delete memories.
- **Owner:** BE (schema) + AI (retrieval) + FE (UI) · **Deps:** Phase 2, 3 · **Risks:** embedding cost/leakage; no injection point today; unbounded growth without TTL.

## Phase 5 — Reflection Mode ✓

- **Goal:** Ship a safe but useful Reflection Mode for emotional support, journaling, and guided self-reflection.

- **Deliverables:**
  - `src/agents/reflection.ts`
  - `src/agents/safety.ts`
  - `src/lib/safety.ts`
  - Reflection system prompt
  - Reflection disclaimer
  - Optional mood check-in
  - Optional mood tracking setting
  - Reflection session titles: `"Reflection — {date}"`

- **Allowed behavior:**
  - Ask reflective questions
  - Help organize thoughts
  - Suggest journaling prompts
  - Suggest grounding/breathing exercises
  - Remember previous user-approved context
  - Track mood only if enabled
  - Encourage talking to a real professional when appropriate

- **Blocked behavior:**
  - No diagnosis
  - No medication advice
  - No pretending to be a licensed therapist
  - No external tools/actions in Reflection Mode
  - No confident body-language/emotion claims
  - No storing mood data unless enabled

- **Safety flow:**
  - Run lightweight safety check before every Reflection response.
  - If distress indicators appear, respond supportively and suggest real-world support.
  - Safety should guide the response, not make the mode feel robotic.

- **Acceptance:**
  - Reflection Mode has no external action tools.
  - Mood tracking is opt-in.
  - Reflection responses are warm, helpful, and non-clinical.
  - The agent does not diagnose or prescribe.
  - The user can still have natural emotional conversations.

- **Owner:** SAFE + AI
- **Deps:** Phase 3

## Phase 6 — Research Tools ✓

- **Goal:** Tool-augmented Research mode with citations.
- **Deliverables:** tool schema; web-search tool; citation format; **`maxSteps` cap** on the tool loop; safety **post-check**; tools passed to `streamText` **only when `mode === RESEARCH`**.
- **Acceptance:** Research answers cite sources in the defined format; tool loop cannot exceed `maxSteps`; CHAT/REFLECTION still receive no tools; post-check runs on synthesized output.
- **Owner:** AI + SAFE · **Deps:** Phase 5 · **Risks:** undefined tool schema/citation format; phase-numbering conflict between code comments and this roadmap.

## Phase 7 — OpenClaw Tool Use (ACTIVE)

- **Goal:** Let Jarvis perform gated real-life actions through OpenClaw, while keeping CHAT/REFLECTION modes fully safe.
- **CUDA/GPU:** Not needed — OpenClaw runs CPU-only.
- **Deliverables:**
  - OpenClaw local container (CPU-only, `docker-compose` service)
  - Tool registry pattern (`src/agents/tools/registry.ts`) — typed, auditable, mode-gated
  - Planning agent (`src/agents/planner.ts`) — decomposes requests into tool call sequences
  - Safety agent (`src/agents/gatekeep.ts`) — pre-execution review of every planned action
  - Approval gates: read-only → auto-approve + log; local mutation → confirm + dry-run preview; external side effect → never auto-approve, always dry-run + explicit user confirmation
  - Append-only audit log (Postgres table, no deletes)
  - Browser automation route — reachable **only** through Planning → Safety → OpenClaw Tool; never callable from CHAT or REFLECTION
- **Acceptance:** no external action executes without explicit confirmation; every action is in the audit log; browser automation is behind the full Planning → Safety → OpenClaw gate.
- **Owner:** AI + SAFE + BE · **Deps:** Phase 6 · **Risks:** unsafe tool permissions; missing approval gates; audit-log gaps; browser automation escape path.

## Phase 8 — Local Voice

- **Goal:** Spoken input/output with local models where possible.
- **CUDA/GPU:**
  - Piper TTS: CPU-first, no CUDA required
  - faster-whisper STT: CUDA-enabled container for GPU acceleration
  - Coqui XTTS (if added later): CUDA-enabled
  - GPU containers must be stoppable while gaming without breaking CHAT/RESEARCH modes
- **Deliverables:**
  - Local TTS service — **Piper** (CPU); upgrade path to Coqui XTTS (CUDA)
  - Local STT service — **faster-whisper** / **whisper.cpp**
  - VAD — **Silero VAD** (detects speech start/end before sending to STT)
  - Markdown stripping pipeline (strips `**`, `#`, `- `, etc. before TTS synthesis)
  - Streaming audio pipeline (audio starts before full text is finished)
- **Acceptance:** spoken input produces a valid `AgentInput`; responses are stripped of markdown before synthesis; audio streams without waiting for full response; GPU containers can be stopped independently.
- **Owner:** AI + FE + INFRA · **Deps:** Phase 3 · **Risks:** audio latency; CUDA driver issues; GPU conflict while gaming; markdown leaking into speech.

## Phase 9 — Local Video / Avatar

- **Goal:** Live-looking Jarvis avatar inspired by the crystal/holographic face reference; body-language-aware interaction.
- **CUDA/GPU:**
  - Browser avatar rendering uses normal GPU (WebGL), not CUDA
  - Wav2Lip or deep lip-sync model: CUDA-enabled only if added later
  - No raw camera frames sent to OpenAI by default
- **Deliverables:**
  - 3D avatar UI — **Three.js / React Three Fiber**, GLB/GLTF model
  - Dark premium interface with glowing eyes and idle movement
  - Audio-reactive mouth/face animation via **Web Audio API**
  - Lip-sync / viseme pipeline (Rhubarb / Wav2Lip / viseme mapping — later)
  - Explicit privacy model + consent flow: video/avatar rendering is local/browser-side; raw camera frames never leave the machine unless the user explicitly enables a vision model and consents
- **Acceptance:** avatar runs entirely locally; no cloud video egress unless the user explicitly enables it; UI clearly labels what is local vs cloud; video features off by default until consent is granted.
- **Owner:** FE + AI + SAFE · **Deps:** Phase 8 · **Risks:** overbuilding visuals before core works; FPS issues; GPU load while gaming; frames-leaving-machine must not contradict "Private · Local · Yours".

## Phase 10 — Personal Jarvis Core

- **Goal:** Durable private Jarvis system with modes, memory, and provider flexibility — no cloud lock-in.
- **CUDA/GPU:**
  - OpenAI API reasoning: no local CUDA
  - Future local LLM fallback: CUDA-enabled containers when running local models
- **Deliverables:**
  - Mode router (General, Reflection, Research, Planning/Task, OpenClaw Action)
  - Identity model (per-user profiles, preferences, stored securely)
  - Persistent memory system (export/import, TTL, per-mode isolation)
  - Provider adapter behind `runJarvis` — swap OpenAI for local LLM without changing any caller
  - Local data export format (JSON/SQLite) and backup/restore procedure
  - OpenAI cloud reasoning path (current) + documented local LLM fallback path
- **Acceptance:** Jarvis can switch modes; memories persist and survive restarts; cloud provider can be swapped without changing callers; full data export/restore works end-to-end; Jarvis runs against a local model with zero cloud egress when configured.
- **Owner:** ARCH + BE + AI · **Deps:** Phases 1–9 · **Risks:** messy memory model across modes; cloud dependency without fallback; no backup plan yet.

---

## Cross-Cutting: Testing Gates (apply per phase)

- **Unit:** `buildSystemPrompt`, Zod schemas, auto-title pure fn, env validation, egress projection, safety regexes.
- **Integration:** all `src/chat/history.ts` fns against **real `jarvis_test`**; routes with OpenAI mocked via **MSW**. **DB is never mocked (`vi.mock` for DB banned).**
- **E2E (Playwright):** session lifecycle; streaming correctness (no protocol tokens in DOM); error states.
- **CI:** `lint` + `tsc --noEmit` + `vitest` unit + `vitest` integration (real Postgres service). **No merge on failing type-check.** Add coverage per phase.

## Standing Risks (Phases 7–10)
1. **Phase 7:** OpenClaw tool escape path — browser automation must never be callable from CHAT/REFLECTION; requires registry-level mode check, not just prompt-level.
2. **Phase 7:** Audit log gaps — append-only constraint must be enforced at the DB level (no `DELETE` privilege on audit table), not just in code.
3. **Phase 8:** GPU container management — faster-whisper CUDA container must be stoppable while gaming without taking down the whole stack.
4. **Phase 9:** Avatar GPU load — Three.js rendering + live audio-reactivity may conflict with gaming GPU usage; needs a low-power / static fallback mode.
5. **Phase 10:** Provider adapter — local LLM quality/latency parity with OpenAI is not guaranteed; need a graceful degradation UX when local model is slow or unavailable.
