import type { FiscalQuarter } from "@/lib/fiscal";

/** Claves oficiales Modelo 349 soportadas en VEXO. */
export type Model349OperationKey =
  | "E"
  | "A"
  | "S"
  | "I"
  | "T"
  | "M"
  | "H"
  | "R"
  | "D"
  | "C";

export type Model349Periodicity = "MONTHLY" | "QUARTERLY";

export type Model349FilingPeriodKind =
  | "QUARTERLY"
  | "QUARTERLY_TRUNCATED"
  | "MONTHLY";

/** Período de presentación 349 — independiente del quarter genérico cuando hay truncado/mensual. */
export type Model349FilingPeriod = {
  kind: Model349FilingPeriodKind;
  year: number;
  quarter: FiscalQuarter;
  startMonth: number;
  endMonth: number;
  /** Mes en el que se supera el umbral (solo truncado). */
  crossingMonth?: number;
  label: string;
  deadline: Model349Deadline;
};

export type Model349MonthlyRegimeReason =
  | null
  | "REFERENCE_QUARTER_EXCEEDED"
  | "PRIOR_QUARTER_EXCEEDED";

export type Model349TraceLine = {
  sourceType: "invoice" | "expense" | "marketplace";
  sourceId: string;
  label: string;
  issueDate: string;
  base: number;
  href?: string;
};

export type Model349Operation = {
  vatId: string;
  country: string | null;
  operatorName: string;
  key: Model349OperationKey;
  amount: number;
  trace: Model349TraceLine[];
};

export type Model349Rectification = {
  operatorVatId: string;
  operatorName: string;
  country: string | null;
  operationKey: Model349OperationKey;
  /** Periodo cuya declaración se corrige (histórico). */
  originalPeriod: string;
  /** Periodo en el que se incluye esta rectificación (presentación actual). */
  filingPeriod: string;
  previousAmount: number;
  correctedAmount: number;
  delta: number;
  trace: Model349TraceLine[];
  needsReview: boolean;
  reviewCode?: "PRIOR_349_DATA_MISSING";
};

export type Model349Warning = {
  code: string;
  message: string;
  sourceId?: string;
};

export type Model349ThresholdContext = {
  threshold: number;
  referenceQuarterKey: string;
  referenceQuarterAmount: number;
  priorQuarterAmounts: { key: string; label: string; amount: number }[];
  monthlyRegimeReason: Model349MonthlyRegimeReason;
  operationsIncluded: string;
};

export type Model349Deadline = {
  dueDate: Date;
  dueLabel: string;
  periodicity: Model349Periodicity;
  periodLabel: string;
  scopeNote: string;
};

export type Model349SnapshotOperation = {
  vatId: string;
  country: string | null;
  operatorName: string;
  key: Model349OperationKey;
  amount: number;
};

/** Snapshot inmutable al marcar presentado (rawExtract.model349Snapshot). */
export type Model349PresentedSnapshot = {
  version: 1;
  periodicity: Model349Periodicity;
  operations: Model349SnapshotOperation[];
  rectifications: Omit<
    Model349Rectification,
    "trace" | "needsReview" | "reviewCode"
  >[];
};

export type Model349Result = {
  year: number;
  quarter: FiscalQuarter;
  label: string;
  periodicity: Model349Periodicity;
  monthlyRegimeReason: Model349MonthlyRegimeReason;
  thresholdContext: Model349ThresholdContext;
  /** Periodos de presentación requeridos (trimestral, truncado y/o mensuales). */
  filingPeriods: Model349FilingPeriod[];
  deadline: Model349Deadline;
  operations: Model349Operation[];
  rectifications: Model349Rectification[];
  warnings: Model349Warning[];
  /** Operaciones agregadas por clave (auditoría rápida). */
  totalsByKey: Partial<Record<Model349OperationKey, number>>;
  totalOperations: number;
  hasOps: boolean;
  incompleteVatId: boolean;
  needsAttention: boolean;
  skippedMissingVatId: number;
  skippedMissingVatIdEntregas: number;
  skippedMissingVatIdAdquisiciones: number;
};
