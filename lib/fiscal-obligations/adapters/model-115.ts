import type { FiscalQuarter } from "@/lib/fiscal";
import { assess115FilingObligation } from "@/lib/modelo-115/filing-obligation";
import { resolve115Deadline } from "@/lib/modelo-115/deadlines";
import { resolveModel115Periodicity } from "@/lib/modelo-115/period";
import { resolveFilingStatus } from "@/lib/fiscal-obligations/filing-status";
import type {
  CensusMismatch,
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationStatus,
  ObligationStatusSource,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

export function adapt115Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  quarter: FiscalQuarter;
  hasRelevantPayments: boolean | null;
  totalWithholdingAmount?: number;
  hasSubjectBaseWithZeroWithholding?: boolean;
  requiresReview?: boolean;
  hasLeaseWithholdingUnknown?: boolean;
  model115Periodicity?: string | null;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model115;
  const { periodicity } = resolveModel115Periodicity(
    opts.model115Periodicity ?? "UNKNOWN"
  );

  const hasOps =
    opts.hasRelevantPayments == null
      ? null
      : Boolean(opts.hasRelevantPayments);

  const assessed =
    hasOps == null
      ? null
      : assess115FilingObligation({
          censusModel115: census,
          hasRelevantPayments: hasOps,
          totalWithholdingAmount: opts.totalWithholdingAmount ?? 0,
          hasSubjectBaseWithZeroWithholding: Boolean(
            opts.hasSubjectBaseWithZeroWithholding
          ),
          requiresReview: Boolean(opts.requiresReview),
          hasLeaseWithholdingUnknown: opts.hasLeaseWithholdingUnknown,
          rentsBusinessPremises: opts.profile.facts.rentsBusinessPremises,
          businessRentSubjectToWithholding:
            opts.profile.facts.businessRentSubjectToWithholding,
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
    reason = assessed.reasons.join(" ") || `Modelo 115 · ${assessed.status}`;
    reasonCodes.push(...assessed.reasonCodes);
    statusSource =
      assessed.status === "REQUIRED" && assessed.operationsSignal === "HAS_OPS"
        ? assessed.censusSignal === "UNKNOWN"
          ? "OPERATIONS"
          : "COMBINED"
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
    reason = "Sin señal operativa de retenciones 115 para el período.";
    reasonCodes.push("115_OPS_UNKNOWN");
  }

  const deadline = resolve115Deadline({
    year: opts.year,
    quarter: opts.quarter,
    periodicity,
  });

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
      code: "CENSUS_MODEL115_MISMATCH",
      model: "115",
      severity: "WARNING",
      title: "Mismatch censal Modelo 115",
      description:
        "Hay retenciones practicadas de alquiler, pero censusModel115 = NO.",
    };
  } else if (hasOps && census === "UNKNOWN") {
    mismatch = {
      code: "MODEL115_OBLIGATION_REVIEW_REQUIRED",
      model: "115",
      severity: "WARNING",
      title: "Revisar obligación Modelo 115",
      description:
        "Hay operaciones 115 y el censo está en UNKNOWN. Confirma el 036.",
    };
  } else if (hasOps === false && census === "YES") {
    mismatch = {
      code: "MODEL115_OBLIGATION_REVIEW_REQUIRED",
      model: "115",
      severity: "INFO",
      title: "Revisar continuidad censal 115",
      description:
        "Censo 115 = YES sin rentas relevantes este período. Revisa baja/continuidad; no se exige 115 a cero automáticamente.",
    };
  }

  return {
    entry: {
      model: "115",
      domain: "AEAT",
      period: {
        year: opts.year,
        quarter: opts.quarter,
        label: `${opts.quarter}T ${opts.year}`,
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
