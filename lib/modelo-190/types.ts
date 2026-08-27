/**
 * Modelo 190 — resumen anual retenciones (Fase 9.6).
 *
 * Scope VEXO: únicamente PRACTICED / PROFESSIONAL (clave G cuando clasificada).
 * No soporta: trabajo/nóminas, pensiones, premios, agrario, forestal, imagen (salvo
 * subclave G.08 si se clasifica explícitamente), especie, fichero AEAT.
 *
 * Diseño lógico AEAT ejercicio 2025 (DR 190):
 * - Tipo 1: Nº total percepciones (136-144), importe total percepciones (145-160),
 *   importe total retenciones (161-175).
 * - Tipo 2: CLAVE (78) + SUBCLAVE (79-80) + percepciones dinerarias + retenciones.
 * Fuente: DISENOS_LOGICOS_190_2025.pdf AEAT.
 */

export const MODEL190_SCOPE_NOTE =
  "Modelo 190 · scope VEXO Fase 9.6: solo retenciones PRACTICED/PROFESSIONAL. " +
  "Sin nóminas, pensiones, premios ni fichero oficial. Clave/subclave deben estar " +
  "persistidas; no se inventan desde kind=PROFESSIONAL.";

export const MODEL190_SUPPORTED_SECTIONS = {
  professionalCash: true as const,
  employment: false as const,
  pensions: false as const,
  prizes: false as const,
  agricultural: false as const,
  forestry: false as const,
  imageRights: false as const,
  inKind: false as const,
};

export type Model190SupportedSections = typeof MODEL190_SUPPORTED_SECTIONS;

/** Claves/subclaves G oficiales (diseño lógico 2025). */
export const MODEL190_KEY_G_SUBKEYS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
] as const;
export type Model190KeyGSubKey = (typeof MODEL190_KEY_G_SUBKEYS)[number];

export type Model190ReconciliationStatus =
  | "MATCH"
  | "DIFFERENCES"
  | "PROVISIONAL"
  | "REQUIRES_REVIEW";

export type Model190Outcome =
  | "READY"
  | "NO_RELEVANT_PAYMENTS"
  | "REQUIRES_REVIEW";

export type Model190Warning = {
  code: string;
  message: string;
  withholdingId?: string;
  sourceId?: string;
  counterpartyId?: string;
  severity?: "ERROR" | "WARNING" | "INFO";
};

export type Model190WithholdingRow = {
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
  perceptionKey: string | null;
  perceptionSubKey: string | null;
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

export type Model190TraceLine = {
  withholdingId: string;
  counterpartyId: string;
  sourceType: string;
  sourceId: string;
  paymentDate: string;
  baseAmount: number;
  withholdingAmount: number;
  rate: number;
  href: string | null;
  quarter: number | null;
};

export type Model190PayeeRecord = {
  /** Agrupación oficial: perceptor + clave + subclave. */
  recordKey: string;
  counterpartyId: string;
  taxId: string;
  name: string;
  key: string | null;
  subKey: string | null;
  cashPerceptionAmount: number;
  withholdingAmount: number;
  classificationMissing: boolean;
  /** Datos listos para certificado futuro (sin PDF). */
  certificateReady: boolean;
  trace: Model190TraceLine[];
};

/** Resumen tipo 1 (campos oficiales, no casillas 111). */
export type Model190Summary = {
  /** NÚMERO TOTAL DE PERCEPCIONES = nº registros tipo 2. */
  totalPerceptionRecords: number;
  /** IMPORTE TOTAL DE LAS PERCEPCIONES (dinerarias scope). */
  totalCashPerceptionAmount: number;
  /** IMPORTE TOTAL DE LAS RETENCIONES E INGRESOS A CUENTA. */
  totalWithholdingAmount: number;
  uniquePayeeCount: number;
};

export type Model190ConsistencyIssue = {
  code:
    | "WITHHOLDING_MISSING_111"
    | "WITHHOLDING_MISSING_190"
    | "WITHHOLDING_DOUBLE_COUNTED";
  withholdingId: string;
  message: string;
};

export type Model190Reconciliation = {
  status: Model190ReconciliationStatus;
  sum111Perceptions: number;
  sum111Withholdings: number;
  annual190Perceptions: number;
  annual190Withholdings: number;
  perceptionDelta: number;
  withholdingDelta: number;
  presented111Quarters: number[];
  provisionalQuarters: number[];
  payeeDiffs: {
    counterpartyId: string;
    name: string;
    q111Base: number;
    annual190Base: number;
    delta: number;
  }[];
  consistency: Model190ConsistencyIssue[];
  notes: string[];
};

export type Model190FilingObligation = {
  status: "REQUIRED" | "NOT_REQUIRED" | "NOT_APPLICABLE" | "UNKNOWN";
  reasons: string[];
  reasonCodes: string[];
  operationsSignal: "HAS_OPS" | "ZERO_OPS" | "UNKNOWN";
  censusSignal: "YES" | "NO" | "UNKNOWN";
};

export type Model190Deadline = {
  dueDate: Date;
  dueLabel: string;
  periodLabel: string;
  scopeNote: string;
  requiresOfficialCalendarCheck: true;
};

export type Model190Result = {
  year: number;
  label: string;
  scopeNote: string;
  supportedSections: Model190SupportedSections;
  summary: Model190Summary;
  records: Model190PayeeRecord[];
  warnings: Model190Warning[];
  requiresReview: boolean;
  outcome: Model190Outcome;
  filingObligation: Model190FilingObligation;
  deadline: Model190Deadline;
  reconciliation: Model190Reconciliation;
  excludedMissingPaymentDate: Model190WithholdingRow[];
  includedWithholdingIds: string[];
};

export type Model190PresentedSnapshot = {
  version: 1;
  year: number;
  summary: Model190Summary;
  records: {
    recordKey: string;
    counterpartyId: string;
    taxId: string;
    name: string;
    key: string | null;
    subKey: string | null;
    cashPerceptionAmount: number;
    withholdingAmount: number;
  }[];
  reconciliation: Pick<
    Model190Reconciliation,
    | "status"
    | "sum111Perceptions"
    | "sum111Withholdings"
    | "annual190Perceptions"
    | "annual190Withholdings"
  >;
  warnings: { code: string; message: string }[];
  outcome: Model190Outcome;
  presentedAt?: string;
};
