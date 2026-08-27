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
} from "@/lib/fiscal-obligations/types";

/**
 * 303: combina censusModel303 + vatPeriodicity.
 * No sobreafirma REQUIRED si faltan hechos.
 * No altera el cálculo del borrador 303.
 */
export function adapt303Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  quarter: FiscalQuarter;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model303;
  const periodicity = opts.profile.facts.vatPeriodicity;

  let obligationStatus: ObligationStatus;
  let statusSource: ObligationStatusSource;
  let reason: string;
  const reasonCodes: string[] = [];

  if (census === "NO") {
    obligationStatus = "NOT_APPLICABLE";
    statusSource = "CENSUS";
    reason = "Perfil censal: Modelo 303 = NO.";
    reasonCodes.push("CENSUS_303_NO");
  } else if (periodicity === "UNKNOWN" && census === "UNKNOWN") {
    obligationStatus = "UNKNOWN";
    statusSource = "INSUFFICIENT_DATA";
    reason =
      "Falta periodicidad IVA y el censo 303 está en UNKNOWN. Completa Ajustes.";
    reasonCodes.push("VAT_PERIODICITY_UNKNOWN", "CENSUS_303_UNKNOWN");
  } else if (periodicity === "UNKNOWN" && census === "YES") {
    obligationStatus = "REQUIRED";
    statusSource = "CENSUS";
    reason =
      "Censo 303 = YES; periodicidad IVA desconocida (revisar si es trimestral o mensual).";
    reasonCodes.push("CENSUS_303_YES", "VAT_PERIODICITY_UNKNOWN");
  } else if (periodicity === "QUARTERLY" || periodicity === "MONTHLY") {
    obligationStatus = "REQUIRED";
    statusSource = census === "YES" ? "COMBINED" : "RESOLVER";
    reason = `IVA ${periodicity === "MONTHLY" ? "mensual" : "trimestral"}: autoliquidación 303.`;
    reasonCodes.push(`VAT_${periodicity}`);
  } else if (census === "YES") {
    obligationStatus = "REQUIRED";
    statusSource = "CENSUS";
    reason = "Perfil censal: Modelo 303 = YES.";
    reasonCodes.push("CENSUS_303_YES");
  } else {
    obligationStatus = "UNKNOWN";
    statusSource = "INSUFFICIENT_DATA";
    reason = "Datos insuficientes para determinar obligación 303.";
    reasonCodes.push("303_UNKNOWN");
  }

  const due = resolveObligationDueDate({
    model: "303",
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
    model: "303",
    resolverStatus: obligationStatus,
    censusSignal: census,
  });

  return {
    entry: {
      model: "303",
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
      operationsSignal: "UNKNOWN",
      filingStatus,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      filingId: opts.filingId,
      warnings: mismatch ? [mismatch.description] : [],
    },
    mismatch,
  };
}
