import type { FiscalQuarter } from "@/lib/fiscal";
import type {
  Model349MonthlyRegimeReason,
  Model349Periodicity,
  Model349ThresholdContext,
} from "@/lib/modelo-349/types";

/** Umbral legal habitual para periodicidad mensual del 349 (€). */
export const MODEL349_PERIODICITY_THRESHOLD = 50_000;

export function quarterPeriodKey(year: number, quarter: FiscalQuarter): string {
  return `${year}:${quarter}`;
}

export function quarterPeriodLabel(year: number, quarter: FiscalQuarter): string {
  return `${quarter}T ${year}`;
}

/** Solo operaciones de salida (entregas/prestaciones UE) computan para el umbral. */
export const MODEL349_THRESHOLD_OPERATION_KEYS = ["E", "S"] as const;

export function priorQuarters(
  year: number,
  quarter: FiscalQuarter,
  count = 4
): { year: number; quarter: FiscalQuarter; key: string; label: string }[] {
  const out: {
    year: number;
    quarter: FiscalQuarter;
    key: string;
    label: string;
  }[] = [];
  let y = year;
  let q = quarter;
  for (let i = 0; i < count; i += 1) {
    q = (q - 1) as FiscalQuarter;
    if (q < 1) {
      q = 4 as FiscalQuarter;
      y -= 1;
    }
    out.push({
      year: y,
      quarter: q,
      key: quarterPeriodKey(y, q),
      label: quarterPeriodLabel(y, q),
    });
  }
  return out;
}

export function resolve349Periodicity(opts: {
  referenceYear: number;
  referenceQuarter: FiscalQuarter;
  quarterTotals: Map<string, number>;
  threshold?: number;
}): {
  periodicity: Model349Periodicity;
  monthlyRegimeReason: Model349MonthlyRegimeReason;
  thresholdContext: Model349ThresholdContext;
} {
  const threshold = opts.threshold ?? MODEL349_PERIODICITY_THRESHOLD;
  const refKey = quarterPeriodKey(opts.referenceYear, opts.referenceQuarter);
  const referenceQuarterAmount = opts.quarterTotals.get(refKey) ?? 0;

  const priors = priorQuarters(opts.referenceYear, opts.referenceQuarter);
  const priorQuarterAmounts = priors.map((p) => ({
    key: p.key,
    label: p.label,
    amount: opts.quarterTotals.get(p.key) ?? 0,
  }));

  const refExceeded = referenceQuarterAmount > threshold;
  const priorExceeded = priorQuarterAmounts.some((p) => p.amount > threshold);
  const exceeded = refExceeded || priorExceeded;

  const periodicity: Model349Periodicity = exceeded ? "MONTHLY" : "QUARTERLY";
  let monthlyRegimeReason: Model349MonthlyRegimeReason = null;
  if (exceeded) {
    monthlyRegimeReason = refExceeded
      ? "REFERENCE_QUARTER_EXCEEDED"
      : "PRIOR_QUARTER_EXCEEDED";
  }

  return {
    periodicity,
    monthlyRegimeReason,
    thresholdContext: {
      threshold,
      referenceQuarterKey: refKey,
      referenceQuarterAmount,
      priorQuarterAmounts,
      monthlyRegimeReason,
      operationsIncluded:
        "Suma de bases E+S (entregas y prestaciones intracomunitarias) por trimestre natural. A/I no computan.",
    },
  };
}
