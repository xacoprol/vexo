import { adjustForWeekend } from "@/lib/modelo-349/deadlines";
import type { Model180Deadline } from "@/lib/modelo-180/types";

/** Misma campaña informativa que el 190 (AEAT: hasta 2 feb año N+1). */
export const MODEL180_DEADLINE_SCOPE_NOTE =
  "Plazo Modelo 180: 1 ene – 2 feb del año siguiente al ejercicio " +
  "(ajuste sábado/domingo → lunes). Sin calendario completo de inhábiles AEAT.";

function formatEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function resolve180Deadline(year: number): Model180Deadline {
  const raw = adjustForWeekend(new Date(year + 1, 1, 2, 23, 59, 59, 999));
  return {
    dueDate: raw,
    dueLabel: formatEs(raw),
    periodLabel: `Año ${year}`,
    scopeNote: MODEL180_DEADLINE_SCOPE_NOTE,
    requiresOfficialCalendarCheck: true,
  };
}
