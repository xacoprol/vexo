import {
  resolveFilingStatus,
  resolveObligationDueDate,
} from "@/lib/fiscal-obligations/filing-status";
import type {
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationStatus,
  ObligationStatusSource,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

/**
 * 347 anual: elegibilidad por operaciones + censo.
 * ZERO_OPS no implica NOT_REQUIRED si censo = YES.
 */
export function adapt347Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  /** true si hay operadores que superan umbral / hay borrador con contenido. */
  hasDeclarableOps: boolean | null;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry } {
  const census = opts.profile.obligations.model347;
  const operationsSignal: OperationsSignal =
    opts.hasDeclarableOps == null
      ? "UNKNOWN"
      : opts.hasDeclarableOps
        ? "HAS_OPS"
        : "ZERO_OPS";

  let obligationStatus: ObligationStatus;
  let statusSource: ObligationStatusSource;
  let reason: string;
  const reasonCodes: string[] = [];
  const warnings: string[] = [];

  if (census === "NO") {
    obligationStatus = "NOT_APPLICABLE";
    statusSource = "CENSUS";
    reason = "Perfil censal: Modelo 347 = NO.";
    reasonCodes.push("CENSUS_347_NO");
  } else if (census === "YES") {
    obligationStatus = "REQUIRED";
    statusSource = "CENSUS";
    reason =
      operationsSignal === "ZERO_OPS"
        ? "Censo 347 = YES. Sin operaciones declarables detectadas (no implica ausencia de obligación)."
        : "Censo 347 = YES.";
    reasonCodes.push("CENSUS_347_YES");
  } else if (operationsSignal === "HAS_OPS") {
    obligationStatus = "REQUIRED";
    statusSource = "OPERATIONS";
    reason = "Hay operaciones potencialmente declarables en 347.";
    reasonCodes.push("HAS_OPS");
  } else if (operationsSignal === "ZERO_OPS") {
    obligationStatus = "UNKNOWN";
    statusSource = "INSUFFICIENT_DATA";
    reason =
      "Sin operaciones declarables detectadas y censo 347 UNKNOWN. No se infiere NOT_REQUIRED.";
    reasonCodes.push("ZERO_OPS", "CENSUS_347_UNKNOWN");
  } else {
    obligationStatus = "UNKNOWN";
    statusSource = "INSUFFICIENT_DATA";
    reason = "Datos insuficientes para determinar obligación 347.";
    reasonCodes.push("347_UNKNOWN");
  }

  const due = resolveObligationDueDate({
    model: "347",
    year: opts.year,
    quarter: null,
  });
  const filingStatus = resolveFilingStatus({
    obligationStatus,
    filed: opts.filed,
    filingId: opts.filingId,
    dueDate: due.dueDate,
    dueDateReliable: due.reliable,
    now: opts.now,
  });

  return {
    entry: {
      model: "347",
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
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      filingId: opts.filingId,
      warnings,
    },
  };
}
