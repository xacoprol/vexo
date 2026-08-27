-- Fase 14: revisión pre-presentación (no es filing AEAT)
CREATE TABLE IF NOT EXISTS "FiscalPreFilingReview" (
    "id" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "censusHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "healthStatus" TEXT NOT NULL,
    "readyToFile" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "FiscalPreFilingReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FiscalPreFilingReview_periodKey_createdAt_idx"
  ON "FiscalPreFilingReview"("periodKey", "createdAt");

CREATE INDEX IF NOT EXISTS "FiscalPreFilingReview_year_quarter_idx"
  ON "FiscalPreFilingReview"("year", "quarter");
