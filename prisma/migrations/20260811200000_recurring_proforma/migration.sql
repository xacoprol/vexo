-- AlterTable
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "recurringTemplateId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Quote_recurringTemplateId_idx" ON "Quote"("recurringTemplateId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Quote" ADD CONSTRAINT "Quote_recurringTemplateId_fkey"
    FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringInvoiceTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
