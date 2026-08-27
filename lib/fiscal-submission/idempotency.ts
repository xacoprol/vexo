/**
 * Idempotencia de intentos de presentación.
 * Clave: tenant + model + year + quarter + declarationHash
 */

import type {
  FiscalSubmissionAttemptRecord,
  IdempotencyDecision,
  SubmissionAttemptStatus,
} from "@/lib/fiscal-submission/types";
import type { DeclarationModelCode } from "@/lib/fiscal-declaration/types";

export function submissionIdempotencyKey(opts: {
  tenantId: string;
  model: DeclarationModelCode;
  year: number;
  quarter: number;
  declarationHash: string;
}): string {
  return [
    opts.tenantId,
    opts.model,
    String(opts.year),
    String(opts.quarter),
    opts.declarationHash,
  ].join("|");
}

export function decideSubmissionIdempotency(
  existing: FiscalSubmissionAttemptRecord[]
): IdempotencyDecision {
  const accepted = existing.find((a) => a.status === "ACCEPTED");
  if (accepted) {
    return {
      action: "RETURN_EXISTING",
      attemptId: accepted.id,
      status: accepted.status,
      reason: "Ya existe presentación ACCEPTED para esta declaración.",
    };
  }

  const submitting = existing.find((a) => a.status === "SUBMITTING");
  if (submitting) {
    return {
      action: "BLOCK",
      attemptId: submitting.id,
      status: submitting.status,
      reason: "Hay un envío SUBMITTING en curso; no reintentar a ciegas.",
    };
  }

  const unknown = existing.find(
    (a) => a.status === "SUBMISSION_STATUS_UNKNOWN"
  );
  if (unknown) {
    return {
      action: "RECONCILE_REQUIRED",
      attemptId: unknown.id,
      reason:
        "Estado de envío desconocido tras pérdida de respuesta; reconciliar antes de retry.",
    };
  }

  const userAction = existing.find(
    (a) =>
      a.status === "USER_ACTION_REQUIRED" ||
      a.status === "PREPARED" ||
      a.status === "PAYMENT_REQUIRED"
  );
  if (userAction) {
    return {
      action: "RETURN_EXISTING",
      attemptId: userAction.id,
      status: userAction.status,
      reason: "Reutilizar intento asistido existente (idempotente).",
    };
  }

  const technical = existing.filter((a) => a.status === "TECHNICAL_ERROR");
  if (technical.length > 0) {
    return {
      action: "PROCEED",
      reason: "Error técnico previo: retry controlado permitido.",
    };
  }

  const rejected = existing.filter((a) => a.status === "REJECTED");
  if (rejected.length > 0) {
    return {
      action: "PROCEED",
      reason: "Rechazo AEAT previo: nuevo intento tras corrección manual.",
    };
  }

  return { action: "PROCEED", reason: "Sin intento previo para esta clave." };
}

export function isRetryAllowed(status: SubmissionAttemptStatus): boolean {
  return status === "TECHNICAL_ERROR" || status === "REJECTED";
}
