/** Utilidades para bienes de inversión y cuadro de amortización lineal. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type AmortizationRow = {
  year: number;
  amount: number;
};

export type AmortizationPeriodInput = {
  /** Cuota anual teórica (base / vida útil) para ese ejercicio. */
  yearAmount: number;
  purchaseDate: Date | null;
  startYear: number | null;
};

/** Año/mes civil (fecha de alta sin hora; Prisma suele guardar medianoche UTC). */
function calendarParts(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Amortización acumulada del 1 ene → fin del trimestre.
 * Cuota anual × meses en servicio / 12 (mes de alta inclusive).
 * Sin fecha de compra: desde enero del año (o 0 si startYear > year).
 */
export function amortizationYtdThroughQuarter(
  input: AmortizationPeriodInput,
  year: number,
  quarter: 1 | 2 | 3 | 4
): number {
  const amount = Math.max(0, Number(input.yearAmount) || 0);
  if (amount <= 0) return 0;

  const endMonth = quarter * 3;
  let startMonth = 1;

  if (input.purchaseDate) {
    const { year: py, month: pm } = calendarParts(input.purchaseDate);
    if (py > year) return 0;
    if (py === year) startMonth = Math.min(12, Math.max(1, pm));
  } else if (input.startYear != null) {
    if (input.startYear > year) return 0;
  }

  if (startMonth > endMonth) return 0;
  const months = endMonth - startMonth + 1;
  return round2((amount * months) / 12);
}

export function sumAmortizationYtd(
  rows: AmortizationPeriodInput[],
  year: number,
  quarter: 1 | 2 | 3 | 4
): number {
  return round2(
    rows.reduce(
      (s, r) => s + amortizationYtdThroughQuarter(r, year, quarter),
      0
    )
  );
}

/**
 * Amortización lineal: reparte `base` en `usefulLifeYears` cuotas anuales
 * desde `startYear`. El último año absorbe el redondeo.
 * La cuota es la anual completa; el 130 prorratea por meses de alta.
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

