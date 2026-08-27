-- Fase 9.3: arrendamientos de local (base estructural 115/180)
-- Seguro: nullable leaseId, sin backfill, sin inventar withholdings históricos.

CREATE TABLE IF NOT EXISTS "BusinessPremisesLease" (
  "id" TEXT NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "propertyAddress" TEXT NOT NULL,
  "postalCode" TEXT,
  "municipality" TEXT,
  "province" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'ES',
  "cadastralReference" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "activityUse" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "withholdingStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "withholdingExemptionReason" TEXT,
  "defaultWithholdingRate" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPremisesLease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BusinessPremisesLease_counterpartyId_idx"
  ON "BusinessPremisesLease"("counterpartyId");
CREATE INDEX IF NOT EXISTS "BusinessPremisesLease_active_idx"
  ON "BusinessPremisesLease"("active");
CREATE INDEX IF NOT EXISTS "BusinessPremisesLease_withholdingStatus_idx"
  ON "BusinessPremisesLease"("withholdingStatus");
CREATE INDEX IF NOT EXISTS "BusinessPremisesLease_startDate_idx"
  ON "BusinessPremisesLease"("startDate");

DO $$ BEGIN
  ALTER TABLE "BusinessPremisesLease"
    ADD CONSTRAINT "BusinessPremisesLease_counterpartyId_fkey"
    FOREIGN KEY ("counterpartyId") REFERENCES "FiscalCounterparty"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "leaseId" TEXT;

CREATE INDEX IF NOT EXISTS "Expense_leaseId_idx" ON "Expense"("leaseId");

DO $$ BEGIN
  ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_leaseId_fkey"
    FOREIGN KEY ("leaseId") REFERENCES "BusinessPremisesLease"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
