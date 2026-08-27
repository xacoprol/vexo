-- Fase 9.2: perfil censal estructurado + metadatos
-- Seguro: defaults UNKNOWN/null. No backfill desde operaciones.
-- censusModel111 ya existe (Fase 9.1) — no se recrea.

ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel130" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel303" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel115" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel180" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel190" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel349" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel347" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusModel390" TEXT NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "hasEmployees" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "rentsBusinessPremises" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "businessRentSubjectToWithholding" TEXT NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "activityStartYear" INTEGER;

ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusSource" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "censusLastUpdatedAt" TIMESTAMP(3);
