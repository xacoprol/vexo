-- Hechos fiscales Modelo 390 (exoneración determinada por motor, no manual)
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "vatUsesSii" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "vatTerritory" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "vatActivity390Scope" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "lastVatPeriodFilingRequired" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- Migración conservadora: solo SII legacy → vatUsesSii=YES
UPDATE "CompanySettings"
SET "vatUsesSii" = 'YES'
WHERE "vat390ExemptionReason" = 'SII'
  AND ("vatUsesSii" IS NULL OR "vatUsesSii" = 'UNKNOWN');

-- REDEME, GROUP_ENTITY, OTHER y EXEMPT/REQUIRED manual no se migran a hechos nuevos
