import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import { hasFiscalSnapshotV1 } from "@/lib/fiscal-snapshot";
import type {
  EnginePresentedPair,
  ModelDifferenceKind,
  PeriodReconciliationIssue,
  ReconciliationStatus,
} from "@/lib/fiscal-validation/types";

/**
 * Compara motor vs FiscalFiling sin sobrescribir histórico.
 * Distingue legacy, rectificativa explicada, drift post-filing y diferencia real.
 */
export function compareEngineToPresented(
  pair: EnginePresentedPair & {
    /** Operaciones del periodo incorporadas tras filedAt (evidencia temporal). */
    postFilingDataDetected?: boolean;
    postFilingAddedCount?: number;
    /** Hash/snapshot drift cuando existe fiscalSnapshotV1. */
    bookChangedAfterFiling?: boolean;
  }
): {
  difference: number | null;
  differenceKind: ModelDifferenceKind;
  reconciliationStatus: ReconciliationStatus;
  issues: PeriodReconciliationIssue[];
} {
  const issues: PeriodReconciliationIssue[] = [];

  if (!pair.presented) {
    return {
      difference: null,
      differenceKind: "none",
      reconciliationStatus: "NO_FILING",
      issues: [],
    };
  }

  if (pair.legacyLimited || !pair.snapshotAvailable) {
    if (pair.engineResult == null) {
      issues.push({
        code: "LEGACY_FILING_COMPARISON_LIMITED",
        model: pair.model,
        severity: "INFO",
        message:
          "La comparación es limitada porque este filing no contiene snapshot estructurado.",
      });
      return {
        difference: null,
        differenceKind: "legacy_limited",
        reconciliationStatus: "LEGACY_LIMITED",
        issues,
      };
    }
  }

  if (pair.engineResult == null) {
    return {
      difference: null,
      differenceKind: "unknown",
      reconciliationStatus: "REQUIRES_REVIEW",
      issues: [
        {
          code: "ENGINE_RESULT_UNAVAILABLE",
          model: pair.model,
          severity: "WARNING",
          message: `Sin resultado de motor para ${pair.model}.`,
        },
      ],
    };
  }

  const presentedResult = Number(pair.presented.result) || 0;
  const difference = round2(pair.engineResult - presentedResult);

  if (moneyEqual(difference, 0) && !pair.bookChangedAfterFiling) {
    return {
      difference: 0,
      differenceKind: "none",
      reconciliationStatus: "MATCH",
      issues: [],
    };
  }

  if (pair.explainedRectification) {
    issues.push({
      code: "FILING_DIVERGENCE_EXPLAINED_RECTIFICATION",
      model: pair.model,
      severity: "INFO",
      message:
        "Diferencia explicada: existe rectificativa posterior a la presentación. El filing histórico no se sobrescribe.",
      explained: true,
    });
    return {
      difference,
      differenceKind: "explained_rectification",
      reconciliationStatus: "EXPLAINED_RECTIFICATION",
      issues,
    };
  }

  if (pair.bookChangedAfterFiling && pair.snapshotAvailable) {
    issues.push({
      code: "CURRENT_BOOK_CHANGED_AFTER_FILING",
      model: pair.model,
      severity: "WARNING",
      message:
        "El libro actual ha cambiado desde la presentación (sources/hash del snapshot).",
      explained: true,
    });
    return {
      difference,
      differenceKind: "post_presentation_change",
      reconciliationStatus: "CURRENT_BOOK_CHANGED_AFTER_FILING",
      issues,
    };
  }

  if (pair.legacyLimited) {
    if (pair.postFilingDataDetected) {
      issues.push({
        code: "POST_FILING_DATA_DETECTED",
        model: pair.model,
        severity: "INFO",
        message: pair.postFilingAddedCount
          ? `El libro actual ha cambiado desde la presentación. ${pair.postFilingAddedCount} operación(es) del periodo se incorporaron después.`
          : "El libro actual incluye operaciones del periodo incorporadas después de la presentación.",
        explained: true,
      });
    }
    issues.push({
      code: "LEGACY_FILING_COMPARISON_LIMITED",
      model: pair.model,
      severity: "WARNING",
      message:
        "La comparación es limitada porque este filing no contiene snapshot estructurado.",
    });
    return {
      difference,
      differenceKind: "legacy_limited",
      reconciliationStatus: "LEGACY_LIMITED",
      issues,
    };
  }

  issues.push({
    code: "FILING_MOTOR_DIFFERENCE",
    model: pair.model,
    severity: "WARNING",
    message: `Motor (${pair.engineResult}) ≠ presentado (${presentedResult}). Delta ${difference}.`,
  });

  return {
    difference,
    differenceKind: "amount",
    reconciliationStatus: "UNEXPLAINED_DIFFERENCE",
    issues,
  };
}

export function aggregateReconciliationStatus(
  statuses: ReconciliationStatus[]
): ReconciliationStatus {
  if (statuses.includes("UNEXPLAINED_DIFFERENCE")) {
    return "UNEXPLAINED_DIFFERENCE";
  }
  if (statuses.includes("POTENTIAL_AMENDMENT_REQUIRED")) {
    return "POTENTIAL_AMENDMENT_REQUIRED";
  }
  if (statuses.includes("CURRENT_BOOK_CHANGED_AFTER_FILING")) {
    return "CURRENT_BOOK_CHANGED_AFTER_FILING";
  }
  if (statuses.includes("REQUIRES_REVIEW")) return "REQUIRES_REVIEW";
  if (statuses.includes("DIFFERENCES")) return "DIFFERENCES";
  if (statuses.includes("LEGACY_LIMITED")) return "LEGACY_LIMITED";
  if (statuses.includes("EXPLAINED_RECTIFICATION")) {
    return "EXPLAINED_RECTIFICATION";
  }
  if (statuses.includes("PROVISIONAL")) return "PROVISIONAL";
  if (statuses.every((s) => s === "NO_FILING" || s === "MATCH")) {
    return statuses.some((s) => s === "MATCH") ? "MATCH" : "PROVISIONAL";
  }
  return "PROVISIONAL";
}

export function hasStructuredSnapshot(
  model: string,
  rawExtract: unknown
): boolean {
  if (hasFiscalSnapshotV1(rawExtract, model)) return true;
  if (!rawExtract || typeof rawExtract !== "object") return false;
  const o = rawExtract as Record<string, unknown>;
  const keys: Record<string, string> = {
    "111": "model111Snapshot",
    "115": "model115Snapshot",
    "180": "model180Snapshot",
    "190": "model190Snapshot",
    "349": "model349Snapshot",
    "347": "model347Snapshot",
    "390": "model390Snapshot",
    "303": "model303Snapshot",
    "130": "model130Snapshot",
  };
  const key = keys[model];
  if (!key) return false;
  const snap = o[key];
  if (!snap || typeof snap !== "object") return false;
  // Snapshot OCR legacy pobre (solo version) cuenta; fiscalSnapshotV1 ya cubierto arriba.
  return true;
}
