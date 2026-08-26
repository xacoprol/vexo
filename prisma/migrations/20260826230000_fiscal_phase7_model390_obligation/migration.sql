-- Fase 7: obligación Modelo 390 + periodicidad IVA
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "vatPeriodicity" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "vat390FilingObligation" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "vat390ExemptionReason" TEXT;
