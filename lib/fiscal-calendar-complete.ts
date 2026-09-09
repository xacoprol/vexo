/**
 * Calendario fiscal completo — fuente única (Fase 3).
 * Delega plazos a resolveObligationDueDate (misma fuente que el motor).
 */

import type { FiscalQuarter } from "@/lib/fiscal";
import {
  resolveFilingStatus,
  resolveObligationDueDate,
} from "@/lib/fiscal-obligations/filing-status";
import type {
  FilingStatus,
  ObligationModelCode,
  ObligationStatus,
  OperationsSignal,
} from "@/lib/fiscal-obligations/types";

export type CalendarModelCode = ObligationModelCode;

export type FiscalCalendarEntry = {
  model: CalendarModelCode;
  year: number;
  quarter: FiscalQuarter | null;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date | null;
  dueDateReliable: boolean;
  obligationStatus: ObligationStatus;
  operationsSignal: OperationsSignal;
  filingStatus: FilingStatus;
  filingId: string | null;
  /** Presentación después del plazo (histórico). */
  filedLate: boolean;
  href: string;
  what: string;
};

const WHAT: Record<CalendarModelCode, string> = {
  "130": "Pago a cuenta IRPF (estimación directa).",
  "303": "Autoliquidación IVA trimestral.",
  "349": "Operaciones intracomunitarias (recapitulativo).",
  "111": "Retenciones e ingresos a cuenta (profesionales / trabajo).",
  "115": "Retenciones por arrendamiento de inmuebles urbanos.",
  "180": "Resumen anual de retenciones de alquileres (115).",
  "190": "Resumen anual de retenciones (111).",
  "347": "Declaración anual de operaciones con terceros.",
  "390": "Resumen anual de IVA.",
};

function quarterBounds(
  year: number,
  quarter: FiscalQuarter
): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1, 0, 0, 0),
    end: new Date(year, startMonth + 3, 0, 23, 59, 59),
  };
}

function yearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(year, 0, 1, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59),
  };
}

function periodLabel(year: number, quarter: FiscalQuarter | null): string {
  return quarter == null ? `Año ${year}` : `${quarter}T ${year}`;
}

function hrefFor(
  model: CalendarModelCode,
  year: number,
  quarter: FiscalQuarter | null
): string {
  if (quarter == null) return `/fiscal/${model}?year=${year}`;
  return `/fiscal/${model}?year=${year}&q=${quarter}`;
}

export type CalendarObligationInput = {
  model: CalendarModelCode;
  year: number;
  quarter?: FiscalQuarter | null;
  obligationStatus: ObligationStatus;
  operationsSignal?: OperationsSignal;
  filed: boolean;
  filingId?: string | null;
  /** ISO o Date de presentación efectiva (para FILED_LATE). */
  filedAt?: Date | string | null;
};

/**
 * Construye el calendario de un ejercicio (trimestrales + anuales).
 * No hardcodea un único año: el caller pasa `year`.
 */
export function buildFiscalCalendarForYear(opts: {
  year: number;
  now: Date;
  /** Si se omite, asume REQUIRED genérico para todos los slots. */
  obligations?: CalendarObligationInput[];
  /** Periodicidad 111/115: por defecto trimestral. */
  includeMonthly111?: boolean;
}): FiscalCalendarEntry[] {
  const { year, now } = opts;
  const byKey = new Map<string, CalendarObligationInput>();
  for (const o of opts.obligations ?? []) {
    const k = `${o.model}:${o.year}:${o.quarter ?? "A"}`;
    byKey.set(k, o);
  }

  const entries: FiscalCalendarEntry[] = [];

  const pushQuarter = (model: CalendarModelCode, q: FiscalQuarter) => {
    const key = `${model}:${year}:${q}`;
    const ob = byKey.get(key);
    const due = resolveObligationDueDate({ model, year, quarter: q });
    const bounds = quarterBounds(year, q);
    const filed = Boolean(ob?.filed);
    const filedAt =
      ob?.filedAt == null
        ? null
        : typeof ob.filedAt === "string"
          ? new Date(ob.filedAt)
          : ob.filedAt;
    const filingStatus = resolveFilingStatus({
      obligationStatus: ob?.obligationStatus ?? "REQUIRED",
      filed,
      filingId: ob?.filingId ?? null,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      now,
      filedAt,
    });
    entries.push({
      model,
      year,
      quarter: q,
      periodLabel: periodLabel(year, q),
      periodStart: bounds.start,
      periodEnd: bounds.end,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      obligationStatus: ob?.obligationStatus ?? "REQUIRED",
      operationsSignal: ob?.operationsSignal ?? "UNKNOWN",
      filingStatus,
      filingId: ob?.filingId ?? null,
      filedLate: filingStatus === "FILED_LATE",
      href: hrefFor(model, year, q),
      what: WHAT[model],
    });
  };

  const pushAnnual = (model: CalendarModelCode) => {
    const key = `${model}:${year}:A`;
    const ob = byKey.get(key);
    const due = resolveObligationDueDate({ model, year, quarter: null });
    const bounds = yearBounds(year);
    const filed = Boolean(ob?.filed);
    const filedAt =
      ob?.filedAt == null
        ? null
        : typeof ob.filedAt === "string"
          ? new Date(ob.filedAt)
          : ob.filedAt;
    const filingStatus = resolveFilingStatus({
      obligationStatus: ob?.obligationStatus ?? "REQUIRED",
      filed,
      filingId: ob?.filingId ?? null,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      now,
      filedAt,
    });
    entries.push({
      model,
      year,
      quarter: null,
      periodLabel: periodLabel(year, null),
      periodStart: bounds.start,
      periodEnd: bounds.end,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      obligationStatus: ob?.obligationStatus ?? "REQUIRED",
      operationsSignal: ob?.operationsSignal ?? "UNKNOWN",
      filingStatus,
      filingId: ob?.filingId ?? null,
      filedLate: filingStatus === "FILED_LATE",
      href: hrefFor(model, year, null),
      what: WHAT[model],
    });
  };

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    pushQuarter("130", q);
    pushQuarter("303", q);
    pushQuarter("349", q);
    pushQuarter("111", q);
    pushQuarter("115", q);
  }
  pushAnnual("180");
  pushAnnual("190");
  pushAnnual("347");
  pushAnnual("390");

  return entries;
}

/** Próximos plazos (ventana) a partir del calendario completo. */
export function selectUpcomingFromCalendar(
  entries: FiscalCalendarEntry[],
  now: Date,
  opts?: { withinDays?: number; includeOverdue?: boolean }
): FiscalCalendarEntry[] {
  const within = opts?.withinDays ?? 90;
  const includeOverdue = opts?.includeOverdue ?? true;
  return entries.filter((e) => {
    if (
      e.obligationStatus === "NOT_APPLICABLE" ||
      e.obligationStatus === "NOT_REQUIRED"
    ) {
      return false;
    }
    if (e.filingStatus === "FILED" || e.filingStatus === "FILED_LATE") {
      return false;
    }
    if (!e.dueDate || !e.dueDateReliable) return false;
    const ms = e.dueDate.getTime() - now.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    if (ms < 0) return includeOverdue;
    return days <= within;
  });
}
