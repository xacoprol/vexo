/**
 * Facturas rectificativas — tipos R1–R5, métodos I/S, vínculo con original.
 * No confundir con anulación (ANULADA).
 */

import type { LineInput } from "@/lib/calculations";
import { calculateDocument } from "@/lib/calculations";
import { parseInvoiceKind, type InvoiceKind } from "@/lib/invoice-issuance";
import { formatFechaExpedicion } from "@/lib/verifactu";

export const INVOICE_FISCAL_TYPE = {
  NORMAL: "NORMAL",
  RECTIFYING: "RECTIFYING",
} as const;

export type InvoiceFiscalType =
  (typeof INVOICE_FISCAL_TYPE)[keyof typeof INVOICE_FISCAL_TYPE];

export const RECTIFICATION_TYPE = {
  R1: "R1",
  R2: "R2",
  R3: "R3",
  R4: "R4",
  R5: "R5",
} as const;

export type RectificationType =
  (typeof RECTIFICATION_TYPE)[keyof typeof RECTIFICATION_TYPE];

export const RECTIFICATION_METHOD = {
  DIFFERENCES: "DIFFERENCES",
  SUBSTITUTION: "SUBSTITUTION",
} as const;

export type RectificationMethod =
  (typeof RECTIFICATION_METHOD)[keyof typeof RECTIFICATION_METHOD];

/** Causa operativa (UX) — no sustituye el tipo legal R1–R5. */
export const RECTIFICATION_CAUSE = {
  TOTAL_RETURN: "TOTAL_RETURN",
  PARTIAL_RETURN: "PARTIAL_RETURN",
  AMOUNT_ERROR: "AMOUNT_ERROR",
  LATER_DISCOUNT: "LATER_DISCOUNT",
  OTHER: "OTHER",
} as const;

export type RectificationCause =
  (typeof RECTIFICATION_CAUSE)[keyof typeof RECTIFICATION_CAUSE];

export type RectificationLegalOption = {
  code: RectificationType;
  label: string;
  description: string;
  /** Sugerido cuando la original es simplificada. */
  forSimplified?: boolean;
};

export const RECTIFICATION_LEGAL_OPTIONS: RectificationLegalOption[] = [
  {
    code: RECTIFICATION_TYPE.R1,
    label: "R1 — Error fundado en derecho / Art. 80",
    description:
      "Errores en base imponible o cuota que proceden de devoluciones, descuentos posteriores o datos incorrectos.",
  },
  {
    code: RECTIFICATION_TYPE.R2,
    label: "R2 — Concurso / crédito incobrable",
    description:
      "Crédito declarado incobrable conforme a la normativa (concurso, etc.).",
  },
  {
    code: RECTIFICATION_TYPE.R3,
    label: "R3 — Crédito incobrable parcial",
    description: "Parte del crédito declarada incobrable.",
  },
  {
    code: RECTIFICATION_TYPE.R4,
    label: "R4 — Resto de causas",
    description:
      "Otras causas de rectificación no incluidas en R1–R3 (usar solo si encaja).",
  },
  {
    code: RECTIFICATION_TYPE.R5,
    label: "R5 — Rectificativa de simplificada",
    description:
      "Rectificación de una factura simplificada (F2). Obligatoria cuando la original es simplificada.",
    forSimplified: true,
  },
];

export type RectificationCauseOption = {
  code: RectificationCause;
  label: string;
  suggestedMethod: RectificationMethod;
  suggestedLegalTypes: RectificationType[];
};

