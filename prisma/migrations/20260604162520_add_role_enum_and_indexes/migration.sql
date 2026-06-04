-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'assistant', 'system', 'tool');

-- AlterTable
-- Convert Message.role from TEXT to the Role enum in place, preserving existing data.
-- Pre-migration check confirmed all existing values are within the enum domain.
ALTER TABLE "Message"
  ALTER COLUMN "role" TYPE "Role" USING ("role"::"Role");

-- CreateIndex
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Message_sessionId_idx" ON "Message"("sessionId");
