import type { FiscalQuarter } from "@/lib/fiscal";
import type { Model347Deadline } from "@/lib/modelo-347/types";

/** Plazos verificados AEAT (ejercicio → YYYY-MM-DD). Ampliar al publicar calendario. */
export const MODEL347_OFFICIAL_DEADLINES: Partial<
  Record<number, `${number}-${number}-${number}`>
> = {
  /** Presentación febrero 2026; vencimiento 2 mar 2026 (28 feb sábado). */
  2025: "2026-03-02",
};

export const MODEL347_DEADLINE_SCOPE_NOTE =
  "Plazo base: último día natural de febrero del año siguiente (presentación en febrero). " +
  "VEXO aplica ajuste de fin de semana (sábado/domingo → lunes). " +
  "No constituye calendario completo de días inhábiles AEAT — contrastar con la sede " +
  "electrónica si el vencimiento puede depender de festivo.";

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

/** Ajuste simplificado: sábado/domingo → lunes siguiente. */
export function adjustForWeekend(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  if (day === 6) out.setDate(out.getDate() + 2);
  if (day === 0) out.setDate(out.getDate() + 1);
  return out;
}

function lastDayOfFebruary(filingYear: number): Date {
  return endOfDay(new Date(filingYear, 2, 0));
}

function parseOfficialDate(iso: `${number}-${number}-${number}`): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return endOfDay(new Date(y, m - 1, d));
}

/**
 * Modelo 347 anual: presentación durante febrero; vencimiento = último día natural
 * de febrero del año siguiente, con traslado a día hábil cuando proceda.
 */
export function resolve347Deadline(year: number): Model347Deadline {
  const official = MODEL347_OFFICIAL_DEADLINES[year];
  if (official) {
    const dueDate = parseOfficialDate(official);
    return {
      dueDate,
      dueLabel: formatEs(dueDate),
      periodLabel: `Año ${year}`,
      scopeNote:
        "Plazo verificado según calendario AEAT publicado para el ejercicio.",
      requiresOfficialCalendarCheck: false,
      resolution: "official",
    };
  }

  const raw = lastDayOfFebruary(year + 1);
  const dueDate = adjustForWeekend(raw);
  const movedForWeekend = dueDate.getTime() !== raw.getTime();

  return {
    dueDate,
    dueLabel: formatEs(dueDate),
    periodLabel: `Año ${year}`,
    scopeNote: MODEL347_DEADLINE_SCOPE_NOTE,
    requiresOfficialCalendarCheck: !movedForWeekend,
    resolution: movedForWeekend ? "weekend_adjusted" : "february_last_day",
  };
}

export function fiscalQuarterFromDate(d: Date): FiscalQuarter {
  const month = d.getMonth() + 1;
  return Math.ceil(month / 3) as FiscalQuarter;
}

export function emptyQuarters(): import("@/lib/modelo-347/types").Model347QuarterAmounts {
  return { q1: 0, q2: 0, q3: 0, q4: 0 };
}

export function addToQuarter(
  quarters: import("@/lib/modelo-347/types").Model347QuarterAmounts,
  quarter: FiscalQuarter,
  amount: number
): void {
  const key = `q${quarter}` as keyof typeof quarters;
  quarters[key] = round2(quarters[key] + amount);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
