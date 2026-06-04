# Jarvis Private AI — Database

PostgreSQL 17 (Docker) accessed through **Prisma 7** with the `pg` driver adapter.
The generated client lives at `src/generated/prisma/` and is imported from
**`@/generated/prisma/client`** — never `@prisma/client`.

---

## 1. Current Schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Mode {
  CHAT
  REFLECTION
  RESEARCH
  VOICE
  VIDEO
}

model ChatSession {
  id        String    @id @default(cuid())
  title     String    @default("New conversation")
  mode      Mode      @default(CHAT)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
}

model Message {
  id        String      @id @default(cuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role      String      // UNCONSTRAINED — see Recommended Changes
  content   String
  createdAt DateTime    @default(now())
}
```

---

## 2. Recommended Changes (REQUIRED before Phase 2)

| Change | Reason |
|--------|--------|
| Add `Role` enum (`user`, `assistant`, `system`, `tool`) and type `Message.role` as `Role` | `Message.role` is currently an unconstrained `String` — invalid roles can be persisted and later break the model call. **Top-5 risk.** |
| `@@index([sessionId])` on `Message` | Every history read filters by `sessionId`; no index today |
| `@@index([updatedAt(sort: Desc)])` on `ChatSession` | `listSessions` orders by `updatedAt desc` |
| Fix `SessionSummary` type | Currently `SessionSummary` and `SessionWithMessages` are **structurally identical** (`ChatSession & { messages: Message[] }`). Make `SessionSummary = ChatSession & { messages: [Message] \| [] }` (zero-or-one preview message) |

> **Migration note (QA):** `Message.role` is live data typed as free-text. Adding the
> `Role` enum requires a data-backfill/validation step: confirm all existing rows hold one
> of the four enum values before the column type change, or the migration will fail. Decide
> the soft-delete policy (below) **before** writing this migration.

---

## 3. ER Diagram

```
┌────────────────────┐         ┌─────────────────────┐
│    ChatSession     │ 1     N │       Message       │
├────────────────────┤◀────────├─────────────────────┤
│ id        cuid PK  │         │ id        cuid PK    │
│ title     String   │         │ sessionId FK ───────▶│ (onDelete: Cascade)
│ mode      Mode     │         │ role      Role        │
│ createdAt DateTime │         │ content   String      │
│ updatedAt DateTime │         │ createdAt DateTime    │
└────────────────────┘         └─────────────────────┘
        │                               ▲
        │ 1                          N  │  (Phase 2)
        │                               │
        ▼                       ┌───────┴──────────┐    ┌──────────────────┐
   (Phase 2)                    │   MemoryChunk    │    │   MoodSnapshot    │
        │                       │ sessionId Cascade│    │ sessionId Cascade │
        └──────────────────────▶│ messageId SetNull│    │ messageId SetNull │
                                │ kind MemoryKind  │    │ valence/arousal/  │
                                │ embedding vector │    │ dominance (VAD)   │
                                └──────────────────┘    └──────────────────┘
```

---

## 4. Session Storage Model

`src/chat/history.ts` is the **only** module that touches these tables.

- **`createSession(mode, title)`** — insert with defaults.
- **`getSession(id)`** — include all messages `orderBy createdAt asc`.
- **`listSessions()`** — `take: 50`, ordered `updatedAt desc`, includes a single preview message.
  - **Fix:** it currently includes the **first** message (`take: 1, orderBy createdAt asc`). It should include the **last** message for a useful preview.
  - **Fix (QA):** replace the hard `take: 50` cap with **cursor pagination**.
- **`appendMessage(sessionId, role, content)`** — runs in a **`$transaction`**: insert `Message` **and** manually bump `ChatSession.updatedAt`. The manual bump is required because **`@updatedAt` on the parent does not propagate from a child write**.
- **`updateSessionTitle(sessionId, title)`** — used by auto-title and the future PATCH route.
- **`deleteSession(id)`** — cascades to messages.
  - **Fix (QA):** a missing id throws Prisma `P2025`, which currently surfaces as a **500**. Catch `P2025` and return **404**. Decide whether delete is **hard** or **soft** (a `deletedAt` column) before Phase 2 migrations.

**Ordering correctness:** writes within a session must remain causally ordered.
`createdAt` defaults to `now()` at insert time; under a single-user load this is sufficient,
but message preview/last-message queries must order by `createdAt`, not by `id`.

---

## 5. Memory Storage Model (Phase 2/4)

`pgvector` must be enabled via **raw SQL before** the `MemoryChunk` migration runs.

```prisma
enum MemoryKind {
  short_term
  long_term
  episodic
}

model MemoryChunk {
  id        String      @id @default(cuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  messageId String?
  message   Message?    @relation(fields: [messageId], references: [id], onDelete: SetNull)
  kind      MemoryKind
  content   String      @db.Text
  embedding Unsupported("vector(1536)")
  createdAt DateTime    @default(now())

  @@index([sessionId])
  @@index([kind])
}
```

- **HNSW index** (cosine ops) is created via **raw SQL** — Prisma cannot express it. Add it in the same migration after the table.
- `messageId` is **nullable + `SetNull`**: a chunk can outlive the message it was derived from.
- Retrieval is **token-budgeted** and injected into the **system prompt only** (see `agent-flow.md`).

---

## 6. Mood Tracking Model (Phase 2/5)

VAD (Valence–Arousal–Dominance) model. **Opt-in only; default OFF** (safety requirement).

```prisma
enum MoodSource {
  model_inferred
  user_reported
  biosignal
}

model MoodSnapshot {
  id        String      @id @default(cuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  messageId String?
  message   Message?    @relation(fields: [messageId], references: [id], onDelete: SetNull)
  valence   Float       // -1 .. 1
  arousal   Float       //  0 .. 1
  dominance Float       //  0 .. 1
  label     String?
  source    MoodSource
  createdAt DateTime    @default(now())

  @@index([sessionId, createdAt])
}
```

Range constraints (`-1..1`, `0..1`) are enforced at the application layer; add CHECK
constraints via raw SQL if defense-in-depth is desired.

---

## 7. Migration Strategy

- **Naming:** snake_case, timestamped, descriptive (e.g. `20260604_add_role_enum_and_message_indexes`).
- **Safe enum additions:** use `ALTER TYPE ... ADD VALUE` (additive, non-breaking).
- **Ordering for Phase 2:**
  1. Backfill/validate `Message.role` values → add `Role` enum → change column type.
  2. Add `Message`/`ChatSession` indexes.
  3. `CREATE EXTENSION vector` (raw SQL).
  4. `MemoryChunk` table → HNSW index (raw SQL).
  5. `MoodSnapshot` table.
- **Live data:** there is no migration plan for existing rows yet — write one before any destructive change. Decide soft-delete first.
- **Tests:** the `jarvis_test` DB runs on a **separate port** and applies migrations with
  **`prisma migrate deploy`** (never `migrate dev`). Add the `jarvis_test` service to `docker-compose.yml`.

---

## 8. Prisma Conventions

- **Singleton:** `src/lib/prisma.ts` caches the client on `globalThis` **in dev only**. Construction is `pg.Pool` → `PrismaPg` → `PrismaClient`.
- **Never call `$disconnect()` in route handlers** — the pooled client is long-lived.
- **Generated client import path:** `@/generated/prisma/client`. Using `@prisma/client` is a bug.
- **All DB access goes through `src/chat/history.ts`** (and `src/memory/` in Phase 4+). Agents and routes must not call `prisma.*` directly.

### Operational / security notes
- **Postgres password is `1234`** in `docker-compose.yml` — change it before this leaves a dev laptop.
- **Bind Postgres to localhost/Tailscale only;** do not expose port 5432 to the public internet.
- `DATABASE_URL` and all DB credentials are declared in `src/lib/env.ts` (Architect-owned). Any new DB-related env var must be added there **first**.
