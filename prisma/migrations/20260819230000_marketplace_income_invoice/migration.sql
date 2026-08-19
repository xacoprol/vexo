-- Link marketplace income → W3D invoice (convert Shopify/Amazon row to factura)
ALTER TABLE "MarketplaceIncome" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "MarketplaceIncome" ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "MarketplaceIncome_invoiceId_key" ON "MarketplaceIncome"("invoiceId");

ALTER TABLE "MarketplaceIncome" ADD CONSTRAINT "MarketplaceIncome_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
