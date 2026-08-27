/**
 * Declaración fiscal estructurada desde snapshot congelado (Fase 15).
 * NO recalcula. NO es formato oficial AEAT.
 */

import type { FiscalModelSnapshotDetail } from "@/lib/fiscal-snapshot/types";

export const DECLARATION_SCHEMA = "vexo-fiscal-declaration/1" as const;
export const DECLARATION_DRAFT_VERSION = 1 as const;

export type DeclarationModelCode = "130" | "303" | "349" | "111" | "115";

export type FiscalDeclarationValidationCode =
  | "REQUIRED_FIELD_MISSING"
  | "INVALID_FORMAT"
  | "INVALID_PERIOD"
  | "INVALID_NIF"
  | "INVALID_VAT_ID"
  | "SNAPSHOT_MISMATCH"
  | "DECLARATION_SNAPSHOT_MISMATCH"
  | "UNSUPPORTED_BOX"
  | "UNSUPPORTED_MODEL_FEATURE"
  | "TOTAL_MISMATCH"
  | "SNAPSHOT_INCOMPLETE"
  | "PRE_FILING_REVIEW_REQUIRED"
  | "STALE_REVIEW"
  | "NOT_READY_FOR_SUBMISSION"
  | "ENGINE_CHANGED_REVIEW_REQUIRED"
  | "TENANT_MISMATCH"
  | "REVIEW_NOT_FOUND";

export type FiscalDeclarationValidationIssue = {
  code: FiscalDeclarationValidationCode;
  message: string;
  field?: string;
  severity: "ERROR" | "WARNING";
};

export type FiscalDeclarationDraft = {
  version: typeof DECLARATION_DRAFT_VERSION;
  schema: typeof DECLARATION_SCHEMA;
  model: DeclarationModelCode;
  year: number;
  quarter: number;
  period: string;
  preFilingReviewId: string;
  engineVersion: string;
  sourceHash: string;
  censusHash: string;
  declarationHash: string;
  generatedAt: string;
  /** Importes canónicos: string decimal "736.07" o null */
  boxes: Record<string, string | null>;
  result: string | null;
  detail?: FiscalModelSnapshotDetail;
  metadata: {
    nif?: string;
    taxpayerName?: string;
    regime?: string;
    frozenAt?: string;
  };
  validation: {
    valid: boolean;
    errors: FiscalDeclarationValidationIssue[];
    warnings: FiscalDeclarationValidationIssue[];
  };
};

export type GenerateDeclarationResult =
  | { ok: true; draft: FiscalDeclarationDraft }
  | {
      ok: false;
      error: FiscalDeclarationValidationCode;
      message: string;
      issues?: FiscalDeclarationValidationIssue[];
    };
