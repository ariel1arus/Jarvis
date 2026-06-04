# Jarvis Private AI — Phase 1 Implementation Plan

> **Status:** Authoritative plan for Phase 1. Produced by the Architect from the five
> specialist review reports (Frontend, Backend, AI Systems, Safety, QA), cross-checked
> against live source on 2026-06-04.
>
> **Scope correction (binding):** Several items the roadmap previously parked in Phase 2/3
> (Role enum, indexes, `SessionSummary` fix, `env.ts` wiring, `jarvis_test` DB, wire-format
> verification) are **pulled into Phase 1** because Phase 1 acceptance criteria are otherwise
> unreachable or self-contradictory. Where this plan and `roadmap.md` disagree, **this plan
> wins for Phase 1**; `roadmap.md` Phase 1/2 text must be reconciled in Work Package 11.
>
> **Verification note:** Every finding below was confirmed against the actual file/line at
> the time of writing. Line numbers are current as of this plan.

---

## 1. PRE-IMPLEMENTATION BLOCKERS

These must be resolved **before** any other Phase 1 code is written. They either invalidate
acceptance criteria, leak data, or determine the shape of work that follows.

### B1 — Verify `toTextStreamResponse()` wire format (spike) — C1
- **What:** `src/agents/jarvis.ts:51` (via `route.ts:51`) returns
  `result.toTextStreamResponse()`. The client (`src/hooks/useStreamingChat.ts:78-87`) reads
  raw bytes off `res.body.getReader()` and concatenates each decoded chunk directly into the
  assistant message content. If AI SDK v6 `toTextStreamResponse()` emits framing tokens
  (`0:"..."`, `d:{...}`, etc.), they will render verbatim in the DOM.
- **Why it blocks:** The Phase 1 acceptance criterion "no protocol tokens in the DOM"
  (`roadmap.md:19`) cannot be declared met or unmet until the actual byte format is known.
  All streaming UI work and its tests depend on the answer. `roadmap.md:32` defers
  verification to Phase 3 — that contradicts the Phase 1 acceptance line and must be undone.
- **Who:** AI Systems (owns the wrapper) + QA (writes the asserting test).
- **Exact action:** Read `node_modules/ai/dist/docs/` and `node_modules/@ai-sdk/openai`
  docs for `toTextStreamResponse`. Run a one-off harness that captures raw bytes from the
  route and asserts they are plain UTF-8 text deltas with **no** `^\d+:` framing. Record the
  verdict in `docs/agent-flow.md` §2. If framing is present, the parser in
  `useStreamingChat.ts` must decode it (decision recorded before WP6 starts).
- **File/line:** `src/agents/jarvis.ts:14-24`, `src/app/api/chat/route.ts:51`,
  `src/hooks/useStreamingChat.ts:75-87`.

### B2 — Classify the false "stays local" privacy claim — C2
- **What:** `src/agents/prompts/system.ts:5` ships the literal string
  `'All conversation data stays local.'` inside `BASE`, which is prepended to **every** mode
  prompt. This is false: OpenAI receives all message content via `streamText`.
- **Why it blocks:** It is a live, user-facing false security claim. Leaving its status
  ambiguous between "fix now" and "Phase 5" is itself the defect QA refuses to accept. A
  binary decision must exist before code freeze.
- **Architect decision (binding):** **Fix the wording in Phase 1.** The corrected line is
  cheap, owned by AI Systems, and removing a false privacy claim is not a feature deferral.
  The *full safety/egress machinery* stays in Phase 5; only the prompt string changes now.
  See WP5. This **overrides** the "deferred to Phase 5" framing in `agent-flow.md` Appendix B.
- **Who:** AI Systems (owns `system.ts`).
- **File/line:** `src/agents/prompts/system.ts:3-5`.

### B3 — Decide soft-delete vs. hard-delete policy — H3 / schema
- **What:** `deleteSession` (`src/chat/history.ts:44-46`) hard-deletes and cascades. The
  `Role` enum migration (WP3) and the 404 handling (WP4) both depend on whether a `deletedAt`
  column is introduced.
- **Why it blocks:** A schema decision cannot be made twice cheaply. If soft-delete is
  wanted, it must land in the same migration as the Role enum and indexes, not after.
- **Architect decision (binding):** **Hard-delete for Phase 1.** No `deletedAt`. Cascade is
  acceptable for a single-user local app. Record this decision in `docs/database.md` §4 so
  Phase 2 does not relitigate it. This unblocks WP3 and WP4.
- **Who:** Architect (decision) + Backend (records it).
- **File/line:** `src/chat/history.ts:44-46`, `docs/database.md:104`.

