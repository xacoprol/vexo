-- AlterTable
ALTER TABLE "AeatCommunication" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "AeatCommunication" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ABIERTA';
ALTER TABLE "AeatCommunication" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AeatCommunication_dueAt_idx" ON "AeatCommunication"("dueAt");
CREATE INDEX IF NOT EXISTS "AeatCommunication_status_idx" ON "AeatCommunication"("status");
