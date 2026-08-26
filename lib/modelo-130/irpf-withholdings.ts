import type { Model130TraceLine } from "@/lib/modelo-130/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type IrpfWithholdingInvoiceRow = {
  id: string;
  fullNumber?: string;
  issueDate: Date;
  irpfAmount: unknown;
  status: string;
  fiscalStatus: string;
};

export type IrpfWithholdingResult = {
  total: number;
  lines: Model130TraceLine[];
};

export function aggregateIrpfWithholdings(opts: {
  invoices: IrpfWithholdingInvoiceRow[];
  from: Date;
  to: Date;
}): IrpfWithholdingResult {
  const lines: Model130TraceLine[] = [];
  let total = 0;

  for (const inv of opts.invoices) {
    if (inv.issueDate < opts.from || inv.issueDate > opts.to) continue;
    if (String(inv.status).toUpperCase() === "ANULADA") continue;
    if (String(inv.fiscalStatus).toUpperCase() !== "ISSUED") continue;

    const amount = round2(Math.max(0, Number(inv.irpfAmount)));
    if (amount <= 0) continue;

    total = round2(total + amount);
    lines.push({
      sourceType: "withholding",
      sourceId: inv.id,
      description: `Retención factura ${inv.fullNumber ?? inv.id}`,
      amount,
    });
  }

  return { total, lines };
}
