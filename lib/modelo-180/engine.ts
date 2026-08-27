import { resolve115WithholdingPeriod } from "@/lib/modelo-115/period";
import { assemble180Records, compute180Summary } from "@/lib/modelo-180/boxes";
import { collectEffective180Withholdings } from "@/lib/modelo-180/collect";
import { resolve180Deadline } from "@/lib/modelo-180/deadlines";
import { assess180FilingObligation } from "@/lib/modelo-180/filing-obligation";
import {
  reconcile115To180,
  type Quarter115SnapshotInput,
} from "@/lib/modelo-180/reconcile";
import type {
  Model180LeaseRef,
  Model180Outcome,
  Model180Result,
  Model180WithholdingRow,
} from "@/lib/modelo-180/types";
import { MODEL180_SCOPE_NOTE } from "@/lib/modelo-180/types";

export type BuildModel180Input = {
  year: number;
  withholdings: Model180WithholdingRow[];
  leases: Model180LeaseRef[];
  censusModel180?: string | null;
  censusModel115?: string | null;
  quarters115?: Quarter115SnapshotInput[];
};

function resolveOutcome(opts: {
  hasOps: boolean;
  requiresReview: boolean;
}): Model180Outcome {
  if (opts.requiresReview) return "REQUIRES_REVIEW";
  if (!opts.hasOps) return "NO_RELEVANT_PAYMENTS";
  return "READY";
}

export function buildModel180(input: BuildModel180Input): Model180Result {
  const leasesById = new Map(input.leases.map((l) => [l.id, l]));
  const warnings = [];

  const collected = collectEffective180Withholdings({
    withholdings: input.withholdings,
    leasesById,
    year: input.year,
  });
  warnings.push(...collected.warnings);

  const quarterById = new Map<string, number>();
  for (const w of collected.included) {
    const r = resolve115WithholdingPeriod(w);
    if (r.ok) quarterById.set(w.id, r.quarter);
  }

  const records = assemble180Records(
    collected.included,
    leasesById,
    quarterById
  );
  const summary = compute180Summary(records);

  const requiresReview =
    collected.missingPaymentDate.length > 0 ||
    warnings.some((w) => w.severity === "ERROR") ||
    records.some((r) => !r.leaseId);

  const hasOps = collected.included.length > 0;
  const hasActiveLeaseWithoutRent = input.leases.some(
    (l) =>
      l.active &&
      !collected.included.some((w) => w.leaseId === l.id)
  );

  const filingObligation = assess180FilingObligation({
    censusModel180: input.censusModel180 ?? "UNKNOWN",
    hasRelevantRentPayments: hasOps,
    totalWithholdingAmount: summary.totalWithholdingAmount,
    requiresReview,
    hasActiveLeaseWithoutRent,
    censusModel115: input.censusModel115,
  });

  const quarters =
    input.quarters115 ??
    ([1, 2, 3, 4] as const).map((q) => ({
      quarter: q,
      baseAmount: 0,
      withholdingAmount: 0,
      presented: false,
      withholdingIds: [] as string[],
      byLease: [],
    }));

  const reconciliation = reconcile115To180({
    year: input.year,
    quarters,
    annualRecords: records,
    annualSummary: summary,
    annualIncludedIds: collected.included.map((w) => w.id),
    requiresReview,
  });

  if (reconciliation.status === "DIFFERENCES") {
    warnings.push({
      code: "MODEL180_115_RECONCILIATION_DIFFERENCE",
      message: `Conciliación 115↔180: Δ base ${reconciliation.baseDelta}, Δ retenciones ${reconciliation.withholdingDelta}.`,
      severity: "WARNING",
    });
  }

  return {
    year: input.year,
    label: `Año ${input.year}`,
    scopeNote: MODEL180_SCOPE_NOTE,
    summary,
    records,
    warnings,
    requiresReview,
    outcome: resolveOutcome({ hasOps, requiresReview }),
    filingObligation,
    deadline: resolve180Deadline(input.year),
    reconciliation,
    excludedMissingPaymentDate: collected.missingPaymentDate,
    includedWithholdingIds: collected.included.map((w) => w.id),
  };
}
