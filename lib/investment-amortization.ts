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
  /** Años de vida útil; acota el último año por meses restantes. */
  usefulLifeYears?: number | null;
};

/** Año/mes civil (fecha de alta sin hora; Prisma suele guardar medianoche UTC). */
function calendarParts(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function lifeWindow(input: AmortizationPeriodInput): {
  startAbs: number;
  endAbs: number;
} | null {
  let startYear: number | null = null;
  let startMonth = 1;

  if (input.purchaseDate) {
    const p = calendarParts(input.purchaseDate);
    startYear = p.year;
    startMonth = Math.min(12, Math.max(1, p.month));
  } else if (input.startYear != null) {
    startYear = input.startYear;
    startMonth = 1;
  }

  if (startYear == null) return null;

  const lifeYearsRaw = Number(input.usefulLifeYears);
  const lifeYears =
    Number.isFinite(lifeYearsRaw) && lifeYearsRaw > 0
      ? Math.max(1, Math.floor(lifeYearsRaw))
      : 100;
  const startAbs = startYear * 12 + startMonth;
  const endAbs = startAbs + lifeYears * 12 - 1;
  return { startAbs, endAbs };
}

/**
 * Meses en servicio dentro de [year, months 1..throughMonth],
 * acotados al inicio (alta) y al fin de vida útil.
 */
export function amortizationServiceMonths(
  input: AmortizationPeriodInput,
  year: number,
  throughMonth: number
): number {
  const life = lifeWindow(input);
  if (!life) {
    // Sin alta: cuenta desde enero del año
    return Math.min(12, Math.max(0, throughMonth));
  }

  const windowStart = year * 12 + 1;
  const windowEnd = year * 12 + Math.min(12, Math.max(1, throughMonth));
  const from = Math.max(windowStart, life.startAbs);
  const to = Math.min(windowEnd, life.endAbs);
  if (from > to) return 0;
  return to - from + 1;
}

/**
 * Amortización acumulada del 1 ene → fin del trimestre.
 * Cuota anual × meses en servicio / 12 (mes de alta inclusive,
 * cortando al final de la vida útil).
 */
export function amortizationYtdThroughQuarter(
  input: AmortizationPeriodInput,
  year: number,
  quarter: 1 | 2 | 3 | 4
): number {
  const amount = Math.max(0, Number(input.yearAmount) || 0);
  if (amount <= 0) return 0;

  if (input.startYear != null && input.startYear > year) return 0;
  if (input.purchaseDate) {
    const { year: py } = calendarParts(input.purchaseDate);
    if (py > year) return 0;
  }

  const endMonth = quarter * 3;
  const months = amortizationServiceMonths(input, year, endMonth);
  if (months <= 0) return 0;
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
 * La cuota es la anual completa; el 130 prorratea por meses de alta/baja.
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
