import type { FiscalQuarter } from "@/lib/fiscal";
import type { Model390CompensationSummary, Model390Quarter303 } from "@/lib/modelo-390/types";
import { round2 } from "@/lib/modelo-390/money";

export function buildCompensationSummary(opts: {
  openingBalance: number;
  quarters: Model390Quarter303[];
}): Model390CompensationSummary {
  let appliedInYear = 0;
  let generatedInYear = 0;

  for (const q of opts.quarters) {
    appliedInYear = round2(appliedInYear + q.box78);
    if (q.box71 < 0) {
      generatedInYear = round2(generatedInYear + Math.abs(q.box71));
    }
  }

  const last = opts.quarters[opts.quarters.length - 1];
  const pendingEndOfYear = last ? round2(last.box87 + (last.box71 < 0 ? -last.box71 : 0)) : 0;

  return {
    openingBalance: round2(opts.openingBalance),
    appliedInYear,
    pendingEndOfYear,
    generatedInYear,
    quarters: opts.quarters.map((q) => ({
      quarter: q.quarter,
      box110: q.box110,
      box78: q.box78,
      box87: q.box87,
      box71: q.box71,
      source: q.source,
    })),
  };
}

export function openingBalanceFromFirstQuarter(
  quarters: Model390Quarter303[]
): number {
  const q1 = quarters.find((q) => q.quarter === 1);
  return q1 ? round2(q1.box110) : 0;
}

export type FiscalQuarter303Chain = Record<FiscalQuarter, Model390Quarter303>;
