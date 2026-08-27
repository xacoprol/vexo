/**
 * Validación stale antes de prepare/registro.
 */

import type { FiscalDeclarationDraft } from "@/lib/fiscal-declaration/types";

export type StaleCheckInput = {
  draft: FiscalDeclarationDraft;
  current: {
    sourceHash: string;
    censusHash: string;
    engineVersion: string;
    lifecycleStatus: string;
    declarationHash?: string;
  };
};

export type StaleCheckResult =
  | { ok: true }
  | { ok: false; code: "STALE_REVIEW" | "NOT_READY_FOR_SUBMISSION" | "HASH_MISMATCH"; message: string };

export function assertReadyForAssistedSubmission(
  input: StaleCheckInput
): StaleCheckResult {
  if (input.current.lifecycleStatus !== "READY_FOR_SUBMISSION") {
    return {
      ok: false,
      code: "NOT_READY_FOR_SUBMISSION",
      message: "El periodo no está READY_FOR_SUBMISSION; no preparar presentación.",
    };
  }
  if (input.draft.sourceHash !== input.current.sourceHash) {
    return {
      ok: false,
      code: "STALE_REVIEW",
      message: "sourceHash distinto del freeze; no presentar.",
    };
  }
  if (input.draft.censusHash !== input.current.censusHash) {
    return {
      ok: false,
      code: "STALE_REVIEW",
      message: "censusHash distinto del freeze; no presentar.",
    };
  }
  if (input.draft.engineVersion !== input.current.engineVersion) {
    return {
      ok: false,
      code: "STALE_REVIEW",
      message: "engineVersion distinto; regenerar revisión.",
    };
  }
  if (
    input.current.declarationHash &&
    input.current.declarationHash !== input.draft.declarationHash
  ) {
    return {
      ok: false,
      code: "HASH_MISMATCH",
      message: "declarationHash no coincide con el esperado.",
    };
  }
  if (!input.draft.validation.valid) {
    return {
      ok: false,
      code: "NOT_READY_FOR_SUBMISSION",
      message: "La declaración tiene errores de validación.",
    };
  }
  return { ok: true };
}
