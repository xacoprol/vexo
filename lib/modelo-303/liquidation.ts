function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Casilla 27 — suma explícita de cuotas devengadas soportadas por VEXO. */
export function computeBox27(parts: {
  box03: number;
  box06: number;
  box09: number;
  box11: number;
  box13: number;
  /** Recargo equivalencia (16/17): no soportado → 0 */
  box17: number;
  /** Otros tipos repercutidos no estándar */
  otherDevengadoQuota: number;
}): number {
  return round2(
    parts.box03 +
      parts.box06 +
      parts.box09 +
      parts.box11 +
      parts.box13 +
      parts.box17 +
      parts.otherDevengadoQuota
  );
}

/** Casilla 45 — fórmula oficial; términos no soportados = 0. */
export function computeBox45(parts: {
  box29: number;
  box31: number;
  box33: number;
  box35: number;
  box37: number;
  box39: number;
  box41: number;
  box42: number;
  box43: number;
  box44: number;
}): number {
  return round2(
    parts.box29 +
      parts.box31 +
      parts.box33 +
      parts.box35 +
      parts.box37 +
      parts.box39 +
      parts.box41 +
      parts.box42 +
      parts.box43 +
      parts.box44
  );
}

export type Model303Liquidation = {
  box46: number;
  box66: number;
  box77: number;
  box110: number;
  box78: number;
  box87: number;
  /** Regularización foral (no soportada en scope ordinario). */
  box68: number;
  /** Ajuste autoliquidación rectificativa especial (no soportado). */
  box108: number;
  box69: number;
  /** Solo autoliquidación rectificativa — ordinaria = 0. */
  box70: number;
  /** Solo autoliquidación rectificativa — ordinaria = 0. */
  box109: number;
  box71: number;
  /** max(0, −box71) si se opta por compensar (magnitud interna, ≠ casilla 70). */
  newNegativeBalance: number;
  /** box87 + newNegativeBalance — arrastre interno al trimestre siguiente. */
  totalAvailableNextPeriod: number;
};

/**
 * Liquidación régimen general — autoliquidación ordinaria.
 *
 * box69 = box66 + box77 − box78 + box68 + box108 (puede ser negativa).
 * box71 = box69 − box70 + box109 (ordinaria: box70=0, box109=0 → box71=box69).
 *
 * box87 = 110 − 78 (solo saldo de periodos anteriores).
 * El saldo negativo del periodo va en box71 (< 0), no en box70.
 */
export function computeModel303Liquidation(
  box27: number,
  box45: number,
  priorCompensation: number
): Model303Liquidation {
  const box46 = round2(box27 - box45);
  const box66 = box46;
  const box77 = 0;
  const box110 = round2(Math.max(0, priorCompensation));
  const box78 = round2(Math.min(box110, Math.max(0, box66)));
  const box87 = round2(box110 - box78);
  const box68 = 0;
  const box108 = 0;

  const box69 = round2(box66 + box77 - box78 + box68 + box108);

  const box70 = 0;
  const box109 = 0;
  const box71 = round2(box69 - box70 + box109);

  const newNegativeBalance = round2(box71 < 0 ? -box71 : 0);
  const totalAvailableNextPeriod = round2(box87 + newNegativeBalance);

  return {
    box46,
    box66,
    box77,
    box110,
    box78,
    box87,
    box68,
    box108,
    box69,
    box70,
    box109,
    box71,
    newNegativeBalance,
    totalAvailableNextPeriod,
  };
}
