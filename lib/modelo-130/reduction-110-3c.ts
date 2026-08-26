import { IRPF_130_REDUCTION_MAX_PRIOR_NET_INCOME } from "@/lib/modelo-130/constants";
import type { PreviousYearNetIncome130Mode } from "@/lib/modelo-130/config-enums";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Tabla oficial casilla 13 — art. 110.3.c Reglamento IRPF.
 */
export function reduction110_3cAmount(priorYearNetIncome: number): number {
  const n = Math.max(0, priorYearNetIncome);
  if (n > IRPF_130_REDUCTION_MAX_PRIOR_NET_INCOME) return 0;
  if (n <= 9000) return 100;
  if (n <= 10000) return 75;
  if (n <= 11000) return 50;
  return 25;
}

export type Reduction110_3cResult = {
  amount: number;
  /** Valor usado para la tabla (0 si sin actividad anterior). */
  priorYearNetIncomeUsed: number;
  mode: PreviousYearNetIncome130Mode;
  warning?: string;
};

export function computeReduction110_3c(opts: {
  mode: PreviousYearNetIncome130Mode;
  /** Solo cuando mode === KNOWN. */
  knownNetIncome: number | null;
  /** Si también presenta 131 — no distribuir automáticamente. */
  fiscalRegime131: boolean;
}): Reduction110_3cResult {
  if (opts.fiscalRegime131) {
    return {
      amount: 0,
      priorYearNetIncomeUsed: 0,
      mode: opts.mode,
      warning:
        "Régimen 131 activo: la minoración casilla 13 puede repartirse entre 130 y 131. VEXO no la calcula automáticamente.",
    };
  }

  if (opts.mode === "UNKNOWN") {
    return {
      amount: 0,
      priorYearNetIncomeUsed: 0,
      mode: "UNKNOWN",
      warning:
        "Rendimiento neto del ejercicio anterior desconocido: no se aplica minoración casilla 13 (no se asume 0 €).",
    };
  }

  const priorIncome =
    opts.mode === "NO_ACTIVITY"
      ? 0
      : opts.knownNetIncome != null
        ? Math.max(0, opts.knownNetIncome)
        : null;

  if (priorIncome == null) {
    return {
      amount: 0,
      priorYearNetIncomeUsed: 0,
      mode: "KNOWN",
      warning:
        "Modo KNOWN seleccionado pero falta el importe del rendimiento neto anterior.",
    };
  }

  const amount = round2(reduction110_3cAmount(priorIncome));
  return {
    amount,
    priorYearNetIncomeUsed: priorIncome,
    mode: opts.mode,
  };
}
