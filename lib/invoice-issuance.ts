/**
 * Modalidad fiscal de factura y validación previa a emisión.
 *
 * Fuente de verdad: Invoice.invoiceKind (FULL | SIMPLIFIED).
 * FULL → TipoFactura F1; SIMPLIFIED → F2 (modelo Veri*Factu actual de VEXO).
 *
 * paymentMethod / origen marketplace NO determinan el tipo fiscal;
 * solo pueden usarse como default al crear.
 */

import { normalizeIssuerNif } from "@/lib/verifactu";

export const INVOICE_KIND = {
  FULL: "FULL",
  SIMPLIFIED: "SIMPLIFIED",
} as const;

export type InvoiceKind = (typeof INVOICE_KIND)[keyof typeof INVOICE_KIND];

export type VerifactuInvoiceType = "F1" | "F2";

/** Límite general factura simplificada (IVA incluido). RD 1619/2012. */
export const SIMPLIFIED_INVOICE_MAX_GENERAL = 400;

/**
 * Límite especial para determinadas actividades (no auto-detectado en VEXO).
 * Solo aplicar si CompanySettings.simplifiedInvoiceMaxAmount se configura a este valor.
 */
export const SIMPLIFIED_INVOICE_MAX_SPECIAL = 3000;

export const SIMPLIFIED_INVOICE_MAX_DEFAULT = SIMPLIFIED_INVOICE_MAX_GENERAL;

export function parseInvoiceKind(raw: unknown): InvoiceKind {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  return v === INVOICE_KIND.SIMPLIFIED
    ? INVOICE_KIND.SIMPLIFIED
    : INVOICE_KIND.FULL;
}

export function isInvoiceKindSimplified(kind: unknown): boolean {
  return parseInvoiceKind(kind) === INVOICE_KIND.SIMPLIFIED;
}

/** TipoFactura AEAT desde invoiceKind persistido (no desde paymentMethod). */
export function resolveInvoiceTipoFactura(input: {
  invoiceKind?: string | null;
}): VerifactuInvoiceType {
  return isInvoiceKindSimplified(input.invoiceKind) ? "F2" : "F1";
}

/**
 * Límite IVA incluido para SIMPLIFIED.
 * Default conservador 400 €; 3000 € solo si está configurado explícitamente.
 */
export function resolveSimplifiedInvoiceMaxAmount(
  configured: unknown
): number {
  const n = Number(configured);
  if (!Number.isFinite(n) || n <= 0) return SIMPLIFIED_INVOICE_MAX_DEFAULT;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function isWithinSimplifiedInvoiceLimit(
  totalInclVat: number,
  maxAmount: number
): boolean {
  const total = Number(totalInclVat);
  const max = resolveSimplifiedInvoiceMaxAmount(maxAmount);
  if (!Number.isFinite(total)) return false;
  return total <= max + 0.001;
}

/**
 * Default operativo al crear (no es regla fiscal de sellado).
 * Marketplace/Shopify → SIMPLIFIED; manual → FULL.
 */
export function defaultInvoiceKindForOrigin(origin: {
  fromMarketplace?: boolean;
}): InvoiceKind {
  return origin.fromMarketplace
    ? INVOICE_KIND.SIMPLIFIED
    : INVOICE_KIND.FULL;
}

export type InvoiceIssuanceInput = {
  status?: string | null;
  fullNumber?: string | null;
  issueDate?: Date | string | null;
  subtotal?: unknown;
  vatAmount?: unknown;
  total?: unknown;
  invoiceKind?: string | null;
  lineCount?: number;
  clientNif?: string | null;
  clientName?: string | null;
  issuerNif?: string | null;
  /** Límite SIMPLIFIED desde CompanySettings */
  simplifiedInvoiceMaxAmount?: number | null;
};

export type InvoiceIssuanceValidation = {
  valid: boolean;
  invoiceKind: InvoiceKind;
  invoiceType: VerifactuInvoiceType;
  errors: string[];
};

function hasText(v: unknown): boolean {
  return String(v ?? "").trim().length > 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Valida datos exigibles para emitir según invoiceKind explícito.
 */
export function validateInvoiceForIssuance(
  input: InvoiceIssuanceInput
): InvoiceIssuanceValidation {
  const errors: string[] = [];
  const invoiceKind = parseInvoiceKind(input.invoiceKind);
  const invoiceType = resolveInvoiceTipoFactura({ invoiceKind });

  if (input.status === "ANULADA") {
    errors.push("No se puede emitir una factura anulada");
  }
  if (!hasText(input.fullNumber)) {
    errors.push("Falta el número de factura");
  }
  if (!input.issueDate || Number.isNaN(new Date(input.issueDate).getTime())) {
    errors.push("Falta una fecha de emisión válida");
  }
  if (!(Number(input.lineCount) > 0)) {
    errors.push("La factura debe tener al menos una línea");
  }

  const total = Number(input.total);
  if (!Number.isFinite(total)) {
    errors.push("El total de la factura no es válido");
  }

  const issuer = normalizeIssuerNif(String(input.issuerNif ?? ""));
  if (!issuer) {
    errors.push(
      "Configura el NIF de la empresa en Ajustes: es obligatorio para el registro fiscal (Veri*Factu)."
    );
  }

  if (!hasText(input.clientName)) {
    errors.push("Falta el destinatario (cliente)");
  }

  if (invoiceKind === INVOICE_KIND.FULL) {
    const clientNif = String(input.clientNif ?? "")
      .trim()
      .replace(/[\s.\-]/g, "");
    if (!clientNif) {
      errors.push(
        "Factura completa: el NIF/CIF del cliente es obligatorio. Si procede una simplificada, elige «Factura simplificada» antes de emitir."
      );
    }
  }

  if (invoiceKind === INVOICE_KIND.SIMPLIFIED && Number.isFinite(total)) {
    const max = resolveSimplifiedInvoiceMaxAmount(
      input.simplifiedInvoiceMaxAmount
    );
    if (!isWithinSimplifiedInvoiceLimit(total, max)) {
      errors.push(
        `No se puede emitir como factura simplificada. El importe (${round2(total).toFixed(2)} € IVA incluido) supera el límite configurado (${max.toFixed(2)} €).`
      );
    }
  }

  return {
    valid: errors.length === 0,
    invoiceKind,
    invoiceType,
    errors,
  };
}

/** @deprecated Usar invoiceKind. Conservada solo para migración/tests legacy. */
export function isSimplifiedInvoice(input: {
  invoiceKind?: string | null;
  paymentMethod?: string | null;
  hasMarketplaceIncome?: boolean;
}): boolean {
  if (input.invoiceKind != null && String(input.invoiceKind).trim() !== "") {
    return isInvoiceKindSimplified(input.invoiceKind);
  }
  // Legacy fallback — no usar en sello nuevo
  if (input.hasMarketplaceIncome) return true;
  const payment = (input.paymentMethod || "").toLowerCase();
  return payment.includes("shopify") || payment.includes("marketplace");
}
