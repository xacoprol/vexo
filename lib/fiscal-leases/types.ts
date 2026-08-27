/**
 * Arrendamientos de local afecto — base estructural Modelos 115/180 (Fase 9.3).
 *
 * Semántica de fechas en FiscalWithholding RENT (igual que 9.1):
 * - accrualDate = fecha del documento Expense (recibo/factura).
 * - paymentDate = opcional.
 * - year/quarter = índice desde accrualDate.
 * La imputación legal al Modelo 115 (devengo vs pago) NO se decide aquí.
 */

export const LEASE_ACTIVITY_USE = {
  FULL: "FULL",
  PARTIAL: "PARTIAL",
  UNKNOWN: "UNKNOWN",
} as const;
export type LeaseActivityUse =
  (typeof LEASE_ACTIVITY_USE)[keyof typeof LEASE_ACTIVITY_USE];

export const LEASE_WITHHOLDING_STATUS = {
  YES: "YES",
  NO: "NO",
  UNKNOWN: "UNKNOWN",
} as const;
export type LeaseWithholdingStatus =
  (typeof LEASE_WITHHOLDING_STATUS)[keyof typeof LEASE_WITHHOLDING_STATUS];

/**
 * Motivos declarados de no retención (dato revisable, no conclusión legal automática).
 */
export const LEASE_EXEMPTION_REASON = {
  LOW_ANNUAL_AMOUNT: "LOW_ANNUAL_AMOUNT",
  LANDLORD_IAE_EXEMPTION: "LANDLORD_IAE_EXEMPTION",
  EMPLOYEE_HOUSING: "EMPLOYEE_HOUSING",
  FINANCIAL_LEASE: "FINANCIAL_LEASE",
  EXEMPT_ENTITY: "EXEMPT_ENTITY",
  OTHER: "OTHER",
  UNKNOWN: "UNKNOWN",
} as const;
export type LeaseExemptionReason =
  (typeof LEASE_EXEMPTION_REASON)[keyof typeof LEASE_EXEMPTION_REASON];

export const LEASE_EXEMPTION_REASON_LABELS: Record<LeaseExemptionReason, string> = {
  LOW_ANNUAL_AMOUNT: "Importe anual bajo el umbral",
  LANDLORD_IAE_EXEMPTION: "Arrendador exento por IAE / actividad",
  EMPLOYEE_HOUSING: "Vivienda de empleado",
  FINANCIAL_LEASE: "Arrendamiento financiero",
  EXEMPT_ENTITY: "Entidad exenta",
  OTHER: "Otro motivo",
  UNKNOWN: "Motivo desconocido",
};

export const LEASE_DATE_SEMANTICS =
  "accrualDate = Expense.issueDate; paymentDate opcional; year/quarter índice. Modelo 115 period rule: pendiente motor futuro.";

export function parseLeaseActivityUse(raw: unknown): LeaseActivityUse {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "FULL" || v === "COMPLETO" || v === "YES" || v === "SI") return "FULL";
  if (v === "PARTIAL" || v === "PARCIAL") return "PARTIAL";
  return "UNKNOWN";
}

export function parseLeaseWithholdingStatus(raw: unknown): LeaseWithholdingStatus {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "YES" || v === "SI" || v === "SÍ" || v === "1") return "YES";
  if (v === "NO" || v === "0") return "NO";
  return "UNKNOWN";
}

export function parseLeaseExemptionReason(
  raw: unknown
): LeaseExemptionReason | null {
  const v = String(raw ?? "").toUpperCase().trim();
  if (!v) return null;
  if (v in LEASE_EXEMPTION_REASON) {
    return v as LeaseExemptionReason;
  }
  return "OTHER";
}
