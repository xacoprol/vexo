import type { FiscalQuarter } from "@/lib/fiscal";
import type {
  Model349Deadline,
  Model349FilingPeriodKind,
} from "@/lib/modelo-349/types";

/** Aviso interno: VEXO no dispone de calendario completo de inhábiles AEAT. */
export const MODEL349_DEADLINE_SCOPE_NOTE =
  "Plazo calculado con ajuste de fin de semana únicamente (sábado/domingo → lunes). " +
  "No constituye calendario completo de días inhábiles AEAT — contrastar con la sede " +
  "electrónica si el vencimiento coincide con festivo nacional o autonómico.";

function formatEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Ajuste simplificado: si cae sábado/domingo, mover al lunes siguiente. */
export function adjustForWeekend(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  if (day === 6) out.setDate(out.getDate() + 2);
  if (day === 0) out.setDate(out.getDate() + 1);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * Plazo mensual normal: primeros 20 días naturales del mes siguiente.
 * Excepciones:
 * - julio → 20 septiembre
 * - diciembre (último periodo del año) → 30 enero
 */
function monthlyDueDate(referenceMonth: number, referenceYear: number): Date {
  if (referenceMonth === 7) {
    return endOfDay(adjustForWeekend(new Date(referenceYear, 8, 20)));
  }
  if (referenceMonth === 12) {
    return endOfDay(adjustForWeekend(new Date(referenceYear + 1, 0, 30)));
  }
  // Mes siguiente, día 20 (Date month index = referenceMonth → mes siguiente)
  return endOfDay(adjustForWeekend(new Date(referenceYear, referenceMonth, 20)));
}

/**
 * Plazo trimestral normal: primeros 20 días naturales del mes siguiente al trimestre.
 * Excepción 4T: 30 enero del año siguiente.
 */
function quarterlyDueDate(quarter: FiscalQuarter, year: number): Date {
  if (quarter === 4) {
    return endOfDay(adjustForWeekend(new Date(year + 1, 0, 30)));
  }
  const monthAfterQuarterEnd = quarter * 3; // Q1→abr(3), Q2→jul(6), Q3→oct(9)
  return endOfDay(adjustForWeekend(new Date(year, monthAfterQuarterEnd, 20)));
}

/**
 * Trimestre truncado: plazo = 20 del mes siguiente al fin del periodo truncado
 * (misma regla que mensual sobre el mes de cierre del truncado).
 */
function truncatedDueDate(endMonth: number, year: number): Date {
  return monthlyDueDate(endMonth, year);
}

export type Resolve349DeadlineInput = {
  kind: Model349FilingPeriodKind;
  year: number;
  quarter: FiscalQuarter;
  startMonth: number;
  endMonth: number;
};

/**
 * Calendario propio del Modelo 349 (no reutiliza el del 303).
 */
export function resolve349Deadline(input: Resolve349DeadlineInput): Model349Deadline {
  let raw: Date;
  let periodLabel: string;
  const periodicity =
    input.kind === "MONTHLY" ? ("MONTHLY" as const) : ("QUARTERLY" as const);

  if (input.kind === "QUARTERLY") {
    raw = quarterlyDueDate(input.quarter, input.year);
    periodLabel = `${input.quarter}T ${input.year}`;
  } else if (input.kind === "QUARTERLY_TRUNCATED") {
    raw = truncatedDueDate(input.endMonth, input.year);
    periodLabel = `Truncado hasta mes ${input.endMonth}/${input.year}`;
  } else {
    raw = monthlyDueDate(input.endMonth, input.year);
    const names = [
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
    periodLabel = `${names[input.endMonth - 1] ?? "?"} ${input.year}`;
  }

  return {
    dueDate: raw,
    dueLabel: formatEs(raw),
    periodicity,
    periodLabel,
    scopeNote: MODEL349_DEADLINE_SCOPE_NOTE,
  };
}

/** Compatibilidad: plazo principal del trimestre de referencia (último periodo a presentar). */
export function resolve349PrimaryDeadline(opts: {
  year: number;
  quarter: FiscalQuarter;
  periodicity: import("@/lib/modelo-349/types").Model349Periodicity;
  filingPeriods: import("@/lib/modelo-349/types").Model349FilingPeriod[];
}): Model349Deadline {
  if (opts.filingPeriods.length > 0) {
    return opts.filingPeriods[opts.filingPeriods.length - 1].deadline;
  }
  const endMonth = opts.quarter * 3;
  const startMonth = endMonth - 2;
  return resolve349Deadline({
    kind: opts.periodicity === "MONTHLY" ? "MONTHLY" : "QUARTERLY",
    year: opts.year,
    quarter: opts.quarter,
    startMonth,
    endMonth,
  });
}
