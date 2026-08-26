import {
  addToQuarter,
  emptyQuarters,
  fiscalQuarterFromDate,
} from "@/lib/modelo-347/deadlines";
import { round2 } from "@/lib/modelo-347/threshold";
import type { Model347QuarterAmounts } from "@/lib/modelo-347/types";

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type Model347PaymentRow = {
  amount: number;
  paidAt: Date;
  method?: string | null;
};

export type Model347CashAccountingAmounts =
  | {
      complete: true;
      /** Cobros/pagos imputados en el ejercicio (criterio de caja). */
      cashAccountingAnnualAmount: number;
      cashAccountingQuarters: Model347QuarterAmounts;
    }
  | {
      complete: false;
      reason: string;
    };

/**
 * Importes 347 para facturas acogidas al RECC (criterio de caja IVA).
 * Requiere cobros registrados que cubran el total de la factura.
 */
export function compute347CashAccountingAmounts(opts: {
  invoiceTotal: number;
  payments: Model347PaymentRow[];
  yearFrom: Date;
  yearTo: Date;
}): Model347CashAccountingAmounts {
  const invoiceTotal = round2(num(opts.invoiceTotal));
  const payments = opts.payments;

  if (payments.length === 0) {
    return { complete: false, reason: "Sin cobros registrados en InvoicePayment" };
  }

  const totalPaid = round2(payments.reduce((s, p) => s + num(p.amount), 0));
  if (totalPaid + 0.01 < invoiceTotal) {
    return {
      complete: false,
      reason: "Cobros registrados no cubren el total de la factura",
    };
  }

  const inYear = payments.filter(
    (p) => p.paidAt >= opts.yearFrom && p.paidAt <= opts.yearTo
  );

  const cashAccountingQuarters = emptyQuarters();
  let cashAccountingAnnualAmount = 0;
  for (const p of inYear) {
    const amount = round2(num(p.amount));
    cashAccountingAnnualAmount = round2(cashAccountingAnnualAmount + amount);
    addToQuarter(cashAccountingQuarters, fiscalQuarterFromDate(p.paidAt), amount);
  }

  return {
    complete: true,
    cashAccountingAnnualAmount,
    cashAccountingQuarters,
  };
}
