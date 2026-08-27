-- Fase 9.1: retenciones practicadas + contrapartes + perfil censal mínimo 111
-- Seguro: defaults UNKNOWN, sin backfill de withholdings históricos.

ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "paysProfessionalsSubjectToWithholding" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel111" TEXT NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "practicedWithholdingStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';

CREATE INDEX IF NOT EXISTS "Expense_practicedWithholdingStatus_idx"
  ON "Expense"("practicedWithholdingStatus");

CREATE TABLE IF NOT EXISTS "FiscalCounterparty" (
  "id" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "normalizedTaxId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'ES',
  "kind" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
  "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalCounterparty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalCounterparty_normalizedTaxId_key"
  ON "FiscalCounterparty"("normalizedTaxId");
CREATE INDEX IF NOT EXISTS "FiscalCounterparty_kind_idx"
  ON "FiscalCounterparty"("kind");
CREATE INDEX IF NOT EXISTS "FiscalCounterparty_name_idx"
  ON "FiscalCounterparty"("name");

CREATE TABLE IF NOT EXISTS "FiscalWithholding" (
  "id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "perceptionKey" TEXT,
  "perceptionSubKey" TEXT,
  "baseAmount" DECIMAL(65,30) NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "withholdingAmount" DECIMAL(65,30) NOT NULL,
  "accrualDate" TIMESTAMP(3) NOT NULL,
  "paymentDate" TIMESTAMP(3),
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "rectifiesId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalWithholding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FiscalWithholding_direction_kind_year_quarter_idx"
  ON "FiscalWithholding"("direction", "kind", "year", "quarter");
CREATE INDEX IF NOT EXISTS "FiscalWithholding_sourceType_sourceId_idx"
  ON "FiscalWithholding"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "FiscalWithholding_counterpartyId_idx"
  ON "FiscalWithholding"("counterpartyId");
CREATE INDEX IF NOT EXISTS "FiscalWithholding_status_idx"
  ON "FiscalWithholding"("status");
CREATE INDEX IF NOT EXISTS "FiscalWithholding_accrualDate_idx"
  ON "FiscalWithholding"("accrualDate");
CREATE INDEX IF NOT EXISTS "FiscalWithholding_rectifiesId_idx"
  ON "FiscalWithholding"("rectifiesId");

DO $$ BEGIN
  ALTER TABLE "FiscalWithholding"
    ADD CONSTRAINT "FiscalWithholding_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "FiscalCounterparty"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FiscalWithholding"
    ADD CONSTRAINT "FiscalWithholding_rectifiesId_fkey"
    FOREIGN KEY ("rectifiesId") REFERENCES "FiscalWithholding"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
