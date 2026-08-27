import type { FiscalPeriodValidation } from "@/lib/fiscal-validation/types";

export function readinessLabel(
  status: FiscalPeriodValidation["readiness"]["status"]
): string {
  switch (status) {
    case "READY":
      return "LISTO";
    case "READY_WITH_WARNINGS":
      return "LISTO CON AVISOS";
    case "NOT_READY":
      return "NO LISTO";
    case "INCOMPLETE":
      return "DATOS INCOMPLETOS";
    default:
      return status;
  }
}

export function lifecycleLabel(
  status: FiscalPeriodValidation["lifecycle"]["status"]
): string {
  switch (status) {
    case "CLOSED":
      return "CIERRE COMPLETO";
    case "FILED":
      return "PRESENTADO";
    case "READY_FOR_SUBMISSION":
      return "LISTO PARA ENVÍO";
    case "STALE_REVIEW":
      return "REVISIÓN OBSOLETA";
    case "READY_TO_FILE":
      return "LISTO PARA PRESENTAR";
    case "OPEN":
      return "ABIERTO";
    default:
      return status;
  }
}

export function obligationStatusLabel(status: string): string {
  switch (status) {
    case "REQUIRED":
      return "OBLIGATORIO";
    case "NOT_REQUIRED":
      return "NO OBLIGATORIO";
    case "NOT_APPLICABLE":
      return "NO APLICA";
    case "UNKNOWN":
      return "REQUIERE REVISIÓN";
    default:
      return status;
  }
}

export function filingStatusLabel(status: string): string {
  switch (status) {
    case "FILED":
      return "PRESENTADO";
    case "DUE":
      return "PENDIENTE";
    case "UPCOMING":
      return "BORRADOR / PRÓXIMO";
    case "OVERDUE":
      return "FUERA DE PLAZO";
    case "REQUIRES_REVIEW":
      return "REVISAR";
    default:
      return status;
  }
}

export function reconciliationLabel(status: string): string {
  switch (status) {
    case "MATCH":
      return "Coincide";
    case "DIFFERENCES":
      return "Diferencias";
    case "EXPLAINED_RECTIFICATION":
      return "Diferencia explicada (rectificativa)";
    case "LEGACY_LIMITED":
      return "Comparación limitada (legacy)";
    case "CURRENT_BOOK_CHANGED_AFTER_FILING":
      return "Libro actual cambió tras presentar";
    case "POTENTIAL_AMENDMENT_REQUIRED":
      return "Revisión: posible enmienda del periodo";
    case "UNEXPLAINED_DIFFERENCE":
      return "Diferencia sin explicar";
    case "NO_FILING":
      return "Sin presentación";
    case "PROVISIONAL":
      return "Provisional";
    case "REQUIRES_REVIEW":
      return "Requiere revisión";
    default:
      return status;
  }
}

/** Modelos a destacar en UI de cierre trimestral. */
export function visibleQuarterModels(
  validation: FiscalPeriodValidation
): FiscalPeriodValidation["models"] {
  return validation.models.filter(
    (m) =>
      m.obligationStatus === "REQUIRED" ||
      m.obligationStatus === "UNKNOWN" ||
      m.operationsSignal === "HAS_OPS" ||
      m.filingStatus === "FILED" ||
      m.blockers.length > 0
  );
}
