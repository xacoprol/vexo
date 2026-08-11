-- AlterTable Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "isInvestment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "investmentAssetId" TEXT;

-- AlterTable InvestmentAsset
ALTER TABLE "InvestmentAsset" ADD COLUMN IF NOT EXISTS "vatOperationType" TEXT NOT NULL DEFAULT 'INTERIOR';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_investmentAssetId_key" ON "Expense"("investmentAssetId");
CREATE INDEX IF NOT EXISTS "Expense_isInvestment_idx" ON "Expense"("isInvestment");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_investmentAssetId_fkey"
    FOREIGN KEY ("investmentAssetId") REFERENCES "InvestmentAsset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
