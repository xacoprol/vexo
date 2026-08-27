import type { FiscalQuarter } from "@/lib/fiscal";
import { compareResolverVsCensus } from "@/lib/fiscal-obligations/compare-census";
import {
  resolveFilingStatus,
  resolveObligationDueDate,
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
 * 349: operationsSignal SEPARADO de obligationStatus.
 * ZERO_OPS ≠ NOT_APPLICABLE / NOT_REQUIRED.
 */
export function adapt349Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  quarter: FiscalQuarter;
  hasOps: boolean | null;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model349;

  const operationsSignal: OperationsSignal =
    opts.hasOps == null ? "UNKNOWN" : opts.hasOps ? "HAS_OPS" : "ZERO_OPS";

  let obligationStatus: ObligationStatus;
  let statusSource: ObligationStatusSource;
  let reason: string;
  const reasonCodes: string[] = [];
  const warnings: string[] = [];

  if (census === "NO") {
    obligationStatus = "NOT_APPLICABLE";
    statusSource = "CENSUS";
    reason = "Perfil censal: Modelo 349 = NO.";
    reasonCodes.push("CENSUS_349_NO");
    if (operationsSignal === "HAS_OPS") {
      warnings.push(
        "Hay operaciones intracomunitarias pero el censo 349 = NO — revisar ROI/036."
      );
    }
  } else if (census === "YES") {
    // Obligación censal periódica: NO degradar a NOT_REQUIRED por zero ops
    obligationStatus = "REQUIRED";
    statusSource = "CENSUS";
    reason =
      operationsSignal === "ZERO_OPS"
        ? "Censo 349 = YES. Sin operaciones este período (no implica ausencia de obligación)."
        : "Censo 349 = YES.";
    reasonCodes.push("CENSUS_349_YES");
    if (operationsSignal === "ZERO_OPS") {
      reasonCodes.push("ZERO_OPS_NOT_EXEMPT");
      warnings.push(
        "Sin operaciones este período: la obligación censal sigue vigente hasta confirmar baja."
      );
    }
  } else {
    // census UNKNOWN
    if (operationsSignal === "HAS_OPS") {
      obligationStatus = "REQUIRED";
      statusSource = "OPERATIONS";
      reason =
        "Hay operaciones intracomunitarias; censo 349 UNKNOWN — presenta y confirma ROI.";
      reasonCodes.push("HAS_OPS", "CENSUS_349_UNKNOWN");
      warnings.push("Completa el perfil censal 349.");
    } else if (operationsSignal === "ZERO_OPS") {
      obligationStatus = "UNKNOWN";
      statusSource = "INSUFFICIENT_DATA";
      reason =
        "Sin operaciones este período y censo 349 UNKNOWN. No se infiere NOT_APPLICABLE.";
      reasonCodes.push("ZERO_OPS", "CENSUS_349_UNKNOWN");
    } else {
      obligationStatus = "UNKNOWN";
      statusSource = "INSUFFICIENT_DATA";
      reason = "Datos insuficientes para determinar obligación 349.";
      reasonCodes.push("349_UNKNOWN");
    }
  }

  const due = resolveObligationDueDate({
    model: "349",
    year: opts.year,
    quarter: opts.quarter,
  });
  const filingStatus = resolveFilingStatus({
    obligationStatus,
    filed: opts.filed,
    filingId: opts.filingId,
    dueDate: due.dueDate,
    dueDateReliable: due.reliable,
    now: opts.now,
  });

  const mismatch = compareResolverVsCensus({
    model: "349",
    resolverStatus: obligationStatus,
    censusSignal: census,
  });
  if (mismatch) warnings.push(mismatch.description);

  return {
    entry: {
      model: "349",
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
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      filingId: opts.filingId,
      warnings,
    },
    mismatch,
  };
}
