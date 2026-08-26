import type { FiscalQuarter } from "@/lib/fiscal";

/** A = compras/adquisiciones · B = ventas/entregas (347). */
export type Model347OperationType = "A" | "B";

export type Model347EligibilityReason =
  | "INCLUDED_DOMESTIC_SALE"
  | "INCLUDED_DOMESTIC_PURCHASE"
  | "INCLUDED_RECTIFICATION"
  | "EXCLUDED_MODEL349"
  | "EXCLUDED_EXPORT"
  | "EXCLUDED_CANARY_ISLANDS"
  | "EXCLUDED_IMPORT"
  | "EXCLUDED_NON_EU_COUNTERPARTY"
  | "EXCLUDED_ANULLED"
  | "EXCLUDED_NOT_ISSUED"
  | "EXCLUDED_OPERATOR_UNKNOWN"
  | "EXCLUDED_MARKETPLACE_NO_OPERATOR";

export type Model347Eligibility = {
  include: boolean;
  reason: Model347EligibilityReason;
  warning?: string;
};

export type Model347TraceLine = {
  sourceType: "invoice" | "expense" | "marketplace";
  sourceId: string;
  label: string;
  issueDate: string;
  amount: number;
  quarter: FiscalQuarter;
  href?: string;
};

export type Model347QuarterAmounts = {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
};

export type Model347Operator = {
  operatorId: string;
  taxId: string;
  name: string;
  country: string | null;
  operationType: Model347OperationType;
  /** Devengo / operaciones no RECC. */
  annualAmount: number;
  /** Criterio de caja IVA (RECC) — imputación por cobro/pago. */
  cashAccountingAnnualAmount?: number;
  cashAccountingQuarters?: Model347QuarterAmounts;
  /** Pista informativa de posible metálico (no suma al total declarable). */
  cashPaymentHintAmount?: number;
  quarters: Model347QuarterAmounts;
  trace: Model347TraceLine[];
  /** Por encima del umbral legal (> 3.005,06 €) en importe efectivo. */
  declarable: boolean;
  /** RECC u otros datos insuficientes — no cerrar 347 automáticamente. */
  requiresReview?: boolean;
};

export type Model347ExcludedOperation = {
  sourceType: "invoice" | "expense" | "marketplace";
  sourceId: string;
  label: string;
  operatorName: string | null;
  amount: number;
  reason: Model347EligibilityReason;
  reasonLabel: string;
};

export type Model347Warning = {
  code: string;
  message: string;
  sourceId?: string;
};

export type Model347Deadline = {
  dueDate: Date;
  dueLabel: string;
  periodLabel: string;
  scopeNote: string;
  /** true si el plazo puede depender de festivo AEAT no modelado. */
  requiresOfficialCalendarCheck: boolean;
  resolution: "official" | "weekend_adjusted" | "february_last_day";
};

export type Model347SnapshotOperator = {
  taxId: string;
  name: string;
  operationType: Model347OperationType;
  annualAmount: number;
  cashAccountingAnnualAmount?: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
};

export type Model347PresentedSnapshot = {
  version: 1;
  operators: Model347SnapshotOperator[];
};

export type Model347ThresholdContext = {
  threshold: number;
  /** Regla AEAT: superior a 3.005,06 € (estricto). */
  rule: string;
};

export type Model347Result = {
  year: number;
  thresholdContext: Model347ThresholdContext;
  deadline: Model347Deadline;
  operators: Model347Operator[];
  /** Operadores declarables (superan umbral y sin revisión pendiente). */
  declarableOperators: Model347Operator[];
  excludedOperations: Model347ExcludedOperation[];
  warnings: Model347Warning[];
  salesTotal: number;
  purchasesTotal: number;
  declarableCount: number;
  skippedOperatorReview: number;
  /** true si hay operadores RECC con datos incompletos u otras revisiones bloqueantes. */
  requiresReview: boolean;
  /** Metálico: VEXO no acumula por operador de forma fiable. */
  cashPaymentsScopeNote: string;
  /** Arrendamientos/inmuebles: fuera de scope VEXO actual. */
  rentalsScopeNote: string;
};
