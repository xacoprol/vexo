/** Porcentaje casilla 04 — estimación directa sección I (AEAT instrucciones 130). */
export const IRPF_130_PAYMENT_RATE_NORMAL = 0.2;

/** Ceuta/Melilla art. 68.4 — no auto-detectado; requiere configuración futura. */
export const IRPF_130_PAYMENT_RATE_CEUTA_MELILLA = 0.08;

/** Gastos difícil justificación — estimación directa simplificada (art. 30 Reglamento IRPF). */
export const IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE = 0.05;

/** Tope anual gastos difícil justificación (euros). */
export const IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL = 2000;

/** Umbral máximo rendimiento neto ejercicio anterior para minoración casilla 13. */
export const IRPF_130_REDUCTION_MAX_PRIOR_NET_INCOME = 12000;

export type IrpfDirectEstimationMode = "NORMAL" | "SIMPLIFIED";

export function parseIrpfDirectEstimationMode(
  raw: unknown
): IrpfDirectEstimationMode {
  const v = String(raw ?? "NORMAL").toUpperCase().trim();
  return v === "SIMPLIFIED" ? "SIMPLIFIED" : "NORMAL";
}
