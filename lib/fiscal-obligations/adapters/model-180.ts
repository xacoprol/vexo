import { assess180FilingObligation } from "@/lib/modelo-180/filing-obligation";
import { resolve180Deadline } from "@/lib/modelo-180/deadlines";
import { resolveFilingStatus } from "@/lib/fiscal-obligations/filing-status";
import type {
  CensusMismatch,
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationStatus,
  ObligationStatusSource,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

export function adapt180Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  hasRelevantRentPayments: boolean | null;
  totalWithholdingAmount?: number;
  requiresReview?: boolean;
  hasActiveLeaseWithoutRent?: boolean;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model180;
  const hasOps =
    opts.hasRelevantRentPayments == null
      ? null
      : Boolean(opts.hasRelevantRentPayments);

  const assessed =
    hasOps == null
      ? null
      : assess180FilingObligation({
          censusModel180: census,
          hasRelevantRentPayments: hasOps,
          totalWithholdingAmount: opts.totalWithholdingAmount ?? 0,
          requiresReview: Boolean(opts.requiresReview),
          hasActiveLeaseWithoutRent: opts.hasActiveLeaseWithoutRent,
          censusModel115: opts.profile.obligations.model115,
        });

  let obligationStatus: ObligationStatus;
  let statusSource: ObligationStatusSource;
  let reason: string;
  const reasonCodes: string[] = [];
  const warnings: string[] = [];
  let operationsSignal: OperationsSignal;

  if (assessed) {
    obligationStatus = assessed.status;
    operationsSignal = assessed.operationsSignal;
    reason = assessed.reasons.join(" ") || `Modelo 180 · ${assessed.status}`;
    reasonCodes.push(...assessed.reasonCodes);
    statusSource =
      assessed.status === "REQUIRED"
        ? "COMBINED"
        : assessed.censusSignal === "NO"
          ? "CENSUS"
          : assessed.status === "UNKNOWN"
            ? "INSUFFICIENT_DATA"
            : "RESOLVER";
    warnings.push(...assessed.reasons.slice(1));
  } else {
    operationsSignal = "UNKNOWN";
    obligationStatus = "UNKNOWN";
    statusSource = "INSUFFICIENT_DATA";
    reason = "Sin señal operativa de retenciones 180 para el año.";
    reasonCodes.push("180_OPS_UNKNOWN");
  }

  const deadline = resolve180Deadline(opts.year);
  const filingStatus = resolveFilingStatus({
    obligationStatus,
    filed: opts.filed,
    filingId: opts.filingId,
    dueDate: deadline.dueDate,
    dueDateReliable: true,
    now: opts.now,
  });

  let mismatch: CensusMismatch | null = null;
  if (hasOps && census === "NO") {
    mismatch = {
      code: "CENSUS_MODEL180_MISMATCH",
      model: "180",
      severity: "WARNING",
      title: "Mismatch censal Modelo 180",
      description:
        "Hay retenciones de alquiler anuales, pero censusModel180 = NO.",
    };
  } else if (hasOps && census === "UNKNOWN") {
    mismatch = {
      code: "MODEL180_OBLIGATION_REVIEW_REQUIRED",
      model: "180",
      severity: "WARNING",
      title: "Revisar obligación Modelo 180",
      description:
        "Hay operaciones 180 y el censo está en UNKNOWN. Confirma el 036.",
    };
  }

  return {
    entry: {
      model: "180",
      domain: "AEAT",
      period: {
        year: opts.year,
        quarter: null,
        label: `Año ${opts.year}`,
      },
      obligationStatus,
      reason,
      reasonCodes,
      statusSource,
      censusSignal: census,
      operationsSignal,
      filingStatus,
      dueDate: deadline.dueDate,
      dueDateReliable: true,
      filingId: opts.filingId,
      warnings,
    },
    mismatch,
  };
}
