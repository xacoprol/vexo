import type { FiscalQuarter } from "@/lib/fiscal";
import { adjustForWeekend } from "@/lib/modelo-349/deadlines";
import type {
  Model115Deadline,
  Model115Periodicity,
} from "@/lib/modelo-115/types";

export const MODEL115_DEADLINE_SCOPE_NOTE =
  "Plazo Modelo 115: veinte primeros días naturales posteriores al período " +
  "(ajuste sábado/domingo → lunes). No es calendario completo de inhábiles AEAT — " +
  "contrastar sede electrónica. Grandes empresas: mensual (solo si model115Periodicity=MONTHLY).";

function formatEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * Trimestral: 1T→20 abr, 2T→20 jul, 3T→20 oct, 4T→20 ene.
 * Mensual: primeros 20 días del mes siguiente.
 */
export function resolve115Deadline(opts: {
  year: number;
  quarter?: FiscalQuarter | null;
  month?: number | null;
  periodicity: Exclude<Model115Periodicity, "UNKNOWN">;
}): Model115Deadline {
  let raw: Date;
  let periodLabel: string;

  if (opts.periodicity === "MONTHLY") {
    const month = opts.month ?? (opts.quarter != null ? opts.quarter * 3 : 1);
    raw = endOfDay(adjustForWeekend(new Date(opts.year, month, 20)));
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
    periodLabel = `${names[month - 1] ?? "?"} ${opts.year}`;
  } else {
    const q = (opts.quarter ?? 1) as FiscalQuarter;
    if (q === 4) {
      raw = endOfDay(adjustForWeekend(new Date(opts.year + 1, 0, 20)));
    } else {
      const monthAfter = q * 3;
      raw = endOfDay(adjustForWeekend(new Date(opts.year, monthAfter, 20)));
    }
    periodLabel = `${q}T ${opts.year}`;
  }

  return {
    dueDate: raw,
    dueLabel: formatEs(raw),
    periodicity: opts.periodicity,
    periodLabel,
    scopeNote: MODEL115_DEADLINE_SCOPE_NOTE,
    requiresOfficialCalendarCheck: true,
  };
}
