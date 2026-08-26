import type { FiscalQuarter } from "@/lib/fiscal";
import { resolve349Deadline } from "@/lib/modelo-349/deadlines";
import {
  MODEL349_PERIODICITY_THRESHOLD,
  quarterPeriodLabel,
} from "@/lib/modelo-349/periodicity";
import type {
  Model349FilingPeriod,
  Model349MonthlyRegimeReason,
  Model349Periodicity,
} from "@/lib/modelo-349/types";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function monthsInQuarter(quarter: FiscalQuarter): [number, number, number] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? "?"} ${year}`;
}

function truncatedLabel(
  startMonth: number,
  endMonth: number,
  year: number
): string {
  if (startMonth === endMonth) {
    return `Trimestre truncado · ${monthLabel(startMonth, year)}`;
  }
  return `Trimestre truncado · ${MONTH_NAMES[startMonth - 1]}–${MONTH_NAMES[endMonth - 1]} ${year}`;
}

/**
 * Primer mes del trimestre (índice 0–2) en el que el acumulado E+S supera el umbral.
 */
export function detectThresholdCrossingMonthIndex(
  monthlyOutputAmounts: number[],
  threshold = MODEL349_PERIODICITY_THRESHOLD
): number | null {
  let cumulative = 0;
  for (let i = 0; i < monthlyOutputAmounts.length; i += 1) {
    cumulative += monthlyOutputAmounts[i] ?? 0;
    if (cumulative > threshold) return i;
  }
  return null;
}

function buildTruncatedAndMonthlyPeriods(opts: {
  year: number;
  quarter: FiscalQuarter;
  months: [number, number, number];
  monthlyOutputAmounts: number[];
  threshold: number;
}): Model349FilingPeriod[] {
  const crossing = detectThresholdCrossingMonthIndex(
    opts.monthlyOutputAmounts,
    opts.threshold
  );
  if (crossing == null) {
    const [m1, , m3] = opts.months;
    const period: Model349FilingPeriod = {
      kind: "QUARTERLY",
      year: opts.year,
      quarter: opts.quarter,
      startMonth: m1,
      endMonth: m3,
      label: quarterPeriodLabel(opts.year, opts.quarter),
      deadline: resolve349Deadline({
        kind: "QUARTERLY",
        year: opts.year,
        quarter: opts.quarter,
        startMonth: m1,
        endMonth: m3,
      }),
    };
    return [period];
  }

  const periods: Model349FilingPeriod[] = [];
  const endMonth = opts.months[crossing];
  periods.push({
    kind: "QUARTERLY_TRUNCATED",
    year: opts.year,
    quarter: opts.quarter,
    startMonth: opts.months[0],
    endMonth,
    crossingMonth: endMonth,
    label: truncatedLabel(opts.months[0], endMonth, opts.year),
    deadline: resolve349Deadline({
      kind: "QUARTERLY_TRUNCATED",
      year: opts.year,
      quarter: opts.quarter,
      startMonth: opts.months[0],
      endMonth,
    }),
  });

  for (let i = crossing + 1; i < opts.months.length; i += 1) {
    const m = opts.months[i];
    periods.push({
      kind: "MONTHLY",
      year: opts.year,
      quarter: opts.quarter,
      startMonth: m,
      endMonth: m,
      label: monthLabel(m, opts.year),
      deadline: resolve349Deadline({
        kind: "MONTHLY",
        year: opts.year,
        quarter: opts.quarter,
        startMonth: m,
        endMonth: m,
      }),
    });
  }

  return periods;
}

/**
 * Períodos de presentación del 349 para el trimestre de referencia.
 * Independiente del `quarter` genérico cuando hay truncado o mensual.
 */
export function resolve349FilingPeriods(opts: {
  year: number;
  quarter: FiscalQuarter;
  periodicity: Model349Periodicity;
  monthlyRegimeReason: Model349MonthlyRegimeReason;
  monthlyOutputAmounts: number[];
  threshold?: number;
}): Model349FilingPeriod[] {
  const threshold = opts.threshold ?? MODEL349_PERIODICITY_THRESHOLD;
  const months = monthsInQuarter(opts.quarter);

  if (opts.periodicity === "QUARTERLY") {
    const [m1, , m3] = months;
    return [
      {
        kind: "QUARTERLY",
        year: opts.year,
        quarter: opts.quarter,
        startMonth: m1,
        endMonth: m3,
        label: quarterPeriodLabel(opts.year, opts.quarter),
        deadline: resolve349Deadline({
          kind: "QUARTERLY",
          year: opts.year,
          quarter: opts.quarter,
          startMonth: m1,
          endMonth: m3,
        }),
      },
    ];
  }

  if (opts.monthlyRegimeReason === "PRIOR_QUARTER_EXCEEDED") {
    return months.map((m) => ({
      kind: "MONTHLY" as const,
      year: opts.year,
      quarter: opts.quarter,
      startMonth: m,
      endMonth: m,
      label: monthLabel(m, opts.year),
      deadline: resolve349Deadline({
        kind: "MONTHLY",
        year: opts.year,
        quarter: opts.quarter,
        startMonth: m,
        endMonth: m,
      }),
    }));
  }

  return buildTruncatedAndMonthlyPeriods({
    year: opts.year,
    quarter: opts.quarter,
    months,
    monthlyOutputAmounts: opts.monthlyOutputAmounts,
    threshold,
  });
}