export const RECTIFICATION_CAUSE_OPTIONS: RectificationCauseOption[] = [
  {
    code: RECTIFICATION_CAUSE.TOTAL_RETURN,
    label: "Devolución total",
    suggestedMethod: RECTIFICATION_METHOD.DIFFERENCES,
    suggestedLegalTypes: [RECTIFICATION_TYPE.R1, RECTIFICATION_TYPE.R5],
  },
  {
    code: RECTIFICATION_CAUSE.PARTIAL_RETURN,
    label: "Devolución parcial",
    suggestedMethod: RECTIFICATION_METHOD.DIFFERENCES,
    suggestedLegalTypes: [RECTIFICATION_TYPE.R1, RECTIFICATION_TYPE.R5],
  },
  {
    code: RECTIFICATION_CAUSE.AMOUNT_ERROR,
    label: "Error de importe / IVA",
    suggestedMethod: RECTIFICATION_METHOD.SUBSTITUTION,
    suggestedLegalTypes: [
      RECTIFICATION_TYPE.R1,
      RECTIFICATION_TYPE.R4,
      RECTIFICATION_TYPE.R5,
    ],
  },
  {
    code: RECTIFICATION_CAUSE.LATER_DISCOUNT,
    label: "Descuento posterior",
    suggestedMethod: RECTIFICATION_METHOD.DIFFERENCES,
    suggestedLegalTypes: [RECTIFICATION_TYPE.R1, RECTIFICATION_TYPE.R5],
  },
  {
    code: RECTIFICATION_CAUSE.OTHER,
    label: "Otro",
    suggestedMethod: RECTIFICATION_METHOD.DIFFERENCES,
    suggestedLegalTypes: [
      RECTIFICATION_TYPE.R1,
      RECTIFICATION_TYPE.R4,
      RECTIFICATION_TYPE.R5,
    ],
  },
];

export type OriginalInvoiceRef = {
  id: string;
  fullNumber: string;
  issueDate: Date;
  invoiceKind: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  vatOperationType: string;
  irpfRate: number;
};

export type RectificationDraftInput = {
  cause: RectificationCause;
  legalType: RectificationType;
  method: RectificationMethod;
  /** Líneas de corrección (importes positivos = lo que se corrige/devuelve). */
  correctionLines?: LineInput[];
  /** Sustitución: importes correctos finales de la operación. */
  substitutionCorrect?: {
    subtotal: number;
    vatAmount: number;
    total: number;
  };
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseInvoiceFiscalType(raw: unknown): InvoiceFiscalType {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === INVOICE_FISCAL_TYPE.RECTIFYING
    ? INVOICE_FISCAL_TYPE.RECTIFYING
    : INVOICE_FISCAL_TYPE.NORMAL;
}

export function parseRectificationType(raw: unknown): RectificationType | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return (Object.values(RECTIFICATION_TYPE) as string[]).includes(v)
    ? (v as RectificationType)
    : null;
}

export function parseRectificationMethod(
  raw: unknown
): RectificationMethod | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "I" || v === RECTIFICATION_METHOD.DIFFERENCES) {
    return RECTIFICATION_METHOD.DIFFERENCES;
  }
  if (v === "S" || v === RECTIFICATION_METHOD.SUBSTITUTION) {
    return RECTIFICATION_METHOD.SUBSTITUTION;
  }
  return null;
}

export function rectificationMethodToAeat(
  method: RectificationMethod
): "I" | "S" {
  return method === RECTIFICATION_METHOD.SUBSTITUTION ? "S" : "I";
}

/**
 * Resuelve tipo legal R1–R5. Requiere selección explícita; solo valida coherencia.
 */
export function resolveRectifyingInvoiceType(input: {
  legalType: RectificationType;
  originalInvoiceKind: string;
}): { type: RectificationType; errors: string[] } {
  const errors: string[] = [];
  const kind = parseInvoiceKind(input.originalInvoiceKind);
  let type = input.legalType;

  if (kind === "SIMPLIFIED" && type !== RECTIFICATION_TYPE.R5) {
    errors.push(
      "La factura original es simplificada: el tipo legal habitual es R5. Confirma otro tipo solo si procede."
    );
  }
  if (kind === "FULL" && type === RECTIFICATION_TYPE.R5) {
    errors.push(
      "R5 solo aplica a rectificaciones de facturas simplificadas. Elige R1–R4."
    );
    type = RECTIFICATION_TYPE.R1;
  }

  return { type, errors };
}

