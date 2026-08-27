-- Fase 9.4: periodicidad declarada Modelo 111 (sin backfill).
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "model111Periodicity" TEXT NOT NULL DEFAULT 'UNKNOWN';
