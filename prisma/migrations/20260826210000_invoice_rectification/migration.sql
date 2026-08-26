-- Fase fiscal 4: facturas rectificativas
ALTER TABLE "InvoiceSeries" ADD COLUMN "seriesKind" TEXT NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "Invoice" ADD COLUMN "invoiceFiscalType" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Invoice" ADD COLUMN "rectificationType" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "rectificationMethod" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "rectifiesInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "rectificationCause" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "rectificationNotes" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "substitutionCorrectSubtotal" DECIMAL(65,30);
ALTER TABLE "Invoice" ADD COLUMN "substitutionCorrectVat" DECIMAL(65,30);
ALTER TABLE "Invoice" ADD COLUMN "substitutionCorrectTotal" DECIMAL(65,30);
ALTER TABLE "Invoice" ADD COLUMN "annulledAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "annulReason" TEXT;

CREATE INDEX "Invoice_rectifiesInvoiceId_idx" ON "Invoice"("rectifiesInvoiceId");
CREATE INDEX "Invoice_invoiceFiscalType_idx" ON "Invoice"("invoiceFiscalType");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rectifiesInvoiceId_fkey"
  FOREIGN KEY ("rectifiesInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