export function suggestedLegalTypesForCause(
  cause: RectificationCause,
  originalKind: InvoiceKind
): RectificationType[] {
  const opt = RECTIFICATION_CAUSE_OPTIONS.find((c) => c.code === cause);
  const base = opt?.suggestedLegalTypes ?? [RECTIFICATION_TYPE.R1];
  if (originalKind === "SIMPLIFIED") {
    return [RECTIFICATION_TYPE.R5, ...base.filter((t) => t !== RECTIFICATION_TYPE.R5)];
  }
  return base.filter((t) => t !== RECTIFICATION_TYPE.R5);
}

export type RectificationTotals = {
  subtotal: number;
  vatAmount: number;
  irpfAmount: number;
  total: number;
  lines: LineInput[];
  substitutionCorrect?: {
    subtotal: number;
    vatAmount: number;
    total: number;
  };
};

/**
 * Calcula totales de la rectificativa a emitir (delta fiscal).
 * DIFFERENCES: líneas negativas = corrección.
 * SUBSTITUTION: delta = correcto − original; guarda importes correctos aparte.
 */
export function computeRectificationTotals(
  original: OriginalInvoiceRef,
  input: RectificationDraftInput
): { totals: RectificationTotals; errors: string[] } {
  const errors: string[] = [];
  const origSub = round2(Number(original.subtotal));
  const origVat = round2(Number(original.vatAmount));
  const origTotal = round2(Number(original.total));
  const irpfRate = Number(original.irpfRate) || 0;

  if (input.method === RECTIFICATION_METHOD.SUBSTITUTION) {
    const sc = input.substitutionCorrect;
    if (!sc) {
      errors.push("Indica los importes correctos finales para sustitución.");
      return {
        totals: {
          subtotal: 0,
          vatAmount: 0,
          irpfAmount: 0,
          total: 0,
          lines: [],
        },
        errors,
      };
    }
    const correctSub = round2(sc.subtotal);
    const correctVat = round2(sc.vatAmount);
    const correctTotal = round2(sc.total);
    const deltaSub = round2(correctSub - origSub);
    const deltaVat = round2(correctVat - origVat);
    const vatRate =
      origSub > 0 ? round2((origVat / origSub) * 100) : 21;
    const calc = calculateDocument(
      [
        {
          description: `Rectificación por sustitución de ${original.fullNumber}`,
          quantity: 1,
          unitPrice: deltaSub,
          vatRate,
          discountPct: 0,
        },
      ],
      irpfRate
    );

    return {
      totals: {
        subtotal: calc.subtotal,
        vatAmount: calc.vatAmount,
        irpfAmount: calc.irpfAmount,
        total: calc.total,
        lines: [
          {
            description: `Rectificación por sustitución de ${original.fullNumber}`,
            quantity: 1,
            unitPrice: deltaSub,
            vatRate,
            discountPct: 0,
          },
        ],
        substitutionCorrect: {
          subtotal: correctSub,
          vatAmount: correctVat,
          total: correctTotal,
        },
      },
      errors,
    };
  }

  const correctionLines = input.correctionLines ?? [];
  if (!correctionLines.length) {
    errors.push("Añade al menos una línea de corrección.");
    return {
      totals: {
        subtotal: 0,
        vatAmount: 0,
        irpfAmount: 0,
        total: 0,
        lines: [],
      },
      errors,
    };
  }

  let subtotal = 0;
  let vatAmount = 0;
  const negLines: LineInput[] = correctionLines.map((l) => {
    const qty = Number(l.quantity) || 1;
    const unit = Math.abs(Number(l.unitPrice) || 0);
    const rate = Number(l.vatRate) ?? 21;
    return {
      description: l.description,
      quantity: qty,
      unitPrice: -unit,
      vatRate: rate,
      discountPct: Number(l.discountPct) || 0,
    };
  });

  const calc = calculateDocument(negLines, irpfRate);
  subtotal = calc.subtotal;
  vatAmount = calc.vatAmount;

  if (input.cause === RECTIFICATION_CAUSE.TOTAL_RETURN) {
    if (
      Math.abs(subtotal + origSub) > 0.02 ||
      Math.abs(vatAmount + origVat) > 0.02
    ) {
      errors.push(
        "Devolución total: la corrección debe igualar la factura original."
      );
    }
  }

  return {
    totals: {
      subtotal,
      vatAmount,
      irpfAmount: calc.irpfAmount,
      total: calc.total,
      lines: negLines,
    },
    errors,
  };
}

