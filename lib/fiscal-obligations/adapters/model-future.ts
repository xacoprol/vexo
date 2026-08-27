import type { FiscalQuarter } from "@/lib/fiscal";
import {
  resolveFilingStatus,
  resolveObligationDueDate,
} from "@/lib/fiscal-obligations/filing-status";
import type {
  CensusTriState,
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationModelCode,
  ObligationStatus,
  ObligationStatusSource,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

/**
 * Modelos sin motor jurídico aún (111 trimestral; 115; anuales 180/190).
 * Nunca ZERO_OPS → NOT_REQUIRED.
 */
export function adaptFutureWithholdingObligation(opts: {
  model: "111" | "115" | "180" | "190";
  profile: FiscalCensusProfile;
  year: number;
  quarter?: FiscalQuarter | null;
  /** Señales operativas conocidas (p. ej. withholdings PRACTICED). */
  operationsSignal: OperationsSignal;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): FiscalObligationEntry {
  const censusKey = {
    "111": "model111",
    "115": "model115",
    "180": "model180",
    "190": "model190",
  }[opts.model] as keyof FiscalCensusProfile["obligations"];
  const census: CensusTriState = opts.profile.obligations[censusKey];

  let obligationStatus: ObligationStatus;
  let statusSource: ObligationStatusSource;
  let reason: string;
  const reasonCodes: string[] = [];
  const warnings: string[] = [];

  if (census === "NO") {
    obligationStatus = "NOT_APPLICABLE";
    statusSource = "CENSUS";
    reason = `Perfil censal: Modelo ${opts.model} = NO.`;
    reasonCodes.push(`CENSUS_${opts.model}_NO`);
    if (opts.operationsSignal === "HAS_OPS") {
      warnings.push(
        `Hay señales operativas pero el censo ${opts.model} = NO — revisar.`
      );
    }
  } else if (census === "YES") {
    // Sin resolver jurídico: no afirmar REQUIRED automático por censo solo
    // para 111/115/180/190 — UNKNOWN con aviso (motor pendiente).
    // User asked: census YES + zero ops → NO convertir a NOT_REQUIRED
    obligationStatus = "UNKNOWN";
    statusSource = "INSUFFICIENT_DATA";
    reason = `Censo ${opts.model} = YES, pero el motor de cálculo aún no está implementado.`;
    reasonCodes.push(`CENSUS_${opts.model}_YES`, "MOTOR_PENDING");
    if (opts.operationsSignal === "ZERO_OPS") {
      reasonCodes.push("ZERO_OPS_NOT_EXEMPT");
      warnings.push(
        "Sin operaciones este período: no implica NOT_REQUIRED mientras el motor no exista."
      );
    }
  } else {
    // UNKNOWN census
    if (opts.operationsSignal === "HAS_OPS") {
      obligationStatus = "UNKNOWN";
      statusSource = "OPERATIONS";
      reason = `Hay operaciones/señales relevantes al ${opts.model}; censo UNKNOWN y motor pendiente.`;
      reasonCodes.push("HAS_OPS", "MOTOR_PENDING");
      warnings.push(`Revisa el perfil censal del Modelo ${opts.model}.`);
    } else {
      obligationStatus = "UNKNOWN";
      statusSource = "INSUFFICIENT_DATA";
      reason = `Modelo ${opts.model}: sin motor jurídico ni censo suficiente.`;
      reasonCodes.push("MOTOR_PENDING", `CENSUS_${opts.model}_UNKNOWN`);
    }
  }

  const isAnnual = opts.model === "180" || opts.model === "190";
  const due = resolveObligationDueDate({
    model: opts.model as ObligationModelCode,
    year: opts.year,
    quarter: isAnnual ? null : opts.quarter ?? null,
  });
  // dueDateReliable siempre false para estos modelos → nunca OVERDUE
  const filingStatus = resolveFilingStatus({
    obligationStatus,
    filed: opts.filed,
    filingId: opts.filingId,
    dueDate: due.dueDate,
    dueDateReliable: false,
    now: opts.now,
  });

  return {
    model: opts.model,
    domain: "AEAT",
    period: {
      year: opts.year,
      quarter: isAnnual ? null : opts.quarter ?? null,
      label: isAnnual
        ? `Año ${opts.year}`
        : opts.quarter != null
          ? `${opts.quarter}T ${opts.year}`
          : `Año ${opts.year}`,
    },
    obligationStatus,
    reason,
    reasonCodes,
    statusSource,
    censusSignal: census,
    operationsSignal: opts.operationsSignal,
    filingStatus,
    dueDate: null,
    dueDateReliable: false,
    filingId: opts.filingId,
    warnings,
  };
}
