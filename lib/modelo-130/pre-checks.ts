import type {
  AgriculturalActivities130,
  Irpf130HousingDeduction,
  IrregularIncome130Status,
} from "@/lib/modelo-130/config-enums";
import type { Model130Warning } from "@/lib/modelo-130/types";

/** Límite anual deducción vivienda (art. 110.3.d) — solo apartado I. */
export const HOUSING_DEDUCTION_ANNUAL_MAX = 660.14;

/**
 * Umbral ingresos íntegros anuales previsibles (instrucciones Modelo 130, cas. 16).
 * AEAT anualiza ingresos del 1.er trimestre (o 1.er trimestre de actividad).
 */
export const HOUSING_PREDICTABLE_INCOME_ANNUAL_MAX = 33007.2;

/** @deprecated Usar HOUSING_DEDUCTION_ANNUAL_MAX */
export const HOUSING_DEDUCTION_QUARTERLY_MAX = HOUSING_DEDUCTION_ANNUAL_MAX;

/**
 * Condiciones que el usuario confirma al marcar ELIGIBLE_CONFIRMED.
 * VEXO no verifica estas exclusiones automáticamente salvo el umbral de ingresos
 * cuando dispone del ingreso del 1.er trimestre (cas. 01 T1) de forma fiable.
 */
export const HOUSING_ELIGIBILITY_CONDITIONS = [
  "Inversión en vivienda habitual adquirida antes del 1 de enero de 2013 (art. 110.3.d LIRPF).",
  "Actividades exclusivamente del apartado I (estimación directa, no agrícolas/ganaderas/forestales/pesqueras).",
  "Sin actividades agrícolas en el apartado II del Modelo 130 ni obligación de presentar el modelo 131.",
  "Sin retenciones practicadas conforme al modelo 145 por las mismas actividades.",
  "Ingresos íntegros anuales previsibles inferiores a 33.007,20 € (anualizando el 1.er trimestre o, si la actividad comenzó después, el 1.er trimestre de actividad).",
  "Sin otras causas de exclusión de las instrucciones oficiales del Modelo 130 para la casilla 16.",
] as const;

export function collectModel130PreWarnings(opts: {
  fiscalRegime: "130" | "131";
  agriculturalActivities130: AgriculturalActivities130;
  irregularIncome130Status: IrregularIncome130Status;
  hasCashAccountingInvoices: boolean;
  irpf130HousingDeduction: Irpf130HousingDeduction;
}): Model130Warning[] {
  const warnings: Model130Warning[] = [];

  if (opts.fiscalRegime === "131") {
    warnings.push({
      code: "MODEL_131_ACTIVE",
      message:
        "Régimen 131 configurado: la minoración casilla 13 puede distribuirse entre 130 y 131. VEXO no distribuye automáticamente.",
    });
  }

  if (opts.agriculturalActivities130 === "UNKNOWN") {
    warnings.push({
      code: "AGRICULTURAL_SCOPE_UNKNOWN",
      message:
        "No consta si tienes actividades agrícolas/ganaderas/forestales/pesqueras (casillas 08–11). VEXO solo calcula el apartado I.",
    });
  } else if (opts.agriculturalActivities130 === "HAS") {
    warnings.push({
      code: "AGRICULTURAL_NOT_SUPPORTED",
      message:
        "Actividades agrícolas/ganaderas/forestales/pesqueras declaradas: casillas 08–11 no están implementadas en VEXO.",
    });
  }

  if (opts.irregularIncome130Status === "REVIEW_REQUIRED") {
    warnings.push({
      code: "IRREGULAR_INCOME_REVIEW_REQUIRED",
      message:
        "Existen rendimientos irregulares (art. 32.1 LIRPF) que requieren reducción específica en casilla 03. VEXO no los calcula automáticamente.",
    });
  }

  if (opts.hasCashAccountingInvoices) {
    warnings.push({
      code: "CASH_ACCOUNTING_INVOICES",
      message:
        "Hay facturas con «criterio de caja» marcado (metadato IVA). El Modelo 130 usa imputación por devengo (fecha de factura). No mezclar con criterio de cobros y pagos IRPF.",
    });
  }

  if (opts.irpf130HousingDeduction === "UNKNOWN") {
    warnings.push({
      code: "HOUSING_DEDUCTION_UNKNOWN",
      message:
        "No consta si tienes derecho a la deducción por inversión en vivienda habitual (casilla 16). Configúralo en Ajustes.",
    });
  }

  return warnings;
}

/**
 * Casilla 16 — solo con elegibilidad confirmada explícitamente (ELIGIBLE_CONFIRMED).
 * VEXO no reduce deuda tributaria por un supuesto no comprobado.
 */
export function computeHousingDeductionBox16(opts: {
  housing: Irpf130HousingDeduction;
  box03: number;
  box14: number;
  box15: number;
  /** Ingresos cas. 01 del 1.er trimestre (YTD fin T1). Si disponible, se comprueba el umbral 33.007,20 €. */
  q1IncomeBase?: number | null;
  housingDeductionUsedEarlierInYear?: number;
}): { amount: number; warning?: Model130Warning } {
  if (opts.housing === "NO") {
    return { amount: 0 };
  }

  if (opts.housing === "UNKNOWN") {
    return { amount: 0 };
  }

  if (opts.housing !== "ELIGIBLE_CONFIRMED") {
    return { amount: 0 };
  }

  if (opts.q1IncomeBase != null && Number.isFinite(opts.q1IncomeBase)) {
    const annualizedQ1 = round2(Math.max(0, opts.q1IncomeBase) * 4);
    if (annualizedQ1 >= HOUSING_PREDICTABLE_INCOME_ANNUAL_MAX) {
      return {
        amount: 0,
        warning: {
          code: "HOUSING_INELIGIBLE_INCOME_THRESHOLD",
          message: `Ingresos previsibles anualizados del 1.er trimestre (${annualizedQ1} €) alcanzan o superan ${HOUSING_PREDICTABLE_INCOME_ANNUAL_MAX} €. Casilla 16 = 0.`,
        },
      };
    }
  }

  if (opts.box03 <= 0 || opts.box14 <= 0) {
    return { amount: 0 };
  }

  const raw = round2(Math.max(0, opts.box03) * 0.02);
  const usedEarlier = round2(Math.max(0, opts.housingDeductionUsedEarlierInYear ?? 0));
  const annualRemaining = round2(Math.max(0, HOUSING_DEDUCTION_ANNUAL_MAX - usedEarlier));
  const liquidationCap = round2(Math.max(0, opts.box14 - opts.box15));
  const amount = round2(Math.min(raw, annualRemaining, liquidationCap));

  return { amount: Math.max(0, amount) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
