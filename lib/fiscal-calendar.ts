/**
 * Calendario fiscal simplificado para autónomo (estimación directa + IVA).
 * Plazos: fuente única resolveObligationDueDate (Fase 3).
 * Incluye 111/115/180/190 además de 130/303/349/390/347.
 */

import {
  currentFiscalPeriod,
  type FiscalQuarter,
} from "@/lib/fiscal";
import {
  buildFiscalCalendarForYear,
  selectUpcomingFromCalendar,
  type FiscalCalendarEntry,
} from "@/lib/fiscal-calendar-complete";
import { resolveObligationDueDate } from "@/lib/fiscal-obligations/filing-status";

export type GuideModel =
  | "303"
  | "130"
  | "349"
  | "390"
  | "347"
  | "111"
  | "115"
  | "180"
  | "190"
  | "100";

export type FilingDeadline = {
  model: GuideModel;
  year: number;
  quarter: FiscalQuarter | null;
  periodLabel: string;
  dueDate: Date;
  dueLabel: string;
  what: string;
  aeatPath: string;
  href: string;
};

function formatEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function periodLabel(year: number, quarter: FiscalQuarter | null): string {
  if (quarter == null) return `Año ${year}`;
  return `${quarter}T ${year}`;
}

/** Trimestre a liquidar ahora (misma fuente que el hub fiscal). */
export function filingTargetPeriod(now = new Date()): {
  year: number;
  quarter: FiscalQuarter;
} {
  return currentFiscalPeriod(now);
}

function toGuideDeadline(e: FiscalCalendarEntry): FilingDeadline | null {
  if (!e.dueDate || !e.dueDateReliable) return null;
  if (
    e.obligationStatus === "NOT_APPLICABLE" ||
    e.obligationStatus === "NOT_REQUIRED"
  ) {
    return null;
  }
  return {
    model: e.model as GuideModel,
    year: e.year,
    quarter: e.quarter,
    periodLabel: e.periodLabel,
    dueDate: e.dueDate,
    dueLabel: formatEs(e.dueDate),
    what: e.what,
    aeatPath: "https://sede.agenciatributaria.gob.es/",
    href: e.href,
  };
}

/**
 * Próximos plazos del ejercicio objetivo + anuales de campaña.
 * Usa calendario completo (111/115/180/190 incluidos).
 */
export function buildUpcomingDeadlines(now = new Date()): FilingDeadline[] {
  const target = filingTargetPeriod(now);
  const month = now.getMonth();
  const annualYear = month <= 1 ? now.getFullYear() - 1 : now.getFullYear();

  const calTarget = buildFiscalCalendarForYear({
    year: target.year,
    now,
  });
  const calAnnual =
    annualYear !== target.year
      ? buildFiscalCalendarForYear({ year: annualYear, now })
      : [];

  const merged = [...calTarget, ...calAnnual];
  const upcoming = selectUpcomingFromCalendar(merged, now, {
    withinDays: 120,
    includeOverdue: true,
  });

  // Solo el trimestre objetivo + anuales de campaña
  const filtered = upcoming.filter((e) => {
    if (e.quarter != null) {
      return e.year === target.year && e.quarter === target.quarter;
    }
    return e.year === annualYear;
  });

  const out: FilingDeadline[] = [];
  for (const e of filtered) {
    const d = toGuideDeadline(e);
    if (d) out.push(d);
  }

  // Renta (modelo 100): visible feb–30 jun del año siguiente — fuera del motor AEAT VEXO
  const m = now.getMonth();
  if (m >= 1 && m <= 5) {
    const rentYear = now.getFullYear() - 1;
    const rentDue = new Date(now.getFullYear(), 5, 30, 23, 59, 59);
    out.push({
      model: "100",
      year: rentYear,
      quarter: null,
      periodLabel: periodLabel(rentYear, null),
      dueDate: rentDue,
      dueLabel: formatEs(rentDue),
      what: "IRPF anual (renta). Vexo no calcula el 100: archiva el PDF y usa tus 130/libros.",
      aeatPath: "https://sede.agenciatributaria.gob.es/",
      href: `/fiscal/annual?year=${rentYear}`,
    });
  }

  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Plazo fiable de un modelo (API pública para UI/tests multi-año). */
export function guideDueDate(
  model: Exclude<GuideModel, "100">,
  year: number,
  quarter: FiscalQuarter | null
): Date | null {
  return resolveObligationDueDate({ model, year, quarter }).dueDate;
}

export function daysUntil(due: Date, now = new Date()): number {
  const ms = due.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function urgencyLabel(due: Date, now = new Date()): {
  kind: "overdue" | "soon" | "ok" | "later";
  text: string;
} {
  const d = daysUntil(due, now);
  if (d < 0) return { kind: "overdue", text: `Venció hace ${Math.abs(d)} días` };
  if (d === 0) return { kind: "soon", text: "Vence hoy" };
  if (d <= 14) return { kind: "soon", text: `Quedan ${d} días` };
  if (d <= 45) return { kind: "ok", text: `Plazo: ${d} días` };
  return { kind: "later", text: `Faltan ${d} días` };
}

export {
  buildFiscalCalendarForYear,
  selectUpcomingFromCalendar,
} from "@/lib/fiscal-calendar-complete";
export type { FiscalCalendarEntry } from "@/lib/fiscal-calendar-complete";
