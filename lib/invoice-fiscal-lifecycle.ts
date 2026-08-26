/**
 * Ciclo de vida fiscal de facturas: DRAFT | ISSUED.
 * Independiente de Invoice.status (cobro: PENDIENTE/PAGADA/VENCIDA/ANULADA).
 *
 * Estrategia de numeración (FASE 1):
 * Se conserva la asignación de número al CREAR (allocateInvoiceNumber),
 * porque createInvoice / quote→factura / marketplace dependen de ello.
 * Ideal futuro: numerar solo al emitir. Mientras tanto:
 * - DRAFT borrable puede recuperar correlativo si era el máximo de la serie.
 * - ISSUED nunca se borra → su número jamás se reutiliza.
 */

export const FISCAL_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
} as const;

export type FiscalStatus = (typeof FISCAL_STATUS)[keyof typeof FISCAL_STATUS];

export const ISSUED_IMMUTABLE_ERROR =
  "La factura ya ha sido emitida y su contenido fiscal no puede modificarse.";

export const ISSUED_DELETE_ERROR =
  "No se puede eliminar una factura emitida. Usa anulación o una rectificativa.";

export type InvoiceFiscalGate = {
  fiscalStatus?: string | null;
  verifactuHash?: string | null;
  status?: string | null;
};

/** Fuente de verdad: fiscalStatus. Hash legacy respalda ISSUED si faltara el campo. */
export function isInvoiceIssued(inv: InvoiceFiscalGate): boolean {
  if (inv.fiscalStatus === FISCAL_STATUS.ISSUED) return true;
  if (inv.fiscalStatus === FISCAL_STATUS.DRAFT) return false;
  // Compat pre-migración / filas sin campo en memoria
  return Boolean(inv.verifactuHash);
}

export function isInvoiceDraft(inv: InvoiceFiscalGate): boolean {
  return !isInvoiceIssued(inv);
}

export function assertInvoiceEditable(inv: InvoiceFiscalGate): void {
  if (inv.status === "ANULADA") {
    throw new InvoiceFiscalError("No se puede editar una factura anulada");
  }
  if (isInvoiceIssued(inv)) {
    throw new InvoiceFiscalError(ISSUED_IMMUTABLE_ERROR, 409);
  }
}

export function assertInvoiceDeletable(inv: InvoiceFiscalGate): void {
  if (isInvoiceIssued(inv)) {
    throw new InvoiceFiscalError(ISSUED_DELETE_ERROR, 409);
  }
}

export class InvoiceFiscalError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "InvoiceFiscalError";
    this.statusCode = statusCode;
  }
}

/** Campos de cabecera que forman el contenido fiscal (no metadatos de cobro). */
export const FISCAL_CONTENT_HEADER_KEYS = [
  "clientId",
  "issueDate",
  "seriesId",
  "seriesPrefix",
  "number",
  "fullNumber",
  "subtotal",
  "vatAmount",
  "irpfRate",
  "irpfAmount",
  "total",
  "vatOperationType",
  "cashAccounting",
  "operationKey",
  "operationKey347",
  "invoiceKind",
] as const;

/** Metadatos permitidos en ISSUED (cobro / notas / envío). */
export const ISSUED_ALLOWED_METADATA_KEYS = [
  "status",
  "dueDate",
  "paymentMethod",
  "notes",
] as const;

export type IssuedMetadataPatch = {
  status?: string;
  dueDate?: Date | null;
  paymentMethod?: string | null;
  notes?: string | null;
};

/**
 * Compensaciones Neon HTTP (sin $transaction interactiva ACID):
 *
 * | Operación | Compensación | Idempotente | Si falla el rollback |
 * |-----------|--------------|-------------|----------------------|
 * | createInvoice: lines fallan tras create | delete invoice + sync correlativo | delete por id; sync = max+1 | Log + factura DRAFT huérfana detectable (0 líneas; issue/delete reparan) |
 * | updateInvoice DRAFT: lines fallan | restaura cabecera + líneas previas | sobrescribe por id | Log; puede quedar cabecera nueva sin líneas → issue rechaza |
 * | issueInvoice | validación previa; un UPDATE hash+ISSUED | seal idempotente si ya hay hash | Si UPDATE ok y enqueue falla: ISSUED+hash reparable vía panel Veri*Factu |
 *
 * Límite: no hay ACID multi-step real en PrismaNeonHTTP.
 */
export const NEON_HTTP_COMPENSATION_NOTES =
  "PrismaNeonHTTP: sin transacciones interactivas. Create/update usan compensación; emisión es un solo UPDATE.";
