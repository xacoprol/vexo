import type { FiscalQuarter } from "@/lib/fiscal";
import type {
  Model115PeriodResolution,
  Model115Periodicity,
  Model115WithholdingRow,
} from "@/lib/modelo-115/types";
import { MODEL115_PERIODICITY } from "@/lib/modelo-115/types";

export function parseModel115Periodicity(raw: unknown): Model115Periodicity {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "MONTHLY" || v === "MENSUAL") return MODEL115_PERIODICITY.MONTHLY;
  if (v === "QUARTERLY" || v === "TRIMESTRAL") {
    return MODEL115_PERIODICITY.QUARTERLY;
  }
  return MODEL115_PERIODICITY.UNKNOWN;
}

/**
 * Autónomo PF ordinario: UNKNOWN → QUARTERLY (con aviso).
 * No infiere gran empresa / adscripción mensual especial.
 */
export function resolveModel115Periodicity(
  declared: Model115Periodicity | string | null | undefined
): {
  periodicity: Exclude<Model115Periodicity, "UNKNOWN">;
  assumedFromUnknown: boolean;
} {
  const p = parseModel115Periodicity(declared);
  if (p === MODEL115_PERIODICITY.MONTHLY) {
    return { periodicity: "MONTHLY", assumedFromUnknown: false };
  }
  if (p === MODEL115_PERIODICITY.QUARTERLY) {
    return { periodicity: "QUARTERLY", assumedFromUnknown: false };
  }
  return { periodicity: "QUARTERLY", assumedFromUnknown: true };
}

function fiscalQuarterFromDate(d: Date): FiscalQuarter {
  return Math.ceil((d.getMonth() + 1) / 3) as FiscalQuarter;
}

/**
 * Resolver central del período del Modelo 115.
 * Fuente fiscal: paymentDate (renta satisfecha/abonada).
 * NO usa accrualDate ni year/quarter denormalizados.
 *
 * Base normativa (resumen): arts. 74–75 RIRPF / práctica AEAT Modelo 115 —
 * la retención se declara en el período en que se satisface la renta.
 */
export function resolve115WithholdingPeriod(
  withholding: Pick<Model115WithholdingRow, "paymentDate" | "accrualDate">
): Model115PeriodResolution {
  const payment = withholding.paymentDate;
  if (!(payment instanceof Date) || Number.isNaN(payment.getTime())) {
    return {
      ok: false,
      code: "MODEL115_PAYMENT_DATE_MISSING",
      message:
        "Falta paymentDate: no se puede ubicar legalmente la retención en el Modelo 115. " +
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

export function withholdingIn115Period(
  withholding: Pick<Model115WithholdingRow, "paymentDate" | "accrualDate">,
  opts: {
    year: number;
    quarter: FiscalQuarter;
    month?: number | null;
    periodicity: Exclude<Model115Periodicity, "UNKNOWN">;
  }
): { inPeriod: boolean; resolution: Model115PeriodResolution } {
  const resolution = resolve115WithholdingPeriod(withholding);
  if (!resolution.ok) {
    return { inPeriod: false, resolution };
  }
  if (opts.periodicity === "MONTHLY") {
    const month = opts.month ?? null;
    if (month == null) return { inPeriod: false, resolution };
    return {
      inPeriod: resolution.year === opts.year && resolution.month === month,
      resolution,
    };
  }
  return {
    inPeriod:
      resolution.year === opts.year && resolution.quarter === opts.quarter,
    resolution,
  };
}
