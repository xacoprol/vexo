import type {
  Model390AnnualVatSummary,
  Model390Reconciliation,
  Model390ReconciliationDifference,
} from "@/lib/modelo-390/types";
import { moneyDelta, moneyEqual } from "@/lib/modelo-390/money";

function diffRow(
  field: string,
  label: string,
  operationsAmount: number,
  from303Amount: number
): Model390ReconciliationDifference | null {
  if (moneyEqual(operationsAmount, from303Amount)) return null;
  return {
    field,
    label,
    operationsAmount,
    from303Amount,
    delta: moneyDelta(operationsAmount, from303Amount),
  };
}

export function reconcileAnnualVat(opts: {
  operations: Model390AnnualVatSummary;
  from303: Model390AnnualVatSummary;
  requiresReview: boolean;
}): Model390Reconciliation {
  const differences: Model390ReconciliationDifference[] = [];

  for (const row of [
    diffRow("outputVat", "IVA devengado", opts.operations.outputVat, opts.from303.outputVat),
    diffRow("inputVat", "IVA deducible", opts.operations.inputVat, opts.from303.inputVat),
    diffRow(
      "activityNet",
      "Resultado liquidación (Σ box71)",
      opts.operations.activityNet,
      opts.from303.activityNet
    ),
    diffRow(
      "domesticQuota21",
      "Cuota 21 %",
      opts.operations.breakdown.domesticQuota.rate21,
      opts.from303.breakdown.domesticQuota.rate21
    ),
    diffRow(
      "euIntracomAccruedVat",
      "Cuota AIB/servicios UE (10/11)",
      opts.operations.breakdown.euIntracomAccruedVat,
      opts.from303.breakdown.euIntracomAccruedVat
    ),
    diffRow(
      "otherIspAccruedVat",
      "Cuota otras ISP (12/13)",
      opts.operations.breakdown.otherIspAccruedVat,
      opts.from303.breakdown.otherIspAccruedVat
    ),
    diffRow(
      "importCurrentVat",
      "IVA deducible importaciones corrientes",
      opts.operations.breakdown.importCurrentVat,
      opts.from303.breakdown.importCurrentVat
    ),
  ]) {
    if (row) differences.push(row);
  }

  const hasProvisional = opts.from303.quarters?.some((q) => q.provisional) ?? false;

  if (opts.requiresReview) {
    return { status: "REQUIRES_REVIEW", differences };
  }
  if (hasProvisional) {
    return {
      status: differences.length ? "PROVISIONAL" : "PROVISIONAL",
      differences,
    };
  }
  if (differences.length === 0) {
    return { status: "MATCH", differences: [] };
  }
  return { status: "DIFFERENCES", differences };
}