### B4 — Confirm which env file hosts `DATABASE_URL` for CLI vs. runtime — M2
- **What:** `prisma.config.ts:3` does `import "dotenv/config"`, which loads `.env` (not
  `.env.local`). Next.js runtime loads `.env.local`. If `DATABASE_URL` lives only in
  `.env.local`, `prisma migrate` / `prisma generate` via the config will not see it.
- **Why it blocks:** WP3 runs a migration. If the migration tooling cannot read
  `DATABASE_URL`, the migration cannot be authored or applied.
- **Architect decision (binding):** `DATABASE_URL` must be present in **`.env`** (read by
  Prisma CLI) and the runtime app may also read it from `.env.local`. Document this split in
  `docs/database.md` §8 and `.env.example`. WP1 creates `.env.example` capturing both.
- **Who:** Infrastructure (env files) + Architect (env contract).
- **File/line:** `prisma.config.ts:3,12`.

> Blockers B1–B4 gate the start of the dependent work packages noted in each. B2 and B3 are
> fast decisions; B1 is a genuine spike; B4 is a documentation + env-file action.

---

## 2. PHASE 1 IMPLEMENTATION PLAN (ordered work packages)

Ordering respects dependencies. Complexity: S = < ½ day, M = ½–1½ days, L = > 1½ days.

---

### WP1 — Security & Infrastructure Hardening
**Owner:** Infrastructure
**Description:** Close the network/secret holes the Safety and Backend agents flagged and
disable telemetry. Establish the env-file contract.
**Depends on:** B4 decision.
**Complexity:** S

