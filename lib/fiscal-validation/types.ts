/**
 * Fase 10 — Validación real / cierre de trimestre.
 * Orquesta motores existentes; no recalcula liquidaciones.
 */

import type { FiscalQuarter } from "@/lib/fiscal";
import type { FiscalHealthResult, FiscalHealthStatus } from "@/lib/fiscal-health";
import type {
  FiscalObligationEntry,
  FiscalObligationsResult,
  ObligationModelCode,
  ObligationStatus,
  FilingStatus,
} from "@/lib/fiscal-obligations/types";
import type { PresentedFilingView } from "@/lib/fiscal-filings";

export type QuarterCloseModelCode =
  | "130"
  | "303"
  | "111"
  | "115"
  | "349";

export type AnnualCloseModelCode = "180" | "190" | "347" | "390";

export type CloseModelCode = QuarterCloseModelCode | AnnualCloseModelCode;

export type ReconciliationStatus =
  | "MATCH"
  | "DIFFERENCES"
  | "PROVISIONAL"
  | "REQUIRES_REVIEW"
  | "NO_FILING"
  | "LEGACY_LIMITED"
  | "EXPLAINED_RECTIFICATION"
  | "CURRENT_BOOK_CHANGED_AFTER_FILING"
  | "POTENTIAL_AMENDMENT_REQUIRED"
  | "UNEXPLAINED_DIFFERENCE";

export type PeriodReadinessStatus =
  | "READY"
  | "READY_WITH_WARNINGS"
  | "NOT_READY"
  | "INCOMPLETE";

export type CloseLifecycleStatus =
  | "OPEN"
  | "READY_TO_FILE"
  | "READY_FOR_SUBMISSION"
  | "STALE_REVIEW"
  | "FILED"
  | "CLOSED";

export type ModelDifferenceKind =
  | "none"
  | "amount"
  | "explained_rectification"
  | "legacy_limited"
  | "post_presentation_change"
  | "unknown";

export type ModelValidationEntry = {
  model: CloseModelCode;
  domain: "AEAT";
  obligationStatus: ObligationStatus;
  operationsSignal: FiscalObligationEntry["operationsSignal"];
  filingStatus: FilingStatus;
  dueDate: Date | null;
  dueDateReliable: boolean;
  engineResult: number | null;
  presentedResult: number | null;
  difference: number | null;
  differenceKind: ModelDifferenceKind;
  reconciliationStatus: ReconciliationStatus;
  snapshotAvailable: boolean;
  presentedAt: string | null;
  filingId: string | null;
  warnings: { code: string; message: string; href?: string | null }[];
  blockers: { code: string; title: string; href?: string | null }[];
  readyToFile: boolean;
  href: string;
  notes: string[];
  /** Drift de libro tras presentación (Fase 12). */
  bookDrift?: {
    addedCount: number;
    removedCount: number;
    filedResult: number | null;
    currentResult: number | null;
    delta: number | null;
    evidenceCodes: string[];
  } | null;
};

export type PeriodReconciliationIssue = {
  code: string;
  model?: CloseModelCode;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  explained?: boolean;
};

export type FiscalPeriodValidation = {
  period: {
    year: number;
    quarter: FiscalQuarter;
    label: string;
  };
  health: Pick<
    FiscalHealthResult,
    | "status"
    | "statusLabel"
    | "summary"
    | "blockers"
    | "issues"
    | "checks"
    | "queryCount"
  >;
  obligations: FiscalObligationsResult;
  models: ModelValidationEntry[];
  reconciliation: {
    status: ReconciliationStatus;
    issues: PeriodReconciliationIssue[];
  };
  readiness: {
    status: PeriodReadinessStatus;
    blockers: { code: string; title: string; model?: string; href?: string | null }[];
    warnings: { code: string; title: string; model?: string; href?: string | null }[];
  };
  lifecycle: {
    status: CloseLifecycleStatus;
    readyToFile: boolean;
    /** Snapshot pre-filing vigente y sin drift. */
    readyForSubmission: boolean;
    closed: boolean;
    requiredModels: CloseModelCode[];
    filedRequiredModels: CloseModelCode[];
    unknownModels: CloseModelCode[];
    reason: string;
    preFiling?: {
      reviewId: string | null;
      frozenAt: string | null;
      status: string;
      drift: {
        sourceHashChanged: boolean;
        censusHashChanged: boolean;
        engineChanged: boolean;
      };
    };
  };
  /** Acciones UX deduplicadas (Fase 14). */
  closeActions?: import("@/lib/fiscal-close").FiscalCloseAction[];
  /** Preview UE opcional (Shopify etc.). */
  euReviews?: {
    expenseId: string;
    classification: string;
    currentType: string;
    suggestedType: string | null;
    reasons: string[];
    impact?: {
      delta349A: number;
      delta349I: number;
      delta303Result: number;
    };
  }[];
  performance: {
    queryCountApprox: number;
    note: string;
  };
};

export type BuildFiscalPeriodValidationInput = {
  year: number;
  quarter: FiscalQuarter;
  /** Incluir modelos anuales como contexto (no bloquean CLOSED trimestral). */
  includeAnnualContext?: boolean;
};

export type EnginePresentedPair = {
  model: CloseModelCode;
  engineResult: number | null;
  presented: PresentedFilingView | null;
  snapshotAvailable: boolean;
  explainedRectification?: boolean;
  legacyLimited?: boolean;
};
