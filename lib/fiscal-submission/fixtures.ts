/**
 * Fixtures de respuestas (schemas conceptuales) — sin datos personales reales.
 * No hay parser de red AEAT en Fase 16; fixtures documentan contrato futuro.
 */

import type { SubmissionAttemptStatus } from "@/lib/fiscal-submission/types";

export type AeatResponseFixture = {
  id: string;
  kind:
    | "accepted"
    | "rejected"
    | "technical_error"
    | "payment_required"
    | "duplicate_idempotent"
    | "status_unknown";
  mappedStatus: SubmissionAttemptStatus;
  responseCode: string | null;
  errorCode: string | null;
  receiptId: string | null;
  safeMessage: string;
};

export const AEAT_RESPONSE_FIXTURES: AeatResponseFixture[] = [
  {
    id: "fx-accepted",
    kind: "accepted",
    mappedStatus: "ACCEPTED",
    responseCode: "200",
    errorCode: null,
    receiptId: "CSV-DEMO-000000000",
    safeMessage: "Presentación aceptada (fixture).",
  },
  {
    id: "fx-rejected",
    kind: "rejected",
    mappedStatus: "REJECTED",
    responseCode: "400",
    errorCode: "AEAT_REJECT_DEMO",
    receiptId: null,
    safeMessage: "Rechazo fiscal de ejemplo; no recalcular automáticamente.",
  },
  {
    id: "fx-technical",
    kind: "technical_error",
    mappedStatus: "TECHNICAL_ERROR",
    responseCode: null,
    errorCode: "TIMEOUT",
    receiptId: null,
    safeMessage: "Fallo técnico; no asumir si AEAT recibió el envío.",
  },
  {
    id: "fx-payment",
    kind: "payment_required",
    mappedStatus: "PAYMENT_REQUIRED",
    responseCode: "402",
    errorCode: "NRC_REQUIRED",
    receiptId: null,
    safeMessage: "Se requiere NRC o domiciliación antes de concluir.",
  },
  {
    id: "fx-dup",
    kind: "duplicate_idempotent",
    mappedStatus: "ACCEPTED",
    responseCode: "409",
    errorCode: "ALREADY_ACCEPTED",
    receiptId: "CSV-DEMO-000000000",
    safeMessage: "Declaración ya aceptada; no reenviar.",
  },
  {
    id: "fx-unknown",
    kind: "status_unknown",
    mappedStatus: "SUBMISSION_STATUS_UNKNOWN",
    responseCode: null,
    errorCode: "RESPONSE_LOST",
    receiptId: null,
    safeMessage: "Respuesta perdida tras envío; reconciliar antes de retry.",
  },
];

export function mapFixtureToStatus(
  fixtureId: string
): SubmissionAttemptStatus | null {
  return AEAT_RESPONSE_FIXTURES.find((f) => f.id === fixtureId)?.mappedStatus ?? null;
}
