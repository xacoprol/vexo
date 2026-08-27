import type { FiscalQuarter } from "@/lib/fiscal";
import { assess111FilingObligation } from "@/lib/modelo-111/filing-obligation";
import { resolve111Deadline } from "@/lib/modelo-111/deadlines";
import { resolveModel111Periodicity } from "@/lib/modelo-111/period";
import {
  resolveFilingStatus,
} from "@/lib/fiscal-obligations/filing-status";
import type {
  CensusMismatch,
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationStatus,
  ObligationStatusSource,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

/**
 * Adapter 111 con motor assess111FilingObligation (Fase 9.4).
 */
export function adapt111Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  quarter: FiscalQuarter;
  /** Operaciones del período (por paymentDate). null = desconocido. */
  hasRelevantPayments: boolean | null;
  totalWithholdingAmount?: number;
  hasSubjectBaseWithZeroWithholding?: boolean;
  requiresReview?: boolean;
  model111Periodicity?: string | null;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model111;
  const { periodicity } = resolveModel111Periodicity(
    opts.model111Periodicity ?? "UNKNOWN"
  );

  const hasOps =
    opts.hasRelevantPayments == null
      ? null
      : Boolean(opts.hasRelevantPayments);

  const assessed =
    hasOps == null
      ? null
      : assess111FilingObligation({
          censusModel111: census,
          hasRelevantPayments: hasOps,
          totalWithholdingAmount: opts.totalWithholdingAmount ?? 0,
          hasSubjectBaseWithZeroWithholding: Boolean(
            opts.hasSubjectBaseWithZeroWithholding
          ),
          requiresReview: Boolean(opts.requiresReview),
          paysProfessionalsSubjectToWithholding:
            opts.profile.facts.paysProfessionalsSubjectToWithholding,
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
    reason = assessed.reasons.join(" ") || `Modelo 111 · ${assessed.status}`;
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
    reason = "Sin señal operativa de retenciones 111 para el período.";
    reasonCodes.push("111_OPS_UNKNOWN");
  }

  const deadline = resolve111Deadline({
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
      code: "CENSUS_MODEL111_MISMATCH",
      model: "111",
      severity: "WARNING",
      title: "Mismatch censal Modelo 111",
      description:
        "Hay retenciones practicadas a profesionales, pero censusModel111 = NO.",
    };
  } else if (hasOps && census === "UNKNOWN") {
    mismatch = {
      code: "MODEL111_OBLIGATION_REVIEW_REQUIRED",
      model: "111",
      severity: "WARNING",
      title: "Revisar obligación Modelo 111",
      description:
        "Hay operaciones 111 y el censo está en UNKNOWN. Confirma el 036.",
    };
  } else if (hasOps === false && census === "YES") {
    mismatch = {
      code: "MODEL111_OBLIGATION_REVIEW_REQUIRED",
      model: "111",
      severity: "INFO",
      title: "Revisar continuidad censal 111",
      description:
        "Censo 111 = YES sin rentas relevantes este período. Revisa baja/continuidad; no se exige 111 a cero automáticamente.",
    };
  }

  return {
    entry: {
      model: "111",
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
