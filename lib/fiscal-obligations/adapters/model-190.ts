import { assess190FilingObligation } from "@/lib/modelo-190/filing-obligation";
import { resolve190Deadline } from "@/lib/modelo-190/deadlines";
import { resolveFilingStatus } from "@/lib/fiscal-obligations/filing-status";
import type {
  CensusMismatch,
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationStatus,
  ObligationStatusSource,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

export function adapt190Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  hasRelevantPerceptions: boolean | null;
  totalWithholdingAmount?: number;
  requiresReview?: boolean;
  hasEmployees?: string | null;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model190;
  const hasOps =
    opts.hasRelevantPerceptions == null
      ? null
      : Boolean(opts.hasRelevantPerceptions);

  const assessed =
    hasOps == null
      ? null
      : assess190FilingObligation({
          censusModel190: census,
          hasRelevantPerceptions: hasOps,
          totalWithholdingAmount: opts.totalWithholdingAmount ?? 0,
          requiresReview: Boolean(opts.requiresReview),
          hasEmployees:
            opts.hasEmployees ?? opts.profile.facts.hasEmployees,
          censusModel111: opts.profile.obligations.model111,
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
    reason = assessed.reasons.join(" ") || `Modelo 190 · ${assessed.status}`;
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
    reason = "Sin señal operativa de retenciones 190 para el año.";
    reasonCodes.push("190_OPS_UNKNOWN");
  }

  const deadline = resolve190Deadline(opts.year);
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
      code: "CENSUS_MODEL190_MISMATCH",
      model: "190",
      severity: "WARNING",
      title: "Mismatch censal Modelo 190",
      description:
        "Hay retenciones profesionales anuales, pero censusModel190 = NO.",
    };
  } else if (hasOps && census === "UNKNOWN") {
    mismatch = {
      code: "MODEL190_OBLIGATION_REVIEW_REQUIRED",
      model: "190",
      severity: "WARNING",
      title: "Revisar obligación Modelo 190",
      description:
        "Hay operaciones 190 y el censo está en UNKNOWN. Confirma el 036.",
    };
  }

  return {
    entry: {
      model: "190",
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
