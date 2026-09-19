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
 * 5 % sobre rendimiento neto positivo previo (antes de este gasto), máx. 2.000 €/año.
 *
 * `amount` es el **importe YTD acumulado** a incluir en casilla 02 del trimestre
 * (el 130 es acumulativo). No es un incremento trimestral.
 *
 * `hardToJustifyUsedEarlierInYear` se ignora en el cálculo del tope: el máximo
 * anual se aplica sobre el YTD del trimestre actual. Si se pasara a restar
 * importes YTD previos, los T posteriores podrían poner amount=0 y vaciar cas.02.
 *
 * Incompatibilidades no auto-detectables (documentadas como warnings en el motor):
 * - Actividades excluidas del supuesto (art. 30)
 * - Contribuyente también en módulos parciales
 */
export function computeHardToJustifyExpense(opts: {
  incomeBase: number;
  ordinaryExpenseBase: number;
  amortizationYtd: number;
  /** @deprecated No afecta al importe YTD; se conserva por compatibilidad de API. */
  hardToJustifyUsedEarlierInYear?: number;
}): HardToJustifyResult {
  void opts.hardToJustifyUsedEarlierInYear;
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
  const amount = round2(
    Math.min(raw, IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL)
  );

  return {
    amount,
    rendimientoPrevio,
    rateApplied: IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE,
    cappedByAnnualMax: raw > IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL,
  };
}
