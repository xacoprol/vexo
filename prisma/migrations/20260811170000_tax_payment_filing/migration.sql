-- AlterTable
ALTER TABLE "TaxPayment" ADD COLUMN IF NOT EXISTS "filingId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaxPayment_filingId_idx" ON "TaxPayment"("filingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaxPayment_status_idx" ON "TaxPayment"("status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TaxPayment_filingId_fkey'
  ) THEN
    ALTER TABLE "TaxPayment"
      ADD CONSTRAINT "TaxPayment_filingId_fkey"
      FOREIGN KEY ("filingId") REFERENCES "FiscalFiling"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
