-- Veri*Factu: modo remisión en settings + cola de eventos
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "verifactuMode" TEXT NOT NULL DEFAULT 'NO_VERIFACTU';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "verifactuEnv" TEXT NOT NULL DEFAULT 'TEST';

CREATE TABLE IF NOT EXISTS "VerifactuEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hash" TEXT,
    "previousHash" TEXT,
    "canonical" TEXT,
    "qrUrl" TEXT,
    "aeatCode" TEXT,
    "aeatMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerifactuEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VerifactuEvent_invoiceId_idx" ON "VerifactuEvent"("invoiceId");
CREATE INDEX IF NOT EXISTS "VerifactuEvent_status_idx" ON "VerifactuEvent"("status");
CREATE INDEX IF NOT EXISTS "VerifactuEvent_kind_idx" ON "VerifactuEvent"("kind");
CREATE INDEX IF NOT EXISTS "VerifactuEvent_createdAt_idx" ON "VerifactuEvent"("createdAt");

DO $$ BEGIN
  ALTER TABLE "VerifactuEvent" ADD CONSTRAINT "VerifactuEvent_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
