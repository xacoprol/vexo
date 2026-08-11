-- Recordatorios fiscales por email
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "fiscalReminderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "fiscalReminderEmail" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "FiscalReminderLog" (
    "id" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReminderLog_periodKey_kind_key" ON "FiscalReminderLog"("periodKey", "kind");
CREATE INDEX IF NOT EXISTS "FiscalReminderLog_sentAt_idx" ON "FiscalReminderLog"("sentAt");
