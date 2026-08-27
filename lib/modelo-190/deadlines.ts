import { adjustForWeekend } from "@/lib/modelo-349/deadlines";
import type { Model190Deadline } from "@/lib/modelo-190/types";

/**
 * Plazo AEAT declaraciones informativas (campaña ejercicio N):
 * del 1 de enero al 2 de febrero del año N+1
 * (sede AEAT Modelo 190 / 180 — campaña 2025 presentada en 2026: hasta 2 feb 2026).
 * No reutiliza 347 (fin feb) ni 390 (30 ene).
 */
export const MODEL190_DEADLINE_SCOPE_NOTE =
  "Plazo Modelo 190: 1 ene – 2 feb del año siguiente al ejercicio " +
  "(ajuste sábado/domingo → lunes). Sin calendario completo de inhábiles AEAT — " +
  "contrastar sede electrónica; a veces hay prórroga técnica de 4 días.";

function formatEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function resolve190Deadline(year: number): Model190Deadline {
  const raw = adjustForWeekend(new Date(year + 1, 1, 2, 23, 59, 59, 999));
  return {
    dueDate: raw,
    dueLabel: formatEs(raw),
    periodLabel: `Año ${year}`,
    scopeNote: MODEL190_DEADLINE_SCOPE_NOTE,
    requiresOfficialCalendarCheck: true,
  };
}