export function buildTotalReturnLines(
  original: OriginalInvoiceRef
): LineInput[] {
  return original.subtotal
    ? [
        {
          description: `Devolución total — ${original.fullNumber}`,
          quantity: 1,
          unitPrice: round2(Number(original.subtotal)),
          vatRate:
            Number(original.subtotal) > 0
              ? round2((Number(original.vatAmount) / Number(original.subtotal)) * 100)
              : 21,
          discountPct: 0,
        },
      ]
    : [];
}

export type RectifiedInvoiceReference = {
  idEmisor: string;
  numSerie: string;
  fechaExpedicion: string;
};

export function buildRectifiedInvoiceReference(
  issuerNif: string,
  original: Pick<OriginalInvoiceRef, "fullNumber" | "issueDate">
): RectifiedInvoiceReference {
  return {
    idEmisor: issuerNif.replace(/[\s.\-]/g, "").toUpperCase(),
    numSerie: original.fullNumber.trim(),
    fechaExpedicion: formatFechaExpedicion(original.issueDate),
  };
}

export function rectificationTraceLabel(
  rectifyingNumber: string,
  originalNumber: string
): string {
  return `Rectificativa ${rectifyingNumber} · rectifica ${originalNumber}`;
}

export type ClientInvoiceBalance = {
  invoiceTotal: number;
  rectificationsTotal: number;
  netTotal: number;
  paid: number;
  clientCredit: number;
  amountDue: number;
};

/** Saldo cliente tras rectificativas (no borra pagos históricos). */
export function computeClientInvoiceBalance(opts: {
  invoiceTotal: number;
  rectificationsTotal: number;
  paid: number;
}): ClientInvoiceBalance {
  const invoiceTotal = round2(opts.invoiceTotal);
  const rectificationsTotal = round2(opts.rectificationsTotal);
  const netTotal = round2(invoiceTotal + rectificationsTotal);
  const paid = round2(opts.paid);
  const clientCredit = round2(Math.max(0, paid - netTotal));
  const amountDue = round2(Math.max(0, netTotal - paid));
  return {
    invoiceTotal,
    rectificationsTotal,
    netTotal,
    paid,
    clientCredit,
    amountDue,
  };
}

export function canRectifyInvoice(invoice: {
  fiscalStatus: string;
  status: string;
  invoiceFiscalType?: string | null;
}): { ok: boolean; reason?: string } {
  if (invoice.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING) {
    return { ok: false, reason: "Una rectificativa no se rectifica desde aquí." };
  }
  if (invoice.status === "ANULADA") {
    return { ok: false, reason: "No se puede rectificar una factura anulada." };
  }
  if (invoice.fiscalStatus !== "ISSUED") {
    return { ok: false, reason: "Solo facturas emitidas pueden rectificarse." };
  }
  return { ok: true };
}

export function canAnnulInvoice(invoice: {
  fiscalStatus: string;
  status: string;
  invoiceFiscalType?: string | null;
}): { ok: boolean; reason?: string } {
  if (invoice.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING) {
    return {
      ok: false,
      reason: "Las rectificativas no se anulan desde este flujo; usa anulación del registro si procede.",
    };
  }
  if (invoice.status === "ANULADA") {
    return { ok: false, reason: "Ya está anulada." };
  }
  if (invoice.fiscalStatus !== "ISSUED") {
    return { ok: false, reason: "Solo facturas emitidas pueden anularse." };
  }
  return { ok: true };
}
