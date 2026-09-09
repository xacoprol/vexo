/**
 * Coherencia ejercicio fiscal: trimestres ↔ anuales (Fase 3).
 */

import type { FiscalQuarter } from "@/lib/fiscal";
import type {
  FilingStatus,
  ObligationStatus,
} from "@/lib/fiscal-obligations/types";
import {
  createUnsupportedFiscalCase,
  type UnsupportedFiscalCase,
} from "@/lib/fiscal-unsupported";

export type QuarterObligationView = {
  model: "130" | "303" | "111" | "115" | "349";
  quarter: FiscalQuarter;
  obligationStatus: ObligationStatus;
  filingStatus: FilingStatus;
  hasOps?: boolean;
};

export type AnnualObligationView = {
  model: "180" | "190" | "347" | "390";
  obligationStatus: ObligationStatus;
  filingStatus: FilingStatus;
};

export type FiscalYearCoherenceIssue = {
  code: string;
  severity: "CRITICAL" | "ERROR" | "WARNING";
  blocksFiling: boolean;
  models: string[];
  title: string;
  description: string;
};

export type FiscalYearOverview = {
  year: number;
  closedQuarters: FiscalQuarter[];
  openQuarters: FiscalQuarter[];
  applicableAnnuals: AnnualObligationView[];
  pendingAnnuals: AnnualObligationView[];
  filedAnnuals: AnnualObligationView[];
  fiscalYearComplete: boolean;
  coherenceIssues: FiscalYearCoherenceIssue[];
  unsupported: UnsupportedFiscalCase[];
};

function isFiled(s: FilingStatus): boolean {
  return s === "FILED" || s === "FILED_LATE";
}

/**
 * Contradicciones manifiestas trimestre ↔ anual.
 */
export function detectAnnualQuarterContradictions(opts: {
  year: number;
  quarters: QuarterObligationView[];
  annuals: AnnualObligationView[];
}): FiscalYearCoherenceIssue[] {
  const issues: FiscalYearCoherenceIssue[] = [];
  const annual = (m: string) => opts.annuals.find((a) => a.model === m);

  const has115Ops = opts.quarters.some(
    (q) =>
      q.model === "115" &&
      (q.obligationStatus === "REQUIRED" || q.hasOps) &&
      q.filingStatus !== "NOT_APPLICABLE"
  );
  const a180 = annual("180");
  if (
    has115Ops &&
    a180 &&
    a180.obligationStatus === "NOT_APPLICABLE"
  ) {
    issues.push({
      code: "ANNUAL_QUARTER_CONTRADICTION_180_115",
      severity: "CRITICAL",
      blocksFiling: true,
      models: ["115", "180"],
      title: "180 NOT_APPLICABLE contradice 115 con operaciones",
      description: `${opts.year}: hay 115 REQUIRED/HAS_OPS pero el 180 anual es NOT_APPLICABLE sin explicación.`,
    });
  }

  const has111Ops = opts.quarters.some(
    (q) =>
      q.model === "111" &&
      (q.obligationStatus === "REQUIRED" || q.hasOps) &&
      q.filingStatus !== "NOT_APPLICABLE"
  );
  const a190 = annual("190");
  if (
    has111Ops &&
    a190 &&
    a190.obligationStatus === "NOT_APPLICABLE"
  ) {
    issues.push({
      code: "ANNUAL_QUARTER_CONTRADICTION_190_111",
      severity: "CRITICAL",
      blocksFiling: true,
      models: ["111", "190"],
      title: "190 NOT_APPLICABLE contradice 111 con retenciones",
      description: `${opts.year}: hay 111 con operaciones/REQUIRED pero el 190 es NOT_APPLICABLE.`,
    });
  }

  const filed303 = opts.quarters.filter(
    (q) => q.model === "303" && isFiled(q.filingStatus)
  );
  const a390 = annual("390");
  if (
    filed303.length > 0 &&
    a390 &&
    a390.obligationStatus === "NOT_APPLICABLE"
  ) {
    issues.push({
      code: "ANNUAL_QUARTER_CONTRADICTION_390_303",
      severity: "CRITICAL",
      blocksFiling: true,
      models: ["303", "390"],
      title: "390 NOT_APPLICABLE contradice 303 presentados",
      description: `${opts.year}: hay 303 presentados pero el 390 es NOT_APPLICABLE.`,
    });
  }

  if (a180?.obligationStatus === "UNKNOWN") {
    issues.push({
      code: "ANNUAL_UNKNOWN_180",
      severity: "ERROR",
      blocksFiling: true,
      models: ["180"],
      title: "180 UNKNOWN",
      description: "Obligación anual 180 indeterminada — ejercicio incompleto.",
    });
  }
  if (a190?.obligationStatus === "UNKNOWN") {
    issues.push({
      code: "ANNUAL_UNKNOWN_190",
      severity: "ERROR",
      blocksFiling: true,
      models: ["190"],
      title: "190 UNKNOWN",
      description: "Obligación anual 190 indeterminada — ejercicio incompleto.",
    });
  }

  return issues;
}

export function buildFiscalYearOverview(opts: {
  year: number;
  quarters: QuarterObligationView[];
  annuals: AnnualObligationView[];
  unsupported?: UnsupportedFiscalCase[];
}): FiscalYearOverview {
  const closedQuarters: FiscalQuarter[] = [];
  const openQuarters: FiscalQuarter[] = [];
  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const qObs = opts.quarters.filter((x) => x.quarter === q);
    const required = qObs.filter((x) => x.obligationStatus === "REQUIRED");
    const allFiled =
      required.length > 0 && required.every((x) => isFiled(x.filingStatus));
    const anyUnknown = qObs.some((x) => x.obligationStatus === "UNKNOWN");
    if (allFiled && !anyUnknown) closedQuarters.push(q);
    else openQuarters.push(q);
  }

  const applicableAnnuals = opts.annuals.filter(
    (a) =>
      a.obligationStatus === "REQUIRED" || a.obligationStatus === "UNKNOWN"
  );
  const pendingAnnuals = applicableAnnuals.filter((a) => !isFiled(a.filingStatus));
  const filedAnnuals = applicableAnnuals.filter((a) => isFiled(a.filingStatus));

  const coherenceIssues = detectAnnualQuarterContradictions(opts);
  const unsupported = opts.unsupported ?? [];

  const fiscalYearComplete =
    closedQuarters.length === 4 &&
    pendingAnnuals.length === 0 &&
    !applicableAnnuals.some((a) => a.obligationStatus === "UNKNOWN") &&
    coherenceIssues.filter((i) => i.blocksFiling).length === 0 &&
    unsupported.filter((u) => u.blocksFiling).length === 0;

  return {
    year: opts.year,
    closedQuarters,
    openQuarters,
    applicableAnnuals,
    pendingAnnuals,
    filedAnnuals,
    fiscalYearComplete,
    coherenceIssues,
    unsupported,
  };
}

/** Empleados sin soporte → caso unsupported explícito. */
export function employmentUnsupportedCase(): UnsupportedFiscalCase {
  return createUnsupportedFiscalCase({
    code: "UNSUPPORTED_190_EMPLOYMENT",
    kind: "UNSUPPORTED",
    model: "190",
    title: "Empleados / nómina no soportados",
    description:
      "VEXO solo soporta retenciones profesionales representables. No genera un 190 completo omitiendo trabajo.",
  });
}
