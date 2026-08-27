-- Fase 9.5: periodicidad declarada Modelo 115 (sin backfill).
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "model115Periodicity" TEXT NOT NULL DEFAULT 'UNKNOWN';
