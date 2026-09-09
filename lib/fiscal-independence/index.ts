/**
 * Checklist de independencia operativa (Fase 3) — DTO de dominio.
 * Sin rediseño UI: responde programáticamente al estado fiscal.
 */

import type { AmendmentLifecycleStatus } from "@/lib/fiscal-amendment";
import type { FiscalCalendarEntry } from "@/lib/fiscal-calendar-complete";
import type {
  FiscalYearCoherenceIssue,
  FiscalYearOverview,
} from "@/lib/fiscal-year/overview";
import type { UnsupportedFiscalCase } from "@/lib/fiscal-unsupported";
import type { FilingStatus, ObligationStatus } from "@/lib/fiscal-obligations/types";

export type IndependenceObligationRow = {
  model: string;
  periodLabel: string;
  obligationStatus: ObligationStatus;
  filingStatus: FilingStatus;
  overdue: boolean;
  filedLate: boolean;
};

export type IndependencePeriodChecklist = {
  year: number;
  quarter: number;
  knownObligations: IndependenceObligationRow[];
  pending: IndependenceObligationRow[];
  presented: IndependenceObligationRow[];
  overdue: IndependenceObligationRow[];
  blockers: { code: string; title: string; model?: string }[];
  warnings: { code: string; title: string; model?: string }[];
  amendmentsRequired: boolean;
  amendmentStatus: AmendmentLifecycleStatus | null;
  CAN_FILE_PERIOD: boolean;
  CAN_CLOSE_PERIOD: boolean;
  PROFESSIONAL_REVIEW_REQUIRED: boolean;
};

export type IndependenceYearChecklist = {
  year: number;
  closedQuarters: number[];
  pendingAnnuals: IndependenceObligationRow[];
  filedAnnuals: IndependenceObligationRow[];
  FISCAL_YEAR_COMPLETE: boolean;
  unsupportedCases: UnsupportedFiscalCase[];
  professionalReviewCases: UnsupportedFiscalCase[];
  coherenceIssues: FiscalYearCoherenceIssue[];
  PROFESSIONAL_REVIEW_REQUIRED: boolean;
};

export type IndependenceDashboard = {
  period: IndependencePeriodChecklist;
  year: IndependenceYearChecklist;
  calendar: FiscalCalendarEntry[];
};

function isFiled(s: FilingStatus) {
  return s === "FILED" || s === "FILED_LATE";
}

export function buildIndependencePeriodChecklist(opts: {
  year: number;
  quarter: number;
  obligations: IndependenceObligationRow[];
  blockers: { code: string; title: string; model?: string; blocksFiling?: boolean }[];
  warnings: { code: string; title: string; model?: string }[];
  amendmentStatus?: AmendmentLifecycleStatus | null;
  readinessOk: boolean;
}): IndependencePeriodChecklist {
  const known = opts.obligations;
  const pending = known.filter(
    (o) =>
      (o.obligationStatus === "REQUIRED" || o.obligationStatus === "UNKNOWN") &&
      !isFiled(o.filingStatus)
  );
  const presented = known.filter((o) => isFiled(o.filingStatus));
  const overdue = known.filter((o) => o.filingStatus === "OVERDUE" || o.overdue);
  const filingBlockers = opts.blockers.filter((b) => b.blocksFiling !== false);
  const professional = opts.blockers.some(
    (b) =>
      b.code.includes("UNSUPPORTED") ||
      b.code.includes("NEEDS_PROFESSIONAL") ||
      b.code.includes("PROFESSIONAL_REVIEW")
  );
  const amendmentsRequired =
    opts.amendmentStatus === "AMENDMENT_REQUIRED" ||
    opts.amendmentStatus === "AMENDMENT_PREPARED";

  const CAN_FILE_PERIOD =
    opts.readinessOk &&
    filingBlockers.length === 0 &&
    !known.some((o) => o.obligationStatus === "UNKNOWN") &&
    !professional &&
    opts.amendmentStatus !== "AMENDMENT_REQUIRED";

  const required = known.filter((o) => o.obligationStatus === "REQUIRED");
  const CAN_CLOSE_PERIOD =
    required.length > 0 &&
    required.every((o) => isFiled(o.filingStatus)) &&
    !known.some((o) => o.obligationStatus === "UNKNOWN") &&
    !amendmentsRequired &&
    filingBlockers.length === 0;

  return {
    year: opts.year,
    quarter: opts.quarter,
    knownObligations: known,
    pending,
    presented,
    overdue,
    blockers: filingBlockers.map((b) => ({
      code: b.code,
      title: b.title,
      model: b.model,
    })),
    warnings: opts.warnings,
    amendmentsRequired,
    amendmentStatus: opts.amendmentStatus ?? null,
    CAN_FILE_PERIOD,
    CAN_CLOSE_PERIOD,
    PROFESSIONAL_REVIEW_REQUIRED: professional,
  };
}

export function buildIndependenceYearChecklist(
  overview: FiscalYearOverview
): IndependenceYearChecklist {
  const mapAnnual = (a: FiscalYearOverview["pendingAnnuals"][number]) => ({
    model: a.model,
    periodLabel: `Año ${overview.year}`,
    obligationStatus: a.obligationStatus,
    filingStatus: a.filingStatus,
    overdue: a.filingStatus === "OVERDUE",
    filedLate: a.filingStatus === "FILED_LATE",
  });
  const unsupported = overview.unsupported;
  const professional = unsupported.filter(
    (u) => u.kind === "PROFESSIONAL_REVIEW" || u.kind === "UNSUPPORTED"
  );
  return {
    year: overview.year,
    closedQuarters: overview.closedQuarters,
    pendingAnnuals: overview.pendingAnnuals.map(mapAnnual),
    filedAnnuals: overview.filedAnnuals.map(mapAnnual),
    FISCAL_YEAR_COMPLETE: overview.fiscalYearComplete,
    unsupportedCases: unsupported.filter((u) => u.kind === "UNSUPPORTED"),
    professionalReviewCases: unsupported.filter(
      (u) => u.kind === "PROFESSIONAL_REVIEW"
    ),
    coherenceIssues: overview.coherenceIssues,
    PROFESSIONAL_REVIEW_REQUIRED: professional.length > 0,
  };
}

export function buildIndependenceDashboard(opts: {
  period: IndependencePeriodChecklist;
  year: IndependenceYearChecklist;
  calendar: FiscalCalendarEntry[];
}): IndependenceDashboard {
  return {
    period: opts.period,
    year: opts.year,
    calendar: opts.calendar,
  };
}
