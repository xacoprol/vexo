-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "verifactuPreviousHash" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "verifactuRecordAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "verifactuQrUrl" TEXT;
