/**
 * Contratos de presentación AEAT (Fase 16).
 * Sin submit automático: canal asistido / registro manual.
 */

import type { DeclarationModelCode } from "@/lib/fiscal-declaration/types";
import type { FiscalDeclarationDraft } from "@/lib/fiscal-declaration/types";
import type { AeatChannelCapability, VexoSubmissionStrategy } from "@/lib/fiscal-submission/capability";

export type SubmissionChannel =
  | "ASSISTED_WEB"
  | "MANUAL_AEAT"
  | "FILE_IMPORT" // reservado; no usado en Fase 16
  | "DIRECT_API"; // reservado; no soportado

export type SubmissionAttemptStatus =
  | "PREPARED"
  | "SUBMITTING"
  | "ACCEPTED"
  | "REJECTED"
  | "TECHNICAL_ERROR"
  | "USER_ACTION_REQUIRED"
  | "PAYMENT_REQUIRED"
  | "SUBMISSION_STATUS_UNKNOWN";

export type FiscalPaymentRequirementStatus =
  | "NONE"
  | "DIRECT_DEBIT"
  | "NRC_REQUIRED"
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED";

export type FiscalPaymentRequirement = {
  status: FiscalPaymentRequirementStatus;
  amount: string | null;
  currency: "EUR";
  notes: string;
};

export type ReviewMatchFlag =
  | "FILED_MATCHES_REVIEW"
  | "FILED_DIFFERS_FROM_REVIEW";

export type SubmissionCapability = {
  model: DeclarationModelCode;
  capability: AeatChannelCapability;
  strategy: VexoSubmissionStrategy;
  canPrepare: boolean;
  canAutoSubmit: boolean;
  sedeUrl: string;
  reason: string;
  payment: FiscalPaymentRequirement;
};

export type PreparedSubmission = {
  model: DeclarationModelCode;
  year: number;
  quarter: number;
  preFilingReviewId: string;
  declarationHash: string;
  sourceHash: string;
  censusHash: string;
  engineVersion: string;
  channel: SubmissionChannel;
  status: Extract<
    SubmissionAttemptStatus,
    "PREPARED" | "USER_ACTION_REQUIRED"
  >;
  sedeUrl: string;
  boxes: Record<string, string | null>;
  result: string | null;
  payment: FiscalPaymentRequirement;
  checklist: string[];
  preparedAt: string;
  requestFingerprint: string;
};

export type FiscalSubmissionAuth = {
  /** Nunca certificado/clave; solo metadatos de legitimación declarados. */
  mode: "NONE" | "USER_WILL_AUTH_IN_SEDE";
  actorHint?: string;
};

export type FiscalSubmissionResult = {
  status: SubmissionAttemptStatus;
  responseCode?: string;
  errorCode?: string;
  receiptId?: string;
  filingId?: string;
  safeMessage: string;
  channel: SubmissionChannel;
};

export type FiscalSubmissionAttemptRecord = {
  id: string;
  tenantId: string;
  model: DeclarationModelCode;
  year: number;
  quarter: number;
  preFilingReviewId: string;
  declarationHash: string;
  startedAt: string;
  finishedAt: string | null;
  status: SubmissionAttemptStatus;
  channel: SubmissionChannel;
  requestFingerprint: string | null;
  responseCode: string | null;
  errorCode: string | null;
  receiptId: string | null;
  filingId: string | null;
  paymentRequirement: FiscalPaymentRequirementStatus | null;
  reviewMatchFlag: ReviewMatchFlag | null;
  safeMessage: string | null;
};

export type IdempotencyDecision =
  | { action: "PROCEED"; reason: string }
  | { action: "RETURN_EXISTING"; attemptId: string; status: SubmissionAttemptStatus; reason: string }
  | { action: "BLOCK"; reason: string; attemptId?: string; status?: SubmissionAttemptStatus }
  | { action: "RECONCILE_REQUIRED"; reason: string; attemptId: string };

export type ManualFilingRegistrationInput = {
  tenantId: string;
  draft: FiscalDeclarationDraft;
  filedAt: string;
  receiptId: string;
  csv?: string | null;
  /** Resultado declarado en Sede (string decimal). */
  filedResult: string | null;
  /** Casillas declaradas; si omitidas se asume copia del draft. */
  filedBoxes?: Record<string, string | null>;
  notes?: string | null;
  nrc?: string | null;
};

export type ManualFilingRegistrationResult = {
  ok: true;
  filingSource: "MANUAL_AEAT";
  reviewMatchFlag: ReviewMatchFlag;
  attemptStatus: "ACCEPTED";
  lineage: {
    preFilingReviewId: string;
    declarationHash: string;
    sourceHash: string;
    censusHash: string;
    engineVersion: string;
    submissionAttemptId: string;
  };
  filingPayload: {
    modelType: DeclarationModelCode;
    year: number;
    quarter: number;
    result: number;
    boxes: { code: string; label: string; value: number }[];
    filedAt: string;
    receiptId: string;
    rawExtract: Record<string, unknown>;
  };
};

/** Adapter contract — submit opcional (no se usa en Fase 16). */
export interface FiscalSubmissionAdapter {
  model: DeclarationModelCode;
  canSubmit(
    declaration: FiscalDeclarationDraft
  ): Promise<SubmissionCapability> | SubmissionCapability;
  prepare(
    declaration: FiscalDeclarationDraft
  ): Promise<PreparedSubmission> | PreparedSubmission;
  submit?(
    prepared: PreparedSubmission,
    authContext: FiscalSubmissionAuth
  ): Promise<FiscalSubmissionResult>;
}
