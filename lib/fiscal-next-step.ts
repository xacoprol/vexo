/**
 * Un solo “próximo paso” para presentar sin gestoría.
 * Vexo prepara borradores; la presentación real es siempre en la sede AEAT (Cl@ve).
 */

export type FiscalNextTone = "action" | "warning" | "done";

export type FiscalNextStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: FiscalNextTone;
};

export type FiscalNextStepInput = {
  year: number;
  quarter: number;
  hasIncome: boolean;
  hasExpenses: boolean;
  booksOk: boolean;
  presented303: boolean;
  presented130: boolean;
  /** Hay ops UE con NIF listas para declarar */
  has349Ops: boolean;
  /** Hay ops UE sin NIF-IVA (bloquean un 349 correcto) */
  incomplete349Nif: boolean;
  presented349: boolean;
  pendingNrcCount: number;
  aeatOpenCount: number;
  /** Régimen 131 = no presenta 130 */
  skip130?: boolean;
};

export function resolveFiscalNextStep(
  input: FiscalNextStepInput
): FiscalNextStep {
  const period = `${input.quarter}T ${input.year}`;
  const sedeNote =
    "Vexo te da las casillas; presentas en la sede AEAT con Cl@ve y luego subes el PDF aquí.";

  if (input.incomplete349Nif) {
    return {
      id: "fix-349-nif",
      title: "Completa NIF-IVA de compras UE",
      detail:
        "Hay adquisiciones intracomunitarias sin VAT ID. El 303 ya las incluye; el 349 no puede declararse bien hasta que pongas el NIF-IVA (p. ej. Bambulab).",
      href: "/fiscal/expenses?missingNif=1",
      cta: "Ver gastos sin NIF",
      tone: "warning",
    };
  }

  if (!input.hasIncome && !input.hasExpenses) {
    return {
      id: "add-data",
      title: `Faltan datos del ${period}`,
      detail:
        "Sin facturas ni gastos el borrador no tiene sentido. Añade ingresos (facturas / marketplace) y facturas recibidas.",
      href: "/fiscal/expenses",
      cta: "Ir a gastos",
      tone: "warning",
    };
  }

  if (!input.hasExpenses) {
    return {
      id: "add-expenses",
      title: "Revisa gastos del trimestre",
      detail:
        "No hay gastos registrados. Si tuviste compras, súbelas; si no, puedes seguir con el 303 (pagarás más IVA).",
      href: "/fiscal/expenses",
      cta: "Añadir gastos",
      tone: "warning",
    };
  }

  if (!input.booksOk) {
    return {
      id: "books",
      title: "Regenera los libros registro",
      detail:
        "Los libros son tu archivo formal (no cambian las casillas del 303). Genera ingresos + gastos del año antes de presentar.",
      href: `/fiscal/books?year=${input.year}`,
      cta: "Abrir libros",
      tone: "action",
    };
  }

  if (!input.presented303) {
    return {
      id: "present-303",
      title: `Presentar modelo 303 · ${period}`,
      detail: `1) Copia casillas en Vexo → 2) Sede AEAT (Cl@ve) → 3) Sube el PDF a Presentados. ${sedeNote}`,
      href: `/fiscal/303?year=${input.year}&q=${input.quarter}`,
      cta: "Ver casillas 303",
      tone: "action",
    };
  }

  if (!input.skip130 && !input.presented130) {
    return {
      id: "present-130",
      title: `Presentar modelo 130 · ${period}`,
      detail:
        "Aunque el resultado sea 0 o negativo, en estimación directa suele haber que presentar. Misma lógica: copiar → Cl@ve → subir PDF.",
      href: `/fiscal/130?year=${input.year}&q=${input.quarter}`,
      cta: "Ver casillas 130",
      tone: "action",
    };
  }

  if (input.has349Ops && !input.presented349) {
    return {
      id: "present-349",
      title: `Presentar modelo 349 · ${period}`,
      detail:
        "Hay operaciones UE. Declara operadores en la sede y sube el justificante a Presentados.",
      href: `/fiscal/349?year=${input.year}&q=${input.quarter}`,
      cta: "Ver borrador 349",
      tone: "action",
    };
  }

  if (input.pendingNrcCount > 0) {
    return {
      id: "nrc",
      title: "Registrar pago / NRC",
      detail: `Hay ${input.pendingNrcCount} liquidación(es) a ingresar sin NRC. Anota el justificante de pago de la AEAT.`,
      href: "/fiscal/payments",
      cta: "Ir a pagos",
      tone: "action",
    };
  }

  if (input.aeatOpenCount > 0) {
    return {
      id: "aeat",
      title: "Revisa comunicaciones AEAT",
      detail: `Tienes ${input.aeatOpenCount} plazo(s) abierto(s) en Vexo. Mira también el buzón DEHú.`,
      href: "/fiscal/aeat",
      cta: "Abrir AEAT",
      tone: "warning",
    };
  }

  return {
    id: "done",
    title: `${period}: al día en Vexo`,
    detail:
      "Modelos del periodo archivados y sin NRC pendiente. Cuando llegue el siguiente trimestre, vuelve a la guía.",
    href: "/fiscal/guide",
    cta: "Ver guía",
    tone: "done",
  };
}
