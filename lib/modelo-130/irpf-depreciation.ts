import {
  amortizationYtdThroughQuarter,
  type AmortizationPeriodInput,
} from "@/lib/investment-amortization";
import type { FiscalQuarter, Model130TraceLine } from "@/lib/modelo-130/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type IrpfDepreciationAssetInput = AmortizationPeriodInput & {
  assetId?: string;
  label?: string;
};

export type IrpfDepreciationResult = {
  ytd: number;
  lines: Model130TraceLine[];
};

export function computeIrpfDepreciation(opts: {
  rows: IrpfDepreciationAssetInput[];
  year: number;
  quarter: FiscalQuarter;
}): IrpfDepreciationResult {
  const lines: Model130TraceLine[] = [];
  let ytd = 0;

  for (const row of opts.rows) {
    const amount = amortizationYtdThroughQuarter(row, opts.year, opts.quarter);
    if (amount <= 0) continue;
    ytd = round2(ytd + amount);
    lines.push({
      sourceType: "amortization",
      sourceId: row.assetId,
      description: row.label ?? `Amortización bien ${row.assetId ?? "—"}`,
      amount,
    });
  }

  return { ytd: round2(ytd), lines };
}

export function sumIrpfDepreciationYtd(
  rows: AmortizationPeriodInput[],
  year: number,
  quarter: FiscalQuarter
): number {
  return computeIrpfDepreciation({
    rows: rows.map((r) => ({ ...r })),
    year,
    quarter,
  }).ytd;
}
