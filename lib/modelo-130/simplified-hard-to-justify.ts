import {
  IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL,
  IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE,
} from "@/lib/modelo-130/constants";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type HardToJustifyResult = {
  amount: number;
  rendimientoPrevio: number;
  rateApplied: number;
  cappedByAnnualMax: boolean;
};

/**
 * Gastos de difícil justificación — estimación directa simplificada.
 * 5 % sobre rendimiento neto positivo previo (antes de este gasto), máx. 2.000 €/año acumulado.
 *
 * Incompatibilidades no auto-detectables (documentadas como warnings en el motor):
 * - Actividades excluidas del supuesto (art. 30)
 * - Contribuyente también en módulos parciales
 */
export function computeHardToJustifyExpense(opts: {
  incomeBase: number;
  ordinaryExpenseBase: number;
  amortizationYtd: number;
  /** Gasto difícil justificación ya computado en trimestres anteriores del mismo ejercicio. */
  hardToJustifyUsedEarlierInYear?: number;
}): HardToJustifyResult {
  const rendimientoPrevio = round2(
    opts.incomeBase - opts.ordinaryExpenseBase - opts.amortizationYtd
  );
  if (rendimientoPrevio <= 0) {
    return {
      amount: 0,
      rendimientoPrevio,
      rateApplied: IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE,
      cappedByAnnualMax: false,
    };
  }

  const raw = round2(rendimientoPrevio * IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE);
  const used = Math.max(0, opts.hardToJustifyUsedEarlierInYear ?? 0);
  const remainingCap = round2(
    Math.max(0, IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL - used)
  );
  const amount = round2(Math.min(raw, remainingCap));

  return {
    amount,
    rendimientoPrevio,
    rateApplied: IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE,
    cappedByAnnualMax: raw > remainingCap,
  };
}
