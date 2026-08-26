-- FASE FISCAL 1: ciclo DRAFT/ISSUED + deducibilidad IVA/IRPF separada.
-- Segura: solo ADD COLUMN + backfill; no toca FiscalFiling ni recalcula presentados.

-- ─── Invoice.fiscalStatus ────────────────────────────────────────────────────
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fiscalStatus" TEXT NOT NULL DEFAULT 'DRAFT';

-- Todas las facturas YA existentes se consideran emitidas (entraban en 303/libros).
-- Los borradores nuevos nacen DRAFT vía createInvoice (default + código).
UPDATE "Invoice" SET "fiscalStatus" = 'ISSUED';

CREATE INDEX IF NOT EXISTS "Invoice_fiscalStatus_idx" ON "Invoice"("fiscalStatus");

-- ─── Expense: porcentajes independientes ─────────────────────────────────────
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "vatDeductiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "irpfDeductiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100;

-- Preservar comportamiento legacy del booleano deductible.
UPDATE "Expense"
SET
  "vatDeductiblePct" = CASE WHEN "deductible" = false THEN 0 ELSE 100 END,
  "irpfDeductiblePct" = CASE WHEN "deductible" = false THEN 0 ELSE 100 END;
