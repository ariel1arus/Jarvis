-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('read_only', 'local_mutation', 'external_side_effect');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('pending', 'auto_approved', 'approved', 'rejected', 'executed', 'failed');

-- DropIndex
DROP INDEX "MemoryChunk_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "toolName" TEXT NOT NULL,
    "actionKind" "ActionKind" NOT NULL,
    "input" JSONB NOT NULL,
    "dryRunOutput" JSONB,
    "output" JSONB,
    "status" "AuditStatus" NOT NULL DEFAULT 'pending',
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_sessionId_idx" ON "AuditLog"("sessionId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
