import type { Model130TraceLine } from "@/lib/modelo-130/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type IrpfIncomeInvoiceRow = {
  id: string;
  fullNumber?: string;
  issueDate: Date;
  subtotal: unknown;
  irpfAmount?: unknown;
  status: string;
  fiscalStatus: string;
  /** Metadato IVA (criterio de caja). No altera imputación IRPF del 130. */
  cashAccounting?: boolean;
};

export type IrpfIncomeMarketplaceRow = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  channel?: string;
  orderId?: string | null;
  invoiceId?: string | null;
};

export type IrpfIncomeResult = {
  total: number;
  invoiceTotal: number;
  marketplaceTotal: number;
  /** Ingresos de facturas con retención IRPF > 0. */
  incomeWithWithholding: number;
  hasCashAccountingInvoices: boolean;
  lines: Model130TraceLine[];
};

/**
 * Ingresos computables IRPF / casilla 01.
 *
 * Fuente de verdad:
 * - Facturas fiscalStatus=ISSUED, status≠ANULADA → subtotal (devengo, no cobro).
 * - MarketplaceIncome sin factura vinculada (invoiceId null) → subtotal.
 * - Sin doble cómputo: marketplace convertido a factura queda excluido.
 */
export function aggregateIrpfIncome(opts: {
  invoices: IrpfIncomeInvoiceRow[];
  marketplace: IrpfIncomeMarketplaceRow[];
  from: Date;
  to: Date;
}): IrpfIncomeResult {
  const lines: Model130TraceLine[] = [];
  let invoiceTotal = 0;
  let marketplaceTotal = 0;
  let incomeWithWithholding = 0;
  let hasCashAccountingInvoices = false;

  for (const inv of opts.invoices) {
    if (inv.issueDate < opts.from || inv.issueDate > opts.to) continue;
    if (String(inv.status).toUpperCase() === "ANULADA") continue;
    if (String(inv.fiscalStatus).toUpperCase() !== "ISSUED") continue;

    const amount = round2(Number(inv.subtotal));
    invoiceTotal = round2(invoiceTotal + amount);
    if (inv.cashAccounting) hasCashAccountingInvoices = true;
    if (Number(inv.irpfAmount) > 0) {
      incomeWithWithholding = round2(incomeWithWithholding + amount);
    }
    lines.push({
      sourceType: "invoice",
      sourceId: inv.id,
      description: `Factura ${inv.fullNumber ?? inv.id}`,
      amount,
    });
  }

  for (const m of opts.marketplace) {
    if (m.issueDate < opts.from || m.issueDate > opts.to) continue;
    if (m.invoiceId) continue;

    const amount = round2(Number(m.subtotal));
    marketplaceTotal = round2(marketplaceTotal + amount);
    const label = [m.channel, m.orderId].filter(Boolean).join(" · ") || "Marketplace";
    lines.push({
      sourceType: "marketplace",
      sourceId: m.id,
      description: `Ingreso marketplace ${label}`,
      amount,
    });
  }

  return {
    total: round2(invoiceTotal + marketplaceTotal),
    invoiceTotal,
    marketplaceTotal,
    incomeWithWithholding,
    hasCashAccountingInvoices,
    lines,
  };
}
