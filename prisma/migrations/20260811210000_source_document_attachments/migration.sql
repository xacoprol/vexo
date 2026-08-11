-- AlterTable Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentId" TEXT;

-- AlterTable Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;

-- AlterTable MarketplaceIncome
ALTER TABLE "MarketplaceIncome" ADD COLUMN IF NOT EXISTS "documentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expense_documentId_idx" ON "Expense"("documentId");
CREATE INDEX IF NOT EXISTS "Invoice_sourceDocumentId_idx" ON "Invoice"("sourceDocumentId");
CREATE INDEX IF NOT EXISTS "MarketplaceIncome_documentId_idx" ON "MarketplaceIncome"("documentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "FiscalDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MarketplaceIncome" ADD CONSTRAINT "MarketplaceIncome_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
