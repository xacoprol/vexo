/**
 * Preparación Fase 16 — investigación Sede AEAT cerrada.
 * Sin API pública; estrategia asistida. Ver docs/fiscal/aeat-submission.md
 */

import type { DeclarationModelCode } from "@/lib/fiscal-declaration/types";
import { getAeatCapability } from "@/lib/fiscal-submission/capability";

export type AeatIntegrationStatus =
  | "READY_FOR_INTEGRATION"
  | "ASSISTED_ONLY"
  | "EXTERNAL_RESEARCH_REQUIRED"
  | "BLOCKED";

export type AeatReadinessNote = {
  model: DeclarationModelCode;
  status: AeatIntegrationStatus;
  knownMechanism: string;
  formatNeeded: string;
  auth: string;
  transport: string;
  paymentNrc: string;
  evidence: string;
};

function noteFor(model: DeclarationModelCode): AeatReadinessNote {
  const cap = getAeatCapability(model);
  return {
    model,
    status: "ASSISTED_ONLY",
    knownMechanism: `${cap.capability}: form web Sede` +
      (cap.hasOfficialFileDesign ? " + diseño registro oficial (no serializer VEXO)" : ""),
    formatNeeded:
      "No hay WS/API pública. Fichero oficial existe para algunos modelos pero VEXO no exporta formato aproximado.",
    auth: cap.auth,
    transport: "ASSISTED_WEB → usuario presenta en Sede; VEXO registra justificante MANUAL_AEAT.",
    paymentNrc: cap.nrcWhenPayable
      ? "NRC / domiciliación en Sede si a ingresar; VEXO no genera NRC."
      : "N/A (informativo).",
    evidence: "FiscalSubmissionAttempt + FiscalFiling (MANUAL_AEAT) + PDF opcional.",
  };
}

export const AEAT_READINESS: Record<
  DeclarationModelCode,
  AeatReadinessNote
> = {
  "130": noteFor("130"),
  "303": noteFor("303"),
  "349": noteFor("349"),
  "111": noteFor("111"),
  "115": noteFor("115"),
};
