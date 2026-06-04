/*
  Warnings:

  - You are about to drop the column `input` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `toolName` on the `AuditLog` table. All the data in the column will be lost.
  - Added the required column `goal` to the `AuditLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "input",
DROP COLUMN "toolName",
ADD COLUMN     "goal" TEXT NOT NULL;
