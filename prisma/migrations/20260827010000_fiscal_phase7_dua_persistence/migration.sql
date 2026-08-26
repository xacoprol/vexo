-- DUA / importación bienes (303 cas. 32–35) — nullable, sin backfill inventado
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "importDuaType" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "importDuaNumber" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "importDuaDate" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "importDuaBase" DECIMAL(65,30);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "importDuaVat" DECIMAL(65,30);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "importDuaDocumentId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_importDuaDocumentId_fkey"
    FOREIGN KEY ("importDuaDocumentId") REFERENCES "FiscalDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Expense_importDuaDocumentId_idx" ON "Expense"("importDuaDocumentId");
