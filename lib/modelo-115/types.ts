/**
 * Modelo 115 — Retenciones arrendamiento inmuebles urbanos (Fase 9.5).
 *
 * Casillas oficiales AEAT (autoliquidación vigente):
 * 01 Nº perceptores · 02 Base · 03 Retenciones · 04 Complementaria · 05 Resultado
 *
 * Scope: FiscalWithholding PRACTICED / RENT únicamente.
 * NO inventa retenciones desde Lease ni category de Expense.
 */

import type { FiscalQuarter } from "@/lib/fiscal";

export const MODEL115_SCOPE_NOTE =
  "Modelo 115 · scope VEXO Fase 9.5: retenciones practicadas sobre arrendamiento " +
  "de inmuebles urbanos (FiscalWithholding PRACTICED / RENT). No calcula 180 ni " +
  "exenciones legales automáticas.";

/**
 * Decisión temporal (documentada):
 * La obligación de retener e ingresar se vincula a la satisfacción/abono de la renta
 * (art. 78.1 LIRPF y arts. 74–75 RIRPF — momento en que se entiende satisfecha la renta).
 * Fuente operativa VEXO: paymentDate. No se usa accrualDate ni year/quarter legacy.
 * Ref. AEAT Modelo 115 (retenciones arrendamiento inmuebles urbanos) + plazos
 * «veinte primeros días naturales» posteriores al período.
 */
export const MODEL115_PERIOD_RULE_NOTE =
  "Período 115 = trimestre/mes de paymentDate (renta satisfecha). " +
  "Sin paymentDate → MODEL115_PAYMENT_DATE_MISSING; no se asume accrualDate.";

export const MODEL115_PERIODICITY = {
  QUARTERLY: "QUARTERLY",
  MONTHLY: "MONTHLY",
  UNKNOWN: "UNKNOWN",
} as const;
export type Model115Periodicity =
  (typeof MODEL115_PERIODICITY)[keyof typeof MODEL115_PERIODICITY];

export type Model115Outcome =
  | "TO_PAY"
  | "NEGATIVE"
  | "NO_RELEVANT_PAYMENTS"
  | "REQUIRES_REVIEW";

/** Casillas oficiales Modelo 115 (no reutilizar estructura 111). */
export type Model115Boxes = {
  /** Nº de perceptores (arrendadores distintos) */
  box01: number;
  /** Base de las retenciones e ingresos a cuenta */
  box02: number;
  /** Retenciones e ingresos a cuenta */
  box03: number;
  /** Resultado a ingresar de anteriores (solo complementaria) */
  box04: number;
  /** Resultado a ingresar */
  box05: number;
};

export type Model115TraceLine = {
  withholdingId: string;
  leaseId: string | null;
  counterpartyId: string;
  landlordName: string;
  taxId: string;
  paymentDate: string;
  accrualDate: string | null;
  baseAmount: number;
  withholdingAmount: number;
  rate: number;
  expenseId: string | null;
  href: string | null;
  propertyAddress: string | null;
};

export type Model115Warning = {
  code: string;
  message: string;
  withholdingId?: string;
  leaseId?: string;
  sourceId?: string;
  severity?: "ERROR" | "WARNING" | "INFO";
};

export type Model115LeaseRef = {
  id: string;
  propertyAddress: string;
  withholdingStatus: string;
  withholdingExemptionReason: string | null;
  counterpartyId: string;
  active: boolean;
};

export type Model115WithholdingRow = {
  id: string;
  direction: string;
  kind: string;
  status: string;
  rectifiesId: string | null;
  counterpartyId: string;
  sourceType: string;
  sourceId: string;
  baseAmount: number;
  rate: number;
  withholdingAmount: number;
  accrualDate: Date;
  paymentDate: Date | null;
  year: number;
  quarter: number;
  /** leaseId del Expense si sourceType=EXPENSE */
  leaseId: string | null;
  counterparty: {
    id: string;
    name: string;
    taxId: string;
    normalizedTaxId: string;
    kind: string;
    countryCode: string;
    requiresReview: boolean;
  };
};

export type Model115PeriodResolution =
  | {
      ok: true;
      year: number;
      quarter: FiscalQuarter;
      month: number | null;
      basis: "paymentDate";
      paymentDate: Date;
    }
  | {
      ok: false;
      code: "MODEL115_PAYMENT_DATE_MISSING";
      message: string;
      accrualDate: Date | null;
      requiresReview: true;
    };

export type Model115Deadline = {
  dueDate: Date;
  dueLabel: string;
  periodicity: Model115Periodicity;
  periodLabel: string;
  scopeNote: string;
  requiresOfficialCalendarCheck: true;
};

export type Model115FilingObligation = {
  status: "REQUIRED" | "NOT_REQUIRED" | "NOT_APPLICABLE" | "UNKNOWN";
  reasons: string[];
  reasonCodes: string[];
  operationsSignal: "HAS_OPS" | "ZERO_OPS" | "UNKNOWN";
  censusSignal: "YES" | "NO" | "UNKNOWN";
  outcomeHint: Model115Outcome | null;
};

export type Model115Result = {
  year: number;
  quarter: FiscalQuarter;
  month: number | null;
  periodicity: Model115Periodicity;
  label: string;
  scopeNote: string;
  periodRuleNote: string;
  boxes: Model115Boxes;
  boxList: { code: string; label: string; value: number; supported: boolean }[];
  landlords: {
    counterpartyId: string;
    taxId: string;
    name: string;
    baseAmount: number;
    withholdingAmount: number;
    leaseIds: string[];
    trace: Model115TraceLine[];
  }[];
  warnings: Model115Warning[];
  requiresReview: boolean;
  outcome: Model115Outcome;
  filingObligation: Model115FilingObligation;
  deadline: Model115Deadline;
  excludedMissingPaymentDate: Model115WithholdingRow[];
};

export type Model115PresentedSnapshot = {
  version: 1;
  year: number;
  quarter: FiscalQuarter;
  boxes: Model115Boxes;
  landlords: {
    counterpartyId: string;
    taxId: string;
    name: string;
    baseAmount: number;
    withholdingAmount: number;
  }[];
  outcome: Model115Outcome;
  presentedAt?: string;
};
