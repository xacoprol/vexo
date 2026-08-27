/**
 * Snapshot fiscal v1 — trazabilidad de filings nuevos (Fase 12).
 * Backward-compatible: se anida en rawExtract sin romper OCR legacy.
 */

export const FISCAL_SNAPSHOT_V1 = 1 as const;

/** Versión de motor serializable (sin red). */
export const FISCAL_ENGINE_VERSION = "vexo-fiscal-0.1.0";

export type FiscalSnapshotSourceIds = {
  expenses?: string[];
  invoices?: string[];
  withholdings?: string[];
  leases?: string[];
  marketplace?: string[];
};

/**
 * Detalle opcional por modelo (Fase 15).
 * Backward-compatible: freezes antiguos sin `detail` siguen parseables.
 */
export type FiscalModelSnapshotDetail = {
  /** 349: operadores por clave */
  operations?: {
    vatId: string;
    country: string | null;
    operatorName: string;
    key: string;
    amount: number;
  }[];
  /** 349 */
  periodicity?: string;
  totalsByKey?: Record<string, number>;
  /** 111 */
  payees?: {
    counterpartyId: string;
    name: string;
    taxId: string;
    baseAmount: number;
    withholdingAmount: number;
  }[];
  /** 115 */
  landlords?: {
    counterpartyId: string;
    taxId: string;
    name: string;
    baseAmount: number;
    withholdingAmount: number;
  }[];
  /** outcome textual del motor si aplica */
  outcome?: string;
};

export type FiscalModelSnapshotV1 = {
  version: typeof FISCAL_SNAPSHOT_V1;
  model: string;
  year: number;
  quarter?: number | null;
  period?: string;
  computedAt: string;
  engineVersion: string;
  result: number | null;
  boxes: Record<string, number | string | null>;
  bases: Record<string, number | string | null>;
  sourceIds: FiscalSnapshotSourceIds;
  sourceHash: string;
  warnings: string[];
  census: Record<string, unknown>;
  /** Momento del libro usado para este cálculo (ISO). */
  bookCutoffAt: string;
  /**
   * Detalle estructurado (operadores 349, payees 111, landlords 115).
   * Opcional: freezes Fase 12–14 pueden no tenerlo.
   */
  detail?: FiscalModelSnapshotDetail;
};

export type BookDriftChange = {
  sourceType: keyof FiscalSnapshotSourceIds;
  sourceId: string;
};

export type BookDriftReport = {
  reconciliationStatus:
    | "MATCH"
    | "CURRENT_BOOK_CHANGED_AFTER_FILING"
    | "LEGACY_LIMITED"
    | "UNEXPLAINED_DIFFERENCE"
    | "POTENTIAL_AMENDMENT_REQUIRED"
    | "NO_FILING";
  filedResult: number | null;
  currentResult: number | null;
  delta: number | null;
  filedSourceHash: string | null;
  currentSourceHash: string | null;
  changes: {
    added: BookDriftChange[];
    removed: BookDriftChange[];
    modified: BookDriftChange[];
  };
  notes: string[];
};

/** Clave canónica en rawExtract por modelo (además de fiscalSnapshotV1). */
export function modelSnapshotRawKey(model: string): string {
  return `model${model}Snapshot`;
}
