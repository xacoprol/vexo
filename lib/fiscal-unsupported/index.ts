/**
 * Casos fiscales no soportados + revisión profesional puntual (Fase 3).
 * VEXO no cubre todo el sistema tributario; debe saber cuándo detenerse.
 */

export type UnsupportedFiscalCaseCode =
  | "UNSUPPORTED_FISCAL_CASE"
  | "NEEDS_PROFESSIONAL_REVIEW"
  | "UNSUPPORTED_347_CASE"
  | "UNSUPPORTED_390_CASE"
  | "UNSUPPORTED_190_EMPLOYMENT"
  | "UNSUPPORTED_RECC"
  | "UNSUPPORTED_PRORRATA"
  | "UNSUPPORTED_SPECIAL_REGIME";

export type UnsupportedFiscalCase = {
  code: UnsupportedFiscalCaseCode;
  /** Semántica: software OK pero cobertura insuficiente. */
  kind: "UNSUPPORTED" | "PROFESSIONAL_REVIEW";
  model: string;
  title: string;
  description: string;
  /** Entidad/operación afectada (trazable). */
  entityType?: "invoice" | "expense" | "withholding" | "lease" | "operator" | "period" | "system";
  entityId?: string;
  blocksFiling: true;
  recommendation: string;
};

const PROFESSIONAL_REC =
  "Revisión profesional puntual recomendada. No presentes hasta resolver el supuesto.";

/**
 * Códigos de warning/motor que mapean a unsupported / professional review.
 */
const MAP: Record<
  string,
  { code: UnsupportedFiscalCaseCode; kind: "UNSUPPORTED" | "PROFESSIONAL_REVIEW"; title: string }
> = {
  MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED: {
    code: "UNSUPPORTED_190_EMPLOYMENT",
    kind: "UNSUPPORTED",
    title: "190: nómina/empleados no soportados",
  },
  MODEL190_UNSUPPORTED_SECTION: {
    code: "UNSUPPORTED_190_EMPLOYMENT",
    kind: "UNSUPPORTED",
    title: "190: sección no soportada",
  },
  MODEL111_EMPLOYEE_DATA_NOT_SUPPORTED: {
    code: "UNSUPPORTED_190_EMPLOYMENT",
    kind: "UNSUPPORTED",
    title: "111/190: empleados no soportados",
  },
  VAT_RECC_ANNUAL_REVIEW_REQUIRED: {
    code: "UNSUPPORTED_RECC",
    kind: "PROFESSIONAL_REVIEW",
    title: "RECC no cerrado automáticamente",
  },
  CASH_ACCOUNTING_NOT_FULLY_SUPPORTED: {
    code: "UNSUPPORTED_RECC",
    kind: "PROFESSIONAL_REVIEW",
    title: "Criterio de caja (RECC) parcial",
  },
  MODEL347_CASH_ACCOUNTING_DATA_INCOMPLETE: {
    code: "UNSUPPORTED_347_CASE",
    kind: "UNSUPPORTED",
    title: "347: RECC incompleto",
  },
  MODEL347_REQUIRES_REVIEW: {
    code: "UNSUPPORTED_347_CASE",
    kind: "PROFESSIONAL_REVIEW",
    title: "347: casuística no segura",
  },
  MODEL390_REQUIRES_REVIEW: {
    code: "UNSUPPORTED_390_CASE",
    kind: "PROFESSIONAL_REVIEW",
    title: "390: secciones incompletas",
  },
  PRORRATA_REVIEW_REQUIRED: {
    code: "UNSUPPORTED_PRORRATA",
    kind: "PROFESSIONAL_REVIEW",
    title: "Prorrata no calculada por VEXO",
  },
  ACTIVITY_MIXED_EXEMPT_TAXABLE: {
    code: "UNSUPPORTED_PRORRATA",
    kind: "PROFESSIONAL_REVIEW",
    title: "Actividad mixta — posible prorrata",
  },
  NON_STANDARD_VAT_RATE_REVIEW_REQUIRED: {
    code: "UNSUPPORTED_SPECIAL_REGIME",
    kind: "PROFESSIONAL_REVIEW",
    title: "Tipo IVA no estándar en 303",
  },
};

