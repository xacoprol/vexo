-- Fase 16: intentos de presentación AEAT (asistido / manual; sin API)
CREATE TABLE IF NOT EXISTS "FiscalSubmissionAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "preFilingReviewId" TEXT NOT NULL,
    "declarationHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "requestFingerprint" TEXT,
    "responseCode" TEXT,
    "errorCode" TEXT,
    "receiptId" TEXT,
    "filingId" TEXT,
    "paymentRequirement" TEXT,
    "reviewMatchFlag" TEXT,
    "safeMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalSubmissionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FiscalSubmissionAttempt_tenantId_model_year_quarter_declarationHash_idx"
  ON "FiscalSubmissionAttempt"("tenantId", "model", "year", "quarter", "declarationHash");

CREATE INDEX IF NOT EXISTS "FiscalSubmissionAttempt_preFilingReviewId_idx"
  ON "FiscalSubmissionAttempt"("preFilingReviewId");

CREATE INDEX IF NOT EXISTS "FiscalSubmissionAttempt_status_idx"
  ON "FiscalSubmissionAttempt"("status");

CREATE INDEX IF NOT EXISTS "FiscalSubmissionAttempt_filingId_idx"
  ON "FiscalSubmissionAttempt"("filingId");
