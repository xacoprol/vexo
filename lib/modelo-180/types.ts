/**
 * Modelo 180 — resumen anual retenciones alquileres urbanos (Fase 9.6).
 *
 * Fuente: FiscalWithholding PRACTICED/RENT + BusinessPremisesLease.
 * Diseño registro AEAT (DR 180):
 * - Tipo 1: Nº total perceptores (= nº registros tipo 2), base total, retenciones total.
 * - Tipo 2: un registro por perceptor+inmueble (ref. catastral distinta).
 * Plazo: 1 ene – 2 feb año siguiente (sede AEAT).
 */

export const MODEL180_SCOPE_NOTE =
  "Modelo 180 · scope VEXO Fase 9.6: retenciones PRACTICED/RENT con desglose " +
  "arrendador+inmueble. Sin fichero oficial ni certificados PDF.";

export type Model180ReconciliationStatus =
  | "MATCH"
  | "DIFFERENCES"
  | "PROVISIONAL"
  | "REQUIRES_REVIEW";

export type Model180Outcome =
  | "READY"
  | "NO_RELEVANT_PAYMENTS"
  | "REQUIRES_REVIEW";

export type Model180Warning = {
  code: string;
  message: string;
  withholdingId?: string;
  leaseId?: string;
  counterpartyId?: string;
  sourceId?: string;
  severity?: "ERROR" | "WARNING" | "INFO";
};

export type Model180LeaseRef = {
  id: string;
  counterpartyId: string;
  propertyAddress: string;
  cadastralReference: string | null;
  municipality?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string;
  withholdingStatus: string;
  active: boolean;
};

export type Model180WithholdingRow = {
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

export type Model180TraceLine = {
  withholdingId: string;
  leaseId: string | null;
  counterpartyId: string;
  paymentDate: string;
  baseAmount: number;
  withholdingAmount: number;
  expenseId: string | null;
  href: string | null;
  quarter: number | null;
};

/**
 * Registro tipo 2: arrendador + inmueble (no agrupar locales distintos).
 * Situación inmueble: 1=con RC península, 4=sin RC (diseño AEAT).
 */
export type Model180LandlordRecord = {
  recordKey: string;
  counterpartyId: string;
  taxId: string;
  name: string;
  leaseId: string | null;
  propertyAddress: string;
  cadastralReference: string | null;
  /** 1–4 según diseño AEAT; 4 si falta referencia catastral. */
  propertySituation: 1 | 2 | 3 | 4;
  annualBaseAmount: number;
  annualWithholdingAmount: number;
  cadastralMissing: boolean;
  certificateReady: boolean;
  trace: Model180TraceLine[];
};

export type Model180Summary = {
  /** NÚMERO TOTAL DE PERCEPTORES = nº registros tipo 2. */
  totalPayeeRecords: number;
  totalBaseAmount: number;
  totalWithholdingAmount: number;
  uniqueLandlordCount: number;
};

export type Model180ConsistencyIssue = {
  code:
    | "WITHHOLDING_MISSING_115"
    | "WITHHOLDING_MISSING_180"
    | "WITHHOLDING_DOUBLE_COUNTED";
  withholdingId: string;
  message: string;
};

export type Model180Reconciliation = {
  status: Model180ReconciliationStatus;
  sum115Bases: number;
  sum115Withholdings: number;
  annual180Bases: number;
  annual180Withholdings: number;
  baseDelta: number;
  withholdingDelta: number;
  presented115Quarters: number[];
  provisionalQuarters: number[];
  leaseDiffs: {
    leaseId: string | null;
    counterpartyId: string;
    q115Base: number;
    annual180Base: number;
    delta: number;
  }[];
  consistency: Model180ConsistencyIssue[];
  notes: string[];
};

export type Model180FilingObligation = {
  status: "REQUIRED" | "NOT_REQUIRED" | "NOT_APPLICABLE" | "UNKNOWN";
  reasons: string[];
  reasonCodes: string[];
  operationsSignal: "HAS_OPS" | "ZERO_OPS" | "UNKNOWN";
  censusSignal: "YES" | "NO" | "UNKNOWN";
};

export type Model180Deadline = {
  dueDate: Date;
  dueLabel: string;
  periodLabel: string;
  scopeNote: string;
  requiresOfficialCalendarCheck: true;
};

export type Model180Result = {
  year: number;
  label: string;
  scopeNote: string;
  summary: Model180Summary;
  records: Model180LandlordRecord[];
  warnings: Model180Warning[];
  requiresReview: boolean;
  outcome: Model180Outcome;
  filingObligation: Model180FilingObligation;
  deadline: Model180Deadline;
  reconciliation: Model180Reconciliation;
  excludedMissingPaymentDate: Model180WithholdingRow[];
  includedWithholdingIds: string[];
};

export type Model180PresentedSnapshot = {
  version: 1;
  year: number;
  summary: Model180Summary;
  records: {
    recordKey: string;
    counterpartyId: string;
    taxId: string;
    name: string;
    leaseId: string | null;
    propertyAddress: string;
    cadastralReference: string | null;
    annualBaseAmount: number;
    annualWithholdingAmount: number;
  }[];
  reconciliation: Pick<
    Model180Reconciliation,
    | "status"
    | "sum115Bases"
    | "sum115Withholdings"
    | "annual180Bases"
    | "annual180Withholdings"
  >;
  warnings: { code: string; message: string }[];
  outcome: Model180Outcome;
  presentedAt?: string;
};