- **CREATE** `.env.example` — placeholders for `DATABASE_URL`, `OPENAI_API_KEY`,
  `NEXT_PUBLIC_APP_NAME`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED=1`. Comment noting
  `DATABASE_URL` must be in `.env` for the Prisma CLI (B4).
- **CREATE** `.env` (gitignored; the example documents it) — at minimum `DATABASE_URL` so
  the Prisma CLI works.
- **MODIFY** `docker-compose.yml` (C5):
  - Line 10 `"5432:5432"` → `"127.0.0.1:5432:5432"` (bind to loopback only;
    Tailscale reaches it via the host, not a public bind).
  - Line 7 `POSTGRES_PASSWORD: "1234"` → a strong generated password; update
    `DATABASE_URL` in `.env`/`.env.local` to match.
  - **ADD** the `jarvis_test` Postgres service here too (see WP2 for why it is Phase 1).
- **MODIFY** `next.config.ts` (architecture §5.5): set `NEXT_TELEMETRY_DISABLED=1`
  expectation in `.env`, and set `poweredByHeader: false`. Confirm exact field names against
  `node_modules/next/dist/docs/` before editing (per AGENTS.md).
- **MODIFY** `.gitignore` — confirm `.env` and `.env.local` are both ignored; ensure
  `.env.example` is **not** ignored.

---

### WP2 — Test Infrastructure Bootstrap
**Owner:** QA
**Description:** Stand up the test toolchain so every later acceptance criterion is
reachable. No product tests yet — just the harness + the `jarvis_test` DB.
**Depends on:** WP1 (needs `jarvis_test` service in compose).
**Complexity:** M

- **CREATE** `vitest.config.ts` — two projects/workspaces: `unit` (node env, no DB) and
  `integration` (loads test env, points `DATABASE_URL` at `jarvis_test`). Path alias `@/*`
  mirrored from `tsconfig.json`.
- **CREATE** `tests/setup/integration.setup.ts` — connects to `jarvis_test`, runs
  `prisma migrate deploy` (never `migrate dev`, per `database.md:189`), truncates tables
  between tests.
- **CREATE** `tests/setup/msw.ts` + `tests/setup/handlers.ts` — MSW server mocking the
  OpenAI endpoint for route tests. **DB is never mocked** (`vi.mock` for DB is banned —
  `architecture.md:242`).
- **CREATE** `tests/fixtures/sessions.ts` — factory helpers to seed `ChatSession`/`Message`
  rows in `jarvis_test`.
- **CREATE** `.env.test` (gitignored) — `DATABASE_URL` pointing at `jarvis_test`,
  `NODE_ENV=test`, dummy `OPENAI_API_KEY`.
- **MODIFY** `package.json`:
  - Add devDeps: `vitest`, `@vitejs/plugin-react`, `msw`, `@testing-library/react`,
    `@testing-library/dom`, `jsdom`, and (for E2E) `@playwright/test`.
  - Add scripts: `"test"`, `"test:unit"`, `"test:integration"`, `"test:e2e"`,
    `"typecheck": "tsc --noEmit"`.
- **CREATE** `playwright.config.ts` — single Chromium project, baseURL `http://localhost:3000`.

> **Why `jarvis_test` is Phase 1 (H13):** WP2/WP3/WP4 integration tests require a real test
> DB. It cannot be a Phase 2 deliverable if Phase 1 integration tests are an acceptance gate.

---

### WP3 — Schema Hardening & Type/Env Wiring
**Owner:** Architect (schema + env + types) → Infrastructure (migration)
**Description:** Constrain `Message.role`, add indexes, fix the `SessionSummary` type, and
make `env.ts` actually validate at startup.
**Depends on:** B3 (delete policy), WP1 (DB reachable), WP2 (migration tooling).
**Complexity:** M

- **MODIFY** `prisma/schema.prisma`:
  - **ADD** `enum Role { user assistant system tool }` (`database.md:54`). Include `tool`
    now so Phase 6 needs no enum migration.
  - Change `Message.role` from `String` to `Role` (line 31). Backfill note below.
  - **ADD** `@@index([sessionId])` on `Message` (every history read filters by it).
  - **ADD** `@@index([updatedAt(sort: Desc)])` on `ChatSession` (`listSessions` orders by it).
  - **ADD** inline comment on `ChatSession.updatedAt` (M3): note that child writes do **not**
    propagate `@updatedAt`; the bump is done manually in `appendMessage`.
- **MODIFY** `src/chat/types.ts` (H8): change
  `SessionSummary = ChatSession & { messages: Message[] }` →
  `ChatSession & { messages: [Message] | [] }` (zero-or-one preview message).
- **MODIFY** `src/lib/env.ts` — no schema change required, but ensure it is the single export
  consumed by WP1/WP5 (see H2 wiring in WP4/WP5). Already validates
  `DATABASE_URL`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_NAME`, `NODE_ENV`.
- **MODIFY** `src/lib/prisma.ts` (H2): replace `process.env.DATABASE_URL` (line 8) with
  `env.DATABASE_URL` imported from `@/lib/env`, so importing prisma triggers env validation.
- **MIGRATION (Infrastructure):** name `*_add_role_enum_and_message_indexes`. Because
  `Message.role` is live free-text, the migration must **backfill/validate** existing rows to
  one of the four enum values before the column type change, or it fails
  (`database.md:59-62`). Hard-delete decision (B3) means **no** `deletedAt` column.

> **Architect schema-change summary for Infrastructure (write the migration to match):**
> 1. `CREATE TYPE "Role" AS ENUM ('user','assistant','system','tool');`
> 2. Validate all existing `Message.role` values ∈ that set (abort if not).
> 3. `ALTER TABLE "Message" ALTER COLUMN "role" TYPE "Role" USING role::"Role";`
> 4. `CREATE INDEX ON "Message"("sessionId");`
> 5. `CREATE INDEX ON "ChatSession"("updatedAt" DESC);`
> No table drops, no column drops, no cascade-rule change. Cascade on
> `Message.sessionId` (`onDelete: Cascade`) is unchanged and correct for hard-delete.

---

### WP4 — API Route Hardening
**Owner:** Backend
**Description:** Make every route fail safely with correct status codes, a single error
shape, the MODES-derived mode enum, and the REFLECTION-title leak fix.
**Depends on:** WP3 (env wiring pattern, SessionSummary type), B3.
**Complexity:** M

- **CREATE** `src/lib/api-error.ts` (M6) — exported helper(s) producing the canonical error
  body `{ error: string, code?: string, details?: unknown }` plus typed status. Document this
  shape in `architecture.md` (WP11). All routes use it.
- **MODIFY** `src/app/api/chat/route.ts`:
  - Wrap `await req.json()` (line 18) in try/catch → 400 via `api-error` (H5).
  - Derive the Zod `mode` enum from `MODES` in `@/lib/types` instead of the hardcoded literal
    list at line 8 (H14): `z.enum(MODES)`.
  - **REFLECTION title fix (C6/H15):** at the auto-title block (lines 34-39), when
    `mode === 'REFLECTION'` set the title to `"Reflection — {YYYY-MM-DD}"`, **never** derived
    from message content. For all other modes keep the first-60-chars behavior. This makes
    code match `agent-flow.md:130-131`.
  - Keep `appendMessage(user)` **before** the model call (correct already).
- **MODIFY** `src/app/api/sessions/route.ts`:
  - Wrap `await req.json()` (line 16) in try/catch → 400 (H5).
  - Derive `mode` enum from `MODES` (H14) at line 6.
- **MODIFY** `src/app/api/sessions/[id]/route.ts`:
  - Wrap `deleteSession(id)` (line 19) in try/catch; map Prisma `P2025` → 404 via `api-error`
    (H3). Any other error → 500 with the canonical shape.
- **MODIFY** `src/chat/history.ts`:
  - **JSDoc on `appendMessage`** (M3): document the manual `updatedAt` bump and that all
    message writes MUST go through this function or sidebar ordering breaks.
  - **JSDoc on `listSessions`** (M8): note the N+1 preview pattern is acceptable at the 50
    cap; cursor pagination + last-message preview are **Phase 2** (H7 deferred — see §7).
  - **`role` param typing:** now that `Role` enum exists, type the `role` parameter against
    the enum union rather than bare `string` (line 27). Coordinate with WP3.

---

### WP5 — Agent Layer Fixes
**Owner:** AI Systems
**Description:** Correct the false privacy claim, fix the misleading phase comment, document
the `sessionId` contract, and route OpenAI through validated env.
**Depends on:** B1 verdict (informs whether the wrapper output needs changing), B2 decision.
**Complexity:** S

- **MODIFY** `src/agents/prompts/system.ts` (C2/B2): replace line 5
  `'All conversation data stays local. '` with the accurate claim, e.g.
  `'Everything runs on your machine except the message content sent to your configured LLM provider. '`
  (mirror `architecture.md:184` / `agent-flow.md` Appendix B wording).
- **MODIFY** `src/agents/jarvis.ts` (C4): replace line 9
  `// Phase 6 will wrap with safety pre/post checks` →
  `// Phase 5 will wrap with safety pre/post checks (ships before Reflection prod)`.
  Optionally add a one-line note that `sessionId` is accepted in `AgentInput` but unused in
  Phase 1 (persistence happens in the route via `onFinish`).
- **MODIFY** `src/lib/openai.ts` if it reads `process.env.OPENAI_API_KEY` directly (H2):
  route it through `@/lib/env`. **However** — this file is confirmed dead code (M1); see §7.
  Architect decision: **leave the file but make its env read go through `env.ts`** if it is
  not deleted this phase; deletion stays Phase 3 to avoid touching the live `openai` dep now.
- **VERIFY (from B1):** if the spike showed framing tokens, the fix lives either in the
  wrapper serialization choice or in the client parser (WP6) — record which in `agent-flow.md`.

---

### WP6 — Frontend Fixes (P0 a11y, error boundaries, error handling, streaming)
**Owner:** Frontend
**Description:** Fix the two P0 accessibility bugs, add the three required route segments,
make `ModeSelector` fail visibly, and align the stream reader with the B1 verdict.
**Depends on:** B1 (streaming format), WP3 (`SessionSummary` type), WP4 (error body shape).
**Complexity:** L

- **MODIFY** `src/components/chat/SessionSidebar.tsx` (H11): the delete `<button>` (lines
  60-67) is nested inside `<Link>` (invalid `<a><button>`). Restructure so the row is a
  container `<div>` with the `<Link>` and the `<button>` as **siblings**, the link filling
  the row and the delete button positioned absolutely over it (or use a non-anchor clickable
  row). Must remain keyboard-navigable.
- **MODIFY** `src/components/chat/ModeSelector.tsx`:
  - Add `aria-pressed={selected === mode}` to each mode `<button>` (lines 32-47) (H12).
  - Error handling (H4): the current `catch` (lines 23-25) swallows failures and `res.json()`
    on a failed POST yields `session.id === undefined` → navigates to `/chat/undefined`.
    Add `if (!res.ok) throw`, surface a visible error message to the user, and **do not**
    navigate unless `session.id` is present.
- **MODIFY** `src/components/chat/InputBar.tsx` (H12): add a `<label htmlFor>` (visually
  hidden is fine) bound to the textarea (line 38), or an `aria-label`. Screen readers
  currently cannot label the input.
- **CREATE** `src/app/chat/[sessionId]/loading.tsx` (H10) — dark-theme skeleton.
- **CREATE** `src/app/chat/[sessionId]/error.tsx` (H10) — client error boundary, dark theme,
  retry affordance; handles DB failure on the chat page.
- **CREATE** `src/app/chat/[sessionId]/not-found.tsx` (H10) — dark-theme 404 for invalid
  `sessionId`. The page component must call `notFound()` when `getSession` returns null.
- **MODIFY** `src/hooks/useStreamingChat.ts` per **B1 verdict** (C1): if the stream is clean
  text, keep the concatenation but add a guard/assertion in dev; if framing tokens are
  present, add a parser that strips/decodes them before appending to `content` (lines 81-86).
  Document the `crypto.randomUUID()` HTTPS/localhost requirement in a comment (M7).

---

### WP7 — Documentation Corrections
**Owner:** Architect (coordination) + each owning agent for their doc section
**Description:** Resolve every doc/source contradiction the agents found.
**Depends on:** WP3–WP6 (docs must describe the corrected reality).
**Complexity:** S

- **MODIFY** `docs/database.md` (H1): the ER diagram (lines 66-88) shows `role: Role` while
  the schema block above shows `role: String`. After WP3 lands the enum, both are `Role` —
  ensure the schema block (line 31 region) and diagram agree; remove the now-stale
  "UNCONSTRAINED" comment. Record the **hard-delete** decision (B3) at line 104. Record the
  `.env` vs `.env.local` `DATABASE_URL` split (B4) in §8. Document the default `pg` pool size
  of 10 and when to change it (M4) in §8.
- **MODIFY** `docs/architecture.md`:
  - §4 import-rule clarification (H6): state explicitly that the prohibition on importing
    `@/chat/history` / `@/lib/prisma` applies to **`src/components/` and `src/hooks/` only**,
    **not** Server Component pages (`src/app/page.tsx`,
    `src/app/chat/[sessionId]/page.tsx`, layouts), which legitimately import history.
  - Document the canonical API error body shape from `src/lib/api-error.ts` (M6).
- **MODIFY** `docs/agent-flow.md`:
  - §2: record the B1 wire-format verdict (verified clean, or framing + parser strategy).
  - §8: REFLECTION title default now matches code after WP4 — confirm wording.
  - Appendix B: update to reflect that the false privacy claim was **fixed in Phase 1** (B2),
    not deferred.
- **MODIFY** `docs/roadmap.md` (WP11 reconciliation): move Role enum, indexes,
  `SessionSummary` fix, `jarvis_test` service, and wire-format verification from their old
  phases into **Phase 1**; add the auto-title behavior (H15) and the VOICE/VIDEO
  "API-routable but UI-gated" clarification (H16) to Phase 1 scope.

---

### WP8 — VOICE/VIDEO API-vs-UI Reconciliation (documentation + guard)
**Owner:** Architect + AI Systems
**Description:** Make the intentional gap between routable modes and UI-exposed modes
explicit (H16). VOICE/VIDEO are accepted by the chat Zod schema and have live prompts; they
produce real text today without STT/TTS. `PHASE_1_MODES` (`src/lib/types.ts:4`) already gates
the **UI** to CHAT/REFLECTION/RESEARCH.
**Depends on:** WP4 (MODES-derived enum), WP7.
**Complexity:** S

- **DOCUMENT** in `architecture.md` and `agent-flow.md`: VOICE/VIDEO are **API-ready but
  UI-gated** in Phase 1; the chat route deliberately accepts all five `MODES` while
  `PHASE_1_MODES` constrains the selector. No code change to widen or narrow this in Phase 1.
- **NO schema change.** Keep all five modes in the `Mode` enum and in `MODES`.

---

## 3. EXACT FILES TO CREATE

| Path | Purpose | Owner | Must contain (spec) |
|------|---------|-------|---------------------|
| `.env.example` | Documented env contract | Infra | Placeholders for `DATABASE_URL`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_NAME`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`; comment that `DATABASE_URL` must live in `.env` for the Prisma CLI (B4). |
| `.env` | Prisma CLI + runtime env (gitignored) | Infra | `DATABASE_URL` (matching new Postgres password), `NEXT_TELEMETRY_DISABLED=1`. |
| `.env.test` | Test env (gitignored) | QA | `DATABASE_URL` → `jarvis_test`, `NODE_ENV=test`, dummy `OPENAI_API_KEY`. |
| `vitest.config.ts` | Test runner config | QA | Two projects: `unit` (node) and `integration` (real `jarvis_test`); `@/*` alias; setup files wired. |
| `tests/setup/integration.setup.ts` | Integration DB lifecycle | QA | Connect to `jarvis_test`; `prisma migrate deploy`; truncate between tests; never `migrate dev`. |
| `tests/setup/msw.ts` | MSW server bootstrap | QA | `setupServer` lifecycle hooks for OpenAI mocking. |
| `tests/setup/handlers.ts` | MSW request handlers | QA | Mock OpenAI streaming endpoint returning deterministic text deltas. |
| `tests/fixtures/sessions.ts` | Seed factories | QA | `makeSession`, `makeMessage` writing real rows to `jarvis_test`. |
| `playwright.config.ts` | E2E config | QA | Chromium project, baseURL `localhost:3000`. |
| `src/lib/api-error.ts` | Canonical error body | Backend | Helper(s) producing `{ error, code?, details? }` + status; used by all routes (M6). |
| `src/app/chat/[sessionId]/loading.tsx` | Loading state | Frontend | Dark-theme skeleton for the chat page (H10). |
| `src/app/chat/[sessionId]/error.tsx` | Error boundary | Frontend | `'use client'` boundary, dark theme, retry; handles DB failure (H10). |
| `src/app/chat/[sessionId]/not-found.tsx` | 404 segment | Frontend | Dark-theme not-found for invalid `sessionId`; page calls `notFound()` on null session (H10). |

> Migration file under `prisma/migrations/*_add_role_enum_and_message_indexes/` is produced
> by the Prisma CLI during WP3 (Infrastructure), per the schema-change summary in WP3.

---

## 4. EXACT FILES TO MODIFY

| Path | Change (finding IDs) | Owner |
|------|----------------------|-------|
| `docker-compose.yml` | Bind `127.0.0.1:5432:5432` (C5); strong `POSTGRES_PASSWORD` (C5); add `jarvis_test` service (H13). | Infra |
| `next.config.ts` | `poweredByHeader: false`; telemetry disabled via env (arch §5.5). Verify field names in next docs first. | Infra |
| `.gitignore` | Ensure `.env`/`.env.local`/`.env.test` ignored; `.env.example` tracked. | Infra |
| `package.json` | Add vitest/MSW/testing-library/jsdom/playwright devDeps; `test*` + `typecheck` scripts (C3). | QA |
| `prisma/schema.prisma` | Add `Role` enum; `Message.role: Role`; `@@index([sessionId])`; `@@index([updatedAt(sort: Desc)])`; inline `updatedAt` comment (H1, M3, database.md §2). | Architect |
| `src/chat/types.ts` | `SessionSummary = ChatSession & { messages: [Message] \| [] }` (H8). | Architect |
| `src/lib/prisma.ts` | Read `env.DATABASE_URL` from `@/lib/env` instead of `process.env` (H2). | Architect |
| `src/chat/history.ts` | Type `role` param against `Role`; JSDoc `appendMessage` (M3); JSDoc `listSessions` N+1/pagination-deferred (M8/H7). | Backend |
| `src/app/api/chat/route.ts` | try/catch `req.json()` → 400 (H5); `z.enum(MODES)` (H14); REFLECTION title = `"Reflection — {date}"` (C6/H15); use `api-error`. | Backend |
| `src/app/api/sessions/route.ts` | try/catch `req.json()` → 400 (H5); `z.enum(MODES)` (H14). | Backend |
| `src/app/api/sessions/[id]/route.ts` | try/catch DELETE; `P2025` → 404 (H3); canonical error shape. | Backend |
| `src/agents/prompts/system.ts` | Replace false "stays local" claim with accurate wording (C2/B2). | AI Systems |
| `src/agents/jarvis.ts` | Phase comment `Phase 6` → `Phase 5` (C4); note `sessionId` unused in Phase 1. | AI Systems |
| `src/lib/openai.ts` | Route env read through `@/lib/env` if not deleted (H2); deletion deferred to Phase 3 (M1). | AI Systems |
| `src/hooks/useStreamingChat.ts` | Apply B1 verdict to the stream reader (C1); comment `crypto.randomUUID()` HTTPS/localhost requirement (M7). | Frontend |
| `src/components/chat/SessionSidebar.tsx` | Un-nest delete `<button>` from `<Link>` (H11). | Frontend |
| `src/components/chat/ModeSelector.tsx` | `aria-pressed` on mode buttons (H12); real error handling, no nav to `/chat/undefined` (H4). | Frontend |
| `src/components/chat/InputBar.tsx` | `<label>`/`aria-label` on textarea (H12). | Frontend |
| `docs/database.md` | ER diagram ↔ schema agree (H1); record hard-delete (B3); `.env` split (B4/M2); pool size (M4). | Backend/Architect |
| `docs/architecture.md` | Import-rule clarification for Server Component pages (H6); API error shape (M6). | Architect |
| `docs/agent-flow.md` | Wire-format verdict §2 (B1); REFLECTION title §8 (C6); Appendix B "fixed in Phase 1" (B2). | AI Systems |
| `docs/roadmap.md` | Reconcile pulled-forward items into Phase 1; add auto-title (H15) + VOICE/VIDEO gating (H16). | Architect |

---

## 5. ACCEPTANCE CRITERIA (Phase 1 complete when ALL pass)

**Functional**
- [ ] Create → chat → reload renders persisted history (`getSession` ordered `createdAt asc`).
- [ ] Streaming: assistant text appears token-by-token in the DOM during a chat turn.
- [ ] Session lifecycle: create (POST `/api/sessions`), list (GET), open, delete (DELETE),
      and the deleted session disappears from the sidebar.
- [ ] Auto-title (H15): for CHAT/RESEARCH, a new session's title becomes the first ≤60 chars
      of the first user message; this behavior is documented in `roadmap.md` Phase 1.
- [ ] Mode routing: chat route accepts all five `MODES`; UI selector exposes only
      `PHASE_1_MODES` (CHAT/REFLECTION/RESEARCH).

**Safety / Privacy**
- [ ] **No protocol/framing tokens** (e.g. `0:"`, `d:{`) appear in the DOM — verified by the
      B1 spike and asserted by an E2E test (C1).
- [ ] Postgres is **not** bound to `0.0.0.0`; `docker-compose.yml` binds `127.0.0.1:5432`
      and the password is no longer `1234` (C5).
- [ ] The system prompt no longer claims "All conversation data stays local"; the accurate
      claim is live (C2/B2).
- [ ] REFLECTION session titles are `"Reflection — {date}"`, never derived from message
      content (C6); verified by an integration test on the chat route.

**Accessibility**
- [ ] No `<button>` nested inside `<a>` in `SessionSidebar` (H11); delete is keyboard-reachable.
- [ ] Mode buttons expose `aria-pressed` reflecting selection (H12).
- [ ] The input textarea has an accessible label (H12).

**Error handling**
- [ ] `DELETE /api/sessions/:id` on a missing id returns **404** (P2025 caught), not 500 (H3).
- [ ] Any route receiving a non-JSON body returns **400** with the canonical error shape, not
      a 500 stack trace (H5/M6).
- [ ] `ModeSelector` surfaces a visible error on a failed POST and never navigates to
      `/chat/undefined` (H4).
- [ ] `src/app/chat/[sessionId]/{loading,error,not-found}.tsx` all exist and render in the
      dark theme; an invalid `sessionId` triggers `not-found` (H10).

**Infrastructure**
- [ ] Importing `@/lib/prisma` triggers `env.ts` validation; missing `DATABASE_URL`/
      `OPENAI_API_KEY` fails fast at startup (H2).
- [ ] `jarvis_test` Postgres service exists in `docker-compose.yml`; integration tests run
      against it via `prisma migrate deploy` (H13).
- [ ] `npm run typecheck` (`tsc --noEmit`), `npm run lint`, and `npm test` all pass in CI;
      no merge on a failing type-check (C3).

**Docs**
- [ ] ER diagram ↔ schema agree on `role: Role` (H1).
- [ ] Import-rule clarification distinguishes Server Component pages from components/hooks (H6).
- [ ] Auto-title behavior documented (H15); VOICE/VIDEO "API-ready, UI-gated" documented (H16).
- [ ] Wire-format verdict recorded in `agent-flow.md` §2 (B1); hard-delete decision recorded
      in `database.md` (B3); `.env` split recorded (B4/M2).

---

## 6. TEST CHECKLIST

### Unit (node env, no DB)
- **`buildSystemPrompt(mode)`** — asserts each mode returns its distinct prompt; asserts the
  BASE no longer contains "stays local" and contains the corrected claim (C2). Mock: none.
- **Chat route Zod schema** — asserts `z.enum(MODES)` rejects unknown modes and accepts all
  five; rejects missing `sessionId`. Mock: none (pure schema).
- **Auto-title pure function** — extract first-60-chars logic into a testable helper; assert
  newline collapse, trim, ≤60; assert REFLECTION branch yields `"Reflection — {date}"`
  regardless of content (C6/H15). Mock: a fixed clock for the date.
- **`api-error` helper** — asserts the canonical body shape and status mapping (M6).
- **`env.ts`** — with a stubbed `process.env`, asserts it throws on missing
  `DATABASE_URL`/`OPENAI_API_KEY` and passes with both present (H2).
- **`SessionSummary` type** — type-level test (`expectTypeOf`) that `messages` is
  `[Message] | []`, not `Message[]` (H8).

### Integration (real `jarvis_test` DB; DB never mocked; OpenAI via MSW)
- **`createSession`** — row created with defaults; returns id. Asserts mode/title persisted.
- **`getSession`** — returns messages ordered `createdAt asc`; null for unknown id.
- **`listSessions`** — ordered `updatedAt desc`, `take: 50`, includes one preview message.
  (Document that "first vs last" preview fix is Phase 2 — H7/§7.)
- **`appendMessage`** — inserts message **and** bumps parent `updatedAt` in one transaction;
  assert `updatedAt` increases after a child write (M3).
- **`deleteSession`** — cascades messages; on a missing id the route maps `P2025` → 404 (H3).
- **`updateSessionTitle`** — persists the new title.
- **POST `/api/chat`** (OpenAI mocked via MSW): user message persisted **before** stream;
  assistant message persisted in `onFinish`; for REFLECTION, title is `"Reflection — {date}"`
  not message-derived (C6); non-JSON body → 400 (H5); unknown mode → 400 (H14).
- **POST `/api/sessions`** — valid body → 201 + row; non-JSON → 400 (H5); invalid mode → 400.
- **DELETE `/api/sessions/:id`** — existing → 204; missing → 404 (H3).
- **`onFinish` failure** — when `appendMessage` throws inside `onFinish`, the failure is
  logged and surfaced rather than silently lost (H9). *(See §7 — H9 hardening lands here; if
  deferred, record it.)*

### E2E (Playwright)
- **Session lifecycle** — create → send a message → see streamed response → reload → history
  persists → delete → session gone.
- **Streaming correctness** — assert the rendered assistant message contains **no** framing
  tokens (`0:"`, `d:{`, leading `\d+:`) (C1). This is the gating B1 test.
- **Error states** — invalid `sessionId` shows the dark-theme `not-found`; a forced server
  error shows the `error` boundary, not the default Next error page (H10).
- **Accessibility smoke** — `aria-pressed` toggles on mode buttons (H12); delete control is
  reachable by keyboard and not nested in the anchor (H11); textarea has an accessible name
  (H12).
- **ModeSelector failure** — with the sessions API stubbed to fail, assert a visible error and
  that the URL never becomes `/chat/undefined` (H4).

---

## 7. KNOWN ACCEPTED PHASE 1 DEFECTS

Deliberately deferred. Each must be linked from its code site so it is not mistaken for an
oversight.

1. **`listSessions` returns the FIRST message, not the last (H7).** Preview shows the wrong
   message. Deferred to **Phase 2** because the correct fix is coupled to cursor pagination
   and the `SessionSummary` shape work. The `SessionSummary` **type** is fixed now (H8); the
   **query** behavior is not. Add a `// TODO(Phase 2)` at `history.ts:22`.
2. **`listSessions` N+1 + hard `take: 50` (M8).** One preview query per session, no cursor
   pagination. Acceptable at the 50-session cap for a single-user app. Cursor pagination is
   **Phase 2**. Documented in `history.ts` JSDoc.
3. **`src/lib/openai.ts` is dead code (M1).** It is not used by `jarvis.ts` (which uses
   `@ai-sdk/openai`). Its env read is routed through `env.ts` in Phase 1 (H2), but **file
   deletion + dropping the `openai` dependency is Phase 3** to avoid churn on a live dep now.
4. **No rate limiting.** `src/middleware.ts` token bucket is **Phase 3/5** (arch §5.3). Phase 1
   has no `/api/chat` or `/api/sessions` rate limit.
5. **No memory system.** `src/memory/`, `MemoryChunk`, pgvector are **Phase 4**.
6. **No egress projection / PII redaction / safety pre-check.** `src/lib/safety.ts` and the
   boundary unit test are **Phase 5** (ships before Reflection prod). Phase 1 corrects only
   the false *claim* (B2), not the mechanism. Mood extraction remains absent (opt-in, default
   OFF, Phase 5).
7. **No `PATCH /api/sessions/:id`** (rename/mode). **Phase 2.**
8. **`@updatedAt` non-propagation (M3).** Not fixed structurally — the manual bump in
   `appendMessage` remains the contract. Mitigated by JSDoc + schema comment + an integration
   test. Any future writer bypassing `appendMessage` will break ordering; that risk is
   accepted and documented, not engineered away in Phase 1.
9. **`NEXT_PUBLIC_APP_NAME` consumed nowhere (M5).** Three hardcoded `'Jarvis'` strings remain
   in layout/home. Architect decision: keep the env token **reserved for future
   white-labeling**; document it as reserved rather than wiring it in Phase 1. (Owner may
   instead wire it if trivial; not a Phase 1 gate.)
10. **`crypto.randomUUID()` requires HTTPS or localhost (M7).** Fine on Tailscale (HTTPS) and
    localhost; would fail on plain-HTTP non-localhost. Not a current deployment target;
    documented via a code comment only.

> **H9 (`onFinish` has no try/catch) is NOT an accepted defect — it is in scope.** Silent loss
> of the assistant message is a data-integrity bug. Wrap the `onFinish` body
> (`route.ts:46-48`) in try/catch with logging in **WP4**. It is listed in the integration
> test checklist (§6). If, and only if, capacity forces deferral, it must be reclassified here
> explicitly with sign-off — it must never be left ambiguous (QA requirement, mirrors C2).

---

## Dependency Order Summary

```
B1 (spike) ─┐
B2,B3,B4    ─┤
            ▼
WP1 (infra/security) ──▶ WP2 (test bootstrap) ──▶ WP3 (schema + env wiring)
                                                       │
                                   ┌───────────────────┼───────────────────┐
                                   ▼                   ▼                   ▼
                                WP4 (API)           WP5 (agent)         (WP3 done)
                                   │                   │
                                   └─────────┬─────────┘
                                             ▼
                                          WP6 (frontend; also needs B1)
                                             │
                                             ▼
                                  WP7 (docs) ──▶ WP8 (VOICE/VIDEO reconciliation)
```
