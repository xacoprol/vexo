import {
  computeExpenseDeductibility,
} from "@/lib/expense-deductibility";
import type { Model130TraceLine } from "@/lib/modelo-130/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseExpenseOp(raw: string | null | undefined): string {
  const v = String(raw ?? "INTERIOR").toUpperCase().trim();
  if (
    v === "SERVICIO_EXTRACOMUNITARIO" ||
    v === "IMPORTACION_SERVICIOS" ||
    v === "EXTRACOMUNITARIA" ||
    v === "ISP"
  ) {
    return "SERVICIO_EXTRACOMUNITARIO";
  }
  if (v === "INTRACOMUNITARIA" || v === "INTRACOM" || v === "AIB") {
    return "INTRACOMUNITARIA";
  }
  return "INTERIOR";
}

export type IrpfExpenseRow = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  vatOperationType: string | null;
  deductible?: boolean | null;
  vatDeductiblePct?: number | null;
  irpfDeductiblePct?: number | null;
  isInvestment: boolean;
  description?: string | null;
  supplierName?: string | null;
};

export type IrpfExpenseResult = {
  ordinaryBase: number;
  lines: Model130TraceLine[];
};

/** Gastos computables IRPF — reutiliza computeExpenseDeductibility (Fase 1). */
export function aggregateIrpfExpenses(opts: {
  expenses: IrpfExpenseRow[];
  from: Date;
  to: Date;
}): IrpfExpenseResult {
  const lines: Model130TraceLine[] = [];
  let ordinaryBase = 0;

  for (const e of opts.expenses) {
    if (e.issueDate < opts.from || e.issueDate > opts.to) continue;

    const sub = Number(e.subtotal);
    const vat = Number(e.vatAmount);
    const rate = e.vatRate > 0 ? e.vatRate : 21;
    // Prefer stored quota (incl. negative credit notes); else derive from base.
    const reverseQuota =
      Math.abs(vat) >= 0.005 ? round2(vat) : round2(sub * (rate / 100));

    const ded = computeExpenseDeductibility({
      subtotal: sub,
      vatAmount:
        parseExpenseOp(e.vatOperationType) !== "INTERIOR" ? reverseQuota : vat,
      vatDeductiblePct: e.vatDeductiblePct,
      irpfDeductiblePct: e.irpfDeductiblePct,
      deductible: e.deductible,
      isInvestment: e.isInvestment,
    });

    if (ded.unresolvedDeductibility) {
      lines.push({
        sourceType: "expense",
        sourceId: e.id,
        description: `${e.description?.trim() || e.supplierName?.trim() || `Gasto ${e.id.slice(0, 8)}`} · deducibilidad sin clasificar (excluido)`,
        amount: 0,
      });
      continue;
    }

    // Include negative computable amounts (abonos / notas de crédito).
    if (Math.abs(ded.irpfComputable) < 0.005) continue;

    ordinaryBase = round2(ordinaryBase + ded.irpfComputable);
    const op = parseExpenseOp(e.vatOperationType);
    const opLabel =
      op === "INTRACOMUNITARIA"
        ? " (intracom)"
        : op === "SERVICIO_EXTRACOMUNITARIO"
          ? " (extracom)"
          : e.isInvestment
            ? " (inversión→amort.)"
            : "";
    const desc =
      e.description?.trim() ||
      e.supplierName?.trim() ||
      `Gasto ${e.id.slice(0, 8)}`;
    lines.push({
      sourceType: "expense",
      sourceId: e.id,
      description: `${desc}${opLabel} · IRPF ${ded.irpfDeductiblePct}% · IVA nd ${round2(ded.nonDeductibleVat)} €`,
      amount: ded.irpfComputable,
    });
  }

  return { ordinaryBase, lines };
}