export function mapWarningToUnsupportedCase(opts: {
  warningCode: string;
  model: string;
  message: string;
  entityId?: string;
  entityType?: UnsupportedFiscalCase["entityType"];
}): UnsupportedFiscalCase | null {
  const hit = MAP[opts.warningCode];
  if (!hit) return null;
  return {
    code: hit.code,
    kind: hit.kind,
    model: opts.model,
    title: hit.title,
    description: opts.message,
    entityId: opts.entityId,
    entityType: opts.entityType,
    blocksFiling: true,
    recommendation: PROFESSIONAL_REC,
  };
}

export function createUnsupportedFiscalCase(
  partial: Omit<UnsupportedFiscalCase, "blocksFiling" | "recommendation"> & {
    recommendation?: string;
  }
): UnsupportedFiscalCase {
  return {
    ...partial,
    blocksFiling: true,
    recommendation: partial.recommendation ?? PROFESSIONAL_REC,
  };
}

/** Detecta metálico / anexos alquiler 347 no representables con seguridad. */
export function assess347UnsupportedSignals(opts: {
  hasIncompleteRecc: boolean;
  hasCashPaymentHintsWithoutLedger: boolean;
  hasRentalAnnexRequired: boolean;
  hasOperatorWithoutTaxId: boolean;
}): UnsupportedFiscalCase[] {
  const out: UnsupportedFiscalCase[] = [];
  if (opts.hasIncompleteRecc) {
    out.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_347_CASE",
        kind: "UNSUPPORTED",
        model: "347",
        title: "347: RECC sin datos de cobro/pago",
        description:
          "Hay operaciones en criterio de caja sin imputación completa. VEXO no inventa fechas de cobro.",
      })
    );
  }
  if (opts.hasCashPaymentHintsWithoutLedger) {
    out.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_347_CASE",
        kind: "PROFESSIONAL_REVIEW",
        model: "347",
        title: "347: metálico sin libro específico",
        description:
          "Hay pistas de pago en metálico sin acumulado legal por operador. No se omite ni se inventa el apartado.",
      })
    );
  }
  if (opts.hasRentalAnnexRequired) {
    out.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_347_CASE",
        kind: "UNSUPPORTED",
        model: "347",
        title: "347: anexo de arrendamientos no soportado",
        description:
          "El bloque específico de arrendamientos del 347 no está modelado. Revisión profesional.",
      })
    );
  }
  if (opts.hasOperatorWithoutTaxId) {
    out.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_347_CASE",
        kind: "UNSUPPORTED",
        model: "347",
        title: "347: operador sin NIF",
        description: "Operador por encima del umbral sin identificación fiscal válida.",
      })
    );
  }
  return out;
}

export function assess390SupportLevel(opts: {
  hasRecc: boolean;
  hasProrrataSignal: boolean;
  hasIncompleteImport: boolean;
  quarters303Complete: boolean;
}): {
  level: "COMPLETE_FOR_CURRENT_CASE" | "UNSUPPORTED_CASE";
  cases: UnsupportedFiscalCase[];
} {
  const cases: UnsupportedFiscalCase[] = [];
  if (opts.hasRecc) {
    cases.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_RECC",
        kind: "PROFESSIONAL_REVIEW",
        model: "390",
        title: "390: RECC no soportado de forma completa",
        description: "Hay operaciones en criterio de caja; el 390 no se cierra solo por devengo.",
      })
    );
  }
  if (opts.hasProrrataSignal) {
    cases.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_PRORRATA",
        kind: "PROFESSIONAL_REVIEW",
        model: "390",
        title: "390: prorrata no calculada",
        description: "Actividad mixta sujeta/exenta — VEXO no calcula prorrata definitiva.",
      })
    );
  }
  if (opts.hasIncompleteImport) {
    cases.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_390_CASE",
        kind: "UNSUPPORTED",
        model: "390",
        title: "390: importaciones sin DUA",
        description: "Faltan datos aduaneros para secciones de importación.",
      })
    );
  }
  if (!opts.quarters303Complete) {
    cases.push(
      createUnsupportedFiscalCase({
        code: "UNSUPPORTED_390_CASE",
        kind: "PROFESSIONAL_REVIEW",
        model: "390",
        title: "390: cadena 303 incompleta",
        description: "No hay 303 Q1–Q4 presentados/provisionales suficientes para el resumen anual.",
      })
    );
  }
  return {
    level: cases.length === 0 ? "COMPLETE_FOR_CURRENT_CASE" : "UNSUPPORTED_CASE",
    cases,
  };
}
