/**
 * Tipos y constantes — retenciones fiscales (Fase 9.1).
 *
 * PRACTICED = retención que el autónomo practica a un tercero (futuros 111/115).
 * SUFFERED  = retención que un cliente practica sobre ingresos propios
 *             (hoy: Invoice.irpfAmount → Modelo 130; migración a esta entidad = futura).
 */

export const WITHHOLDING_DIRECTION = {
  PRACTICED: "PRACTICED",
  SUFFERED: "SUFFERED",
} as const;
export type WithholdingDirection =
  (typeof WITHHOLDING_DIRECTION)[keyof typeof WITHHOLDING_DIRECTION];

export const WITHHOLDING_KIND = {
  PROFESSIONAL: "PROFESSIONAL",
  RENT: "RENT",
  SALARY: "SALARY",
  OTHER: "OTHER",
} as const;
export type WithholdingKind =
  (typeof WITHHOLDING_KIND)[keyof typeof WITHHOLDING_KIND];

export const WITHHOLDING_SOURCE = {
  EXPENSE: "EXPENSE",
  INVOICE: "INVOICE",
  LEASE_PAYMENT: "LEASE_PAYMENT",
  MANUAL: "MANUAL",
} as const;
export type WithholdingSourceType =
  (typeof WITHHOLDING_SOURCE)[keyof typeof WITHHOLDING_SOURCE];

export const WITHHOLDING_STATUS = {
  ACTIVE: "ACTIVE",
  RECTIFIED: "RECTIFIED",
  SUPERSEDED: "SUPERSEDED",
} as const;
export type WithholdingStatus =
  (typeof WITHHOLDING_STATUS)[keyof typeof WITHHOLDING_STATUS];

export const COUNTERPARTY_KIND = {
  PROFESSIONAL: "PROFESSIONAL",
  LANDLORD: "LANDLORD",
  EMPLOYEE: "EMPLOYEE",
  OTHER: "OTHER",
} as const;
export type CounterpartyKind =
  (typeof COUNTERPARTY_KIND)[keyof typeof COUNTERPARTY_KIND];

/** Clasificación fiscal explícita en Expense (no inferir por category). */
export const PRACTICED_WITHHOLDING_STATUS = {
  YES: "YES",
  NO: "NO",
  UNKNOWN: "UNKNOWN",
} as const;
export type PracticedWithholdingStatus =
  (typeof PRACTICED_WITHHOLDING_STATUS)[keyof typeof PRACTICED_WITHHOLDING_STATUS];

export const CENSUS_TRI_STATE = {
  YES: "YES",
  NO: "NO",
  UNKNOWN: "UNKNOWN",
} as const;
export type CensusTriState =
  (typeof CENSUS_TRI_STATE)[keyof typeof CENSUS_TRI_STATE];

/**
 * Semántica de fechas (Fase 9.4):
 *
 * - accrualDate: fecha del documento fuente (p. ej. Expense.issueDate).
 * - paymentDate: fecha de pago efectivo al perceptor — FUENTE FISCAL del Modelo 111.
 * - year / quarter: derivados de accrualDate solo para indexación/consultas (legacy).
 *
 * resolve111WithholdingPeriod() usa paymentDate; sin ella → MODEL111_PAYMENT_DATE_MISSING.
 */
export const WITHHOLDING_DATE_SEMANTICS =
  "accrualDate = documento fuente; paymentDate = satisfacción (Modelo 111); year/quarter índice desde accrualDate (legacy).";
