import { resolve111WithholdingPeriod } from "@/lib/modelo-111/period";
import { assemble190Records, compute190Summary } from "@/lib/modelo-190/boxes";
import { collectEffectiveProfessionalWithholdings } from "@/lib/modelo-190/collect";
import { resolve190Deadline } from "@/lib/modelo-190/deadlines";
import { assess190FilingObligation } from "@/lib/modelo-190/filing-obligation";
import {
  reconcile111To190,
  type Quarter111SnapshotInput,
} from "@/lib/modelo-190/reconcile";
import type {
  Model190Outcome,
  Model190Result,
  Model190WithholdingRow,
} from "@/lib/modelo-190/types";
import {
  MODEL190_SCOPE_NOTE,
  MODEL190_SUPPORTED_SECTIONS,
} from "@/lib/modelo-190/types";

export type BuildModel190Input = {
  year: number;
  withholdings: Model190WithholdingRow[];
  censusModel190?: string | null;
  censusModel111?: string | null;
  hasEmployees?: string | null;
  /** Datos 111 por trimestre (motor o snapshot presentado). */
  quarters111?: Quarter111SnapshotInput[];
};

function resolveOutcome(opts: {
  hasOps: boolean;
  requiresReview: boolean;
}): Model190Outcome {
  if (opts.requiresReview) return "REQUIRES_REVIEW";
  if (!opts.hasOps) return "NO_RELEVANT_PAYMENTS";
  return "READY";
}

export function buildModel190(input: BuildModel190Input): Model190Result {
  const warnings = [];
  const hasEmployees = String(input.hasEmployees ?? "UNKNOWN").toUpperCase();

  if (hasEmployees === "YES") {
    warnings.push({
      code: "MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED",
      message:
        "hasEmployees=YES: faltan percepciones de trabajo. El 190 no puede considerarse definitivo.",
      severity: "ERROR" as const,
    });
  }

  const collected = collectEffectiveProfessionalWithholdings({
    withholdings: input.withholdings,
    year: input.year,
  });
  warnings.push(...collected.warnings);

  const quarterById = new Map<string, number>();
  for (const w of collected.included) {
    const r = resolve111WithholdingPeriod(w);
    if (r.ok) quarterById.set(w.id, r.quarter);
  }

  const records = assemble190Records(collected.included, quarterById);
  const summary = compute190Summary(records);

  const classificationMissing = records.some((r) => r.classificationMissing);
  const hasPayeeIssues = warnings.some(
    (w) =>
      w.code === "MODEL190_PAYEE_ID_MISSING" ||
      w.code === "MODEL190_PAYMENT_DATE_MISSING" ||
      w.code === "MODEL190_UNSUPPORTED_SECTION"
  );

  const requiresReview =
    hasEmployees === "YES" ||
    classificationMissing ||
    hasPayeeIssues ||
    collected.missingPaymentDate.length > 0 ||
    warnings.some((w) => w.severity === "ERROR");

  const hasOps = collected.included.length > 0;
  const filingObligation = assess190FilingObligation({
    censusModel190: input.censusModel190 ?? "UNKNOWN",
    hasRelevantPerceptions: hasOps,
    totalWithholdingAmount: summary.totalWithholdingAmount,
    requiresReview,
    hasEmployees: input.hasEmployees,
    censusModel111: input.censusModel111,
  });

  const quarters =
    input.quarters111 ??
    ([1, 2, 3, 4] as const).map((q) => ({
      quarter: q,
      perceptionAmount: 0,
      withholdingAmount: 0,
      presented: false,
      withholdingIds: [] as string[],
      byCounterparty: [],
    }));

  const reconciliation = reconcile111To190({
    year: input.year,
    quarters,
    annualRecords: records,
    annualSummary: summary,
    annualIncludedIds: collected.included.map((w) => w.id),
    requiresReview,
  });

  if (reconciliation.status === "DIFFERENCES") {
    warnings.push({
      code: "MODEL190_111_RECONCILIATION_DIFFERENCE",
      message: `Conciliación 111↔190: Δ percepciones ${reconciliation.perceptionDelta}, Δ retenciones ${reconciliation.withholdingDelta}.`,
      severity: "WARNING",
    });
  }

  const outcome = resolveOutcome({ hasOps, requiresReview });
  const deadline = resolve190Deadline(input.year);

  return {
    year: input.year,
    label: `Año ${input.year}`,
    scopeNote: MODEL190_SCOPE_NOTE,
    supportedSections: MODEL190_SUPPORTED_SECTIONS,
    summary,
    records,
    warnings,
    requiresReview,
    outcome,
    filingObligation,
    deadline,
    reconciliation,
    excludedMissingPaymentDate: collected.missingPaymentDate,
    includedWithholdingIds: collected.included.map((w) => w.id),
  };
}
