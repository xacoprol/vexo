-- FASE FISCAL 1 cierre: invoiceKind explícito + límite simplificada.
-- No recalcula huellas ni cambia TipoFactura de facturas ISSUED.

-- ─── CompanySettings: límite factura simplificada ────────────────────────────
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "simplifiedInvoiceMaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 400;

-- ─── Invoice.invoiceKind ─────────────────────────────────────────────────────
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "invoiceKind" TEXT NOT NULL DEFAULT 'FULL';

-- Histórico ISSUED: preservar el F1/F2 que produjo la heurística antigua
-- (paymentMethod shopify/marketplace o MarketplaceIncome vinculado → F2).
-- No se toca verifactuHash / TipoFactura del registro.
UPDATE "Invoice" AS i
SET "invoiceKind" = 'SIMPLIFIED'
WHERE i."fiscalStatus" = 'ISSUED'
  AND (
    LOWER(COALESCE(i."paymentMethod", '')) LIKE '%shopify%'
    OR LOWER(COALESCE(i."paymentMethod", '')) LIKE '%marketplace%'
    OR EXISTS (
      SELECT 1 FROM "MarketplaceIncome" m WHERE m."invoiceId" = i."id"
    )
  );

-- DRAFT y resto quedan FULL (default) — nueva lógica/default explícito.
