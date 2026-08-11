/** Utilidades para bienes de inversión y cuadro de amortización lineal. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type AmortizationRow = {
  year: number;
  amount: number;
};

/**
 * Amortización lineal: reparte `base` en `usefulLifeYears` cuotas anuales
 * desde `startYear`. El último año absorbe el redondeo.
 */
export function buildLinearAmortization(opts: {
  base: number;
  usefulLifeYears: number;
  startYear: number;
}): AmortizationRow[] {
  const years = Math.max(1, Math.floor(opts.usefulLifeYears));
  const base = Math.max(0, opts.base);
  if (base === 0) return [];

  const annual = round2(base / years);
  const rows: AmortizationRow[] = [];
  let allocated = 0;
  for (let i = 0; i < years; i++) {
    const year = opts.startYear + i;
    const amount =
      i === years - 1 ? round2(base - allocated) : annual;
    allocated = round2(allocated + amount);
    rows.push({ year, amount });
  }
  return rows;
}
