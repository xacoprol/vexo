/** Umbral legal Modelo 347 (€) — operaciones anuales con la misma persona/entidad. */
export const MODEL_347_THRESHOLD = 3005.06;

/** @deprecated Alias legacy */
export const MODELO_347_THRESHOLD = MODEL_347_THRESHOLD;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * AEAT: «superiores a 3.005,06 euros» — estrictamente mayor (3005,06 exacto → fuera).
 */
export function exceeds347Threshold(amount: number): boolean {
  return round2(Math.abs(amount)) > MODEL_347_THRESHOLD;
}

export function build347ThresholdContext(): import("@/lib/modelo-347/types").Model347ThresholdContext {
  return {
    threshold: MODEL_347_THRESHOLD,
    rule: "Superior a 3.005,06 € por operador y tipo (A/B) en el ejercicio",
  };
}
