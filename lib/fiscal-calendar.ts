/**
 * Calendario fiscal simplificado para autónomo (estimación directa + IVA).
 * Plazos habituales AEAT (día 20 del mes siguiente al trimestre; anuales en enero).
 */

import {
  currentFiscalPeriod,
  type FiscalQuarter,
} from "@/lib/fiscal";

export type GuideModel = "303" | "130" | "349" | "390" | "347" | "100";

export type FilingDeadline = {
  model: GuideModel;
  year: number;
  quarter: FiscalQuarter | null;
  /** Periodo declarado (ej. 2T 2026) */
  periodLabel: string;
  /** Fecha límite de presentación */
  dueDate: Date;
  /** Texto corto para humanos */
  dueLabel: string;
  /** Qué es este modelo, en una frase */
  what: string;
  /** URL sede AEAT (genérica) */
  aeatPath: string;
  href: string; // ruta interna del borrador
};

function dueDayForQuarter(year: number, quarter: FiscalQuarter): Date {
  // Presentación en el mes siguiente al cierre del T: abr/jul/oct/ene
  const monthAfter = quarter === 4 ? 0 : quarter * 3; // 0=ene, 3=abr, 6=jul, 9=oct
  const y = quarter === 4 ? year + 1 : year;
  return new Date(y, monthAfter, 20, 23, 59, 59);
}

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

export function buildUpcomingDeadlines(now = new Date()): FilingDeadline[] {
  const target = filingTargetPeriod(now);
  const { year, quarter } = target;
  const due = dueDayForQuarter(year, quarter);
  const label = periodLabel(year, quarter);

  const quarterly: FilingDeadline[] = [
    {
      model: "303",
      year,
      quarter,
      periodLabel: label,
      dueDate: due,
      dueLabel: formatEs(due),
      what: "IVA trimestral: lo que has cobrado de IVA menos lo que has pagado en gastos.",
      aeatPath: "https://sede.agenciatributaria.gob.es/",
      href: `/fiscal/303?year=${year}&q=${quarter}`,
    },
    {
      model: "130",
      year,
      quarter,
      periodLabel: label,
      dueDate: due,
      dueLabel: formatEs(due),
      what: "Pago a cuenta del IRPF (20 % del beneficio acumulado del año − pagos previos).",
      aeatPath: "https://sede.agenciatributaria.gob.es/",
      href: `/fiscal/130?year=${year}&q=${quarter}`,
    },
    {
      model: "349",
      year,
      quarter,
      periodLabel: label,
      dueDate: due,
      dueLabel: formatEs(due),
      what: "Operaciones intracomunitarias (compras/ventas UE). Si no hay, a veces no aplica.",
      aeatPath: "https://sede.agenciatributaria.gob.es/",
      href: `/fiscal/349?year=${year}&q=${quarter}`,
    },
  ];

  // Anuales: visibles en nov–ene (390/347) y feb–jun (renta 100)
  const showAnnual = now.getMonth() >= 10 || now.getMonth() === 0;
  if (showAnnual) {
    const annualYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const annualDue = new Date(annualYear + 1, 0, 30, 23, 59, 59);
    quarterly.push(
      {
        model: "390",
        year: annualYear,
        quarter: null,
        periodLabel: periodLabel(annualYear, null),
        dueDate: annualDue,
        dueLabel: formatEs(annualDue),
        what: "Resumen anual de IVA (recapitula los 303 del año).",
        aeatPath: "https://sede.agenciatributaria.gob.es/",
        href: `/fiscal/390?year=${annualYear}`,
      },
      {
        model: "347",
        year: annualYear,
        quarter: null,
        periodLabel: periodLabel(annualYear, null),
        dueDate: annualDue,
        dueLabel: formatEs(annualDue),
        what: "Operaciones con terceros > 3.005,06 €/año (clientes/proveedores).",
        aeatPath: "https://sede.agenciatributaria.gob.es/",
        href: `/fiscal/347?year=${annualYear}`,
      }
    );
  }

  // Renta (modelo 100): visible feb–30 jun del año siguiente
  const m = now.getMonth();
  if (m >= 1 && m <= 5) {
    const rentYear = now.getFullYear() - 1;
    const rentDue = new Date(now.getFullYear(), 5, 30, 23, 59, 59);
    quarterly.push({
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

  return quarterly.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
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
