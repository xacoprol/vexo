import {
  clampPct,
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
    const vatPct =
      e.vatDeductiblePct != null
        ? clampPct(e.vatDeductiblePct)
        : e.deductible === false
          ? 0
          : 100;
    const irpfPct =
      e.irpfDeductiblePct != null
        ? clampPct(e.irpfDeductiblePct)
        : e.deductible === false
          ? 0
          : 100;
    const rate = e.vatRate > 0 ? e.vatRate : 21;
    const reverseQuota = vat > 0 ? vat : round2(sub * (rate / 100));

    const ded = computeExpenseDeductibility({
      subtotal: sub,
      vatAmount:
        parseExpenseOp(e.vatOperationType) !== "INTERIOR" ? reverseQuota : vat,
      vatDeductiblePct: vatPct,
      irpfDeductiblePct: irpfPct,
      isInvestment: e.isInvestment,
    });

    if (ded.irpfComputable <= 0) continue;

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
      description: `${desc}${opLabel} · IRPF ${irpfPct}% · IVA nd ${round2(ded.nonDeductibleVat)} €`,
      amount: ded.irpfComputable,
    });
  }

  return { ordinaryBase, lines };
}
