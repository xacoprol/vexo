import type { FiscalQuarter } from "@/lib/fiscal";
import { adjustForWeekend } from "@/lib/modelo-349/deadlines";
import type {
  Model111Deadline,
  Model111Periodicity,
} from "@/lib/modelo-111/types";

export const MODEL111_DEADLINE_SCOPE_NOTE =
  "Plazo Modelo 111: primeros 20 días naturales del mes siguiente al período " +
  "(ajuste sábado/domingo → lunes). No es calendario completo de inhábiles AEAT — " +
  "contrastar sede electrónica si coincide con festivo.";

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
export function resolve111Deadline(opts: {
  year: number;
  quarter?: FiscalQuarter | null;
  month?: number | null;
  periodicity: Exclude<Model111Periodicity, "UNKNOWN">;
}): Model111Deadline {
  let raw: Date;
  let periodLabel: string;

  if (opts.periodicity === "MONTHLY") {
    const month = opts.month ?? (opts.quarter != null ? opts.quarter * 3 : 1);
    // opts.month 1–12 → Date month index del mes siguiente = `month` (0-index: month 1 → Feb)
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
      const monthAfter = q * 3; // Q1→3 (abr), Q2→6 (jul), Q3→9 (oct)
      raw = endOfDay(adjustForWeekend(new Date(opts.year, monthAfter, 20)));
    }
    periodLabel = `${q}T ${opts.year}`;
  }

  return {
    dueDate: raw,
    dueLabel: formatEs(raw),
    periodicity: opts.periodicity,
    periodLabel,
    scopeNote: MODEL111_DEADLINE_SCOPE_NOTE,
    requiresOfficialCalendarCheck: true,
  };
}
