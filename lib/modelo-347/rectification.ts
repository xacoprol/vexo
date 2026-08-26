import { round2 } from "@/lib/modelo-347/threshold";

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type Model347OriginalInvoiceRef = {
  id: string;
  total: number;
};

export type Model347RectificationInput = {
  invoiceFiscalType?: string | null;
  rectificationMethod?: string | null;
  total: number;
  substitutionCorrectSubtotal?: number | null;
  substitutionCorrectVat?: number | null;
  substitutionCorrectTotal?: number | null;
};

/**
 * Importe que modifica el 347 por factura (venta).
 * - Normal: total con IVA.
 * - DIFFERENCES: delta explícito en total.
 * - SUBSTITUTION: substitutionCorrectTotal − original.total (la original no se duplica).
 */
export function compute347RectificationAmount(
  invoice: Model347RectificationInput,
  original: Model347OriginalInvoiceRef | null
): number {
  if (invoice.invoiceFiscalType !== "RECTIFYING") {
    return round2(num(invoice.total));
  }

  if (invoice.rectificationMethod === "SUBSTITUTION") {
    const correctTotal = num(invoice.substitutionCorrectTotal);
    if (original && invoice.substitutionCorrectTotal != null) {
      return round2(correctTotal - num(original.total));
    }
    // Sin original o sin importe correcto: usar delta almacenado si existe.
    return round2(num(invoice.total));
  }

  // DIFFERENCES (I): total ya es el delta fiscal.
  return round2(num(invoice.total));
}

/** Alias semántico para facturas no rectificativas. */
export function compute347InvoiceAmount(
  invoice: Model347RectificationInput,
  original: Model347OriginalInvoiceRef | null
): number {
  return compute347RectificationAmount(invoice, original);
}
