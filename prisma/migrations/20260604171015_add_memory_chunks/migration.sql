-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('short_term', 'long_term', 'episodic');

-- CreateTable
CREATE TABLE "MemoryChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "kind" "MemoryKind" NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryChunk_sessionId_idx" ON "MemoryChunk"("sessionId");

-- CreateIndex
CREATE INDEX "MemoryChunk_kind_idx" ON "MemoryChunk"("kind");

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HNSW cosine index for vector similarity search (Prisma cannot express this)
CREATE INDEX "MemoryChunk_embedding_hnsw_idx" ON "MemoryChunk" USING hnsw (embedding vector_cosine_ops);
