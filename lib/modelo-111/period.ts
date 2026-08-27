import type { FiscalQuarter } from "@/lib/fiscal";
import type {
  Model111PeriodResolution,
  Model111Periodicity,
  Model111WithholdingRow,
} from "@/lib/modelo-111/types";
import { MODEL111_PERIODICITY } from "@/lib/modelo-111/types";

export function parseModel111Periodicity(raw: unknown): Model111Periodicity {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "MONTHLY" || v === "MENSUAL") return MODEL111_PERIODICITY.MONTHLY;
  if (v === "QUARTERLY" || v === "TRIMESTRAL") {
    return MODEL111_PERIODICITY.QUARTERLY;
  }
  return MODEL111_PERIODICITY.UNKNOWN;
}

/**
 * Autónomo PF ordinario: UNKNOWN → QUARTERLY (con aviso en motor).
 * No infiere gran empresa / adscripción especial.
 */
export function resolveModel111Periodicity(
  declared: Model111Periodicity | string | null | undefined
): {
  periodicity: Exclude<Model111Periodicity, "UNKNOWN">;
  assumedFromUnknown: boolean;
} {
  const p = parseModel111Periodicity(declared);
  if (p === MODEL111_PERIODICITY.MONTHLY) {
    return { periodicity: "MONTHLY", assumedFromUnknown: false };
  }
  if (p === MODEL111_PERIODICITY.QUARTERLY) {
    return { periodicity: "QUARTERLY", assumedFromUnknown: false };
  }
  return { periodicity: "QUARTERLY", assumedFromUnknown: true };
}

function fiscalQuarterFromDate(d: Date): FiscalQuarter {
  return (Math.ceil((d.getMonth() + 1) / 3) as FiscalQuarter);
}

/**
 * Resolver central del período del Modelo 111.
 * Fuente fiscal: paymentDate (renta satisfecha/abonada).
 * NO usa accrualDate ni year/quarter denormalizados como regla legal.
 */
export function resolve111WithholdingPeriod(
  withholding: Pick<Model111WithholdingRow, "paymentDate" | "accrualDate">
): Model111PeriodResolution {
  const payment = withholding.paymentDate;
  if (!(payment instanceof Date) || Number.isNaN(payment.getTime())) {
    return {
      ok: false,
      code: "MODEL111_PAYMENT_DATE_MISSING",
      message:
        "Falta paymentDate: no se puede ubicar legalmente la retención en el Modelo 111. " +
        "No se asume accrualDate.",
      accrualDate:
        withholding.accrualDate instanceof Date &&
        !Number.isNaN(withholding.accrualDate.getTime())
          ? withholding.accrualDate
          : null,
      requiresReview: true,
    };
  }

  return {
    ok: true,
    year: payment.getFullYear(),
    quarter: fiscalQuarterFromDate(payment),
    month: payment.getMonth() + 1,
    basis: "paymentDate",
    paymentDate: payment,
  };
}

export function withholdingIn111Period(
  withholding: Pick<Model111WithholdingRow, "paymentDate" | "accrualDate">,
  opts: {
    year: number;
    quarter: FiscalQuarter;
    month?: number | null;
    periodicity: Exclude<Model111Periodicity, "UNKNOWN">;
  }
): { inPeriod: boolean; resolution: Model111PeriodResolution } {
  const resolution = resolve111WithholdingPeriod(withholding);
  if (!resolution.ok) {
    return { inPeriod: false, resolution };
  }
  if (opts.periodicity === "MONTHLY") {
    const month = opts.month ?? null;
    if (month == null) {
      return { inPeriod: false, resolution };
    }
    return {
      inPeriod:
        resolution.year === opts.year && resolution.month === month,
      resolution,
    };
  }
  return {
    inPeriod:
      resolution.year === opts.year && resolution.quarter === opts.quarter,
    resolution,
  };
}
