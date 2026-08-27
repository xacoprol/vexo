/**
 * Adaptadores asistidos por modelo — sin .submit() a AEAT.
 */

import type { FiscalDeclarationDraft } from "@/lib/fiscal-declaration/types";
import type { DeclarationModelCode } from "@/lib/fiscal-declaration/types";
import {
  AEAT_SEDE_LINKS,
  getAeatCapability,
} from "@/lib/fiscal-submission/capability";
import { assessPaymentRequirement } from "@/lib/fiscal-submission/payment";
import type {
  FiscalSubmissionAdapter,
  PreparedSubmission,
  SubmissionCapability,
} from "@/lib/fiscal-submission/types";
import { createHash } from "node:crypto";

function fingerprint(draft: FiscalDeclarationDraft): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: draft.model,
        year: draft.year,
        quarter: draft.quarter,
        declarationHash: draft.declarationHash,
        channel: "ASSISTED_WEB",
      })
    )
    .digest("hex")
    .slice(0, 32);
}

function checklistFor(model: DeclarationModelCode, paymentStatus: string): string[] {
  const base = [
    "Abrir Sede AEAT con el enlace oficial del modelo",
    "Autenticarse (Cl@ve / certificado) como titular o apoderado",
    "Copiar casillas desde el preview congelado de VEXO",
    "Revisar resultado antes de firmar en Sede",
    "Descargar justificante / CSV tras presentación",
    "Registrar justificante en VEXO (origen MANUAL_AEAT)",
  ];
  if (paymentStatus === "NRC_REQUIRED") {
    base.splice(
      4,
      0,
      "Obtener NRC o domiciliar el pago en Sede (VEXO no paga)"
    );
  }
  if (model === "349") {
    base.splice(
      3,
      0,
      "Verificar operadores NIF-IVA, país y claves A/I frente al detail congelado"
    );
  }
  return base;
}

export function assistedCapability(
  declaration: FiscalDeclarationDraft
): SubmissionCapability {
  const cap = getAeatCapability(declaration.model);
  const payment = assessPaymentRequirement({
    model: declaration.model,
    result: declaration.result,
  });
  return {
    model: declaration.model,
    capability: cap.capability,
    strategy: cap.strategy,
    canPrepare: declaration.validation.valid,
    canAutoSubmit: false,
    sedeUrl: AEAT_SEDE_LINKS[declaration.model],
    reason:
      "Sin API pública AEAT. Flujo asistido: preview + Sede + registro manual de justificante.",
    payment,
  };
}

export function prepareAssistedSubmission(
  declaration: FiscalDeclarationDraft
): PreparedSubmission {
  const capability = assistedCapability(declaration);
  if (!capability.canPrepare) {
    throw new Error("DECLARATION_NOT_VALID");
  }
  return {
    model: declaration.model,
    year: declaration.year,
    quarter: declaration.quarter,
    preFilingReviewId: declaration.preFilingReviewId,
    declarationHash: declaration.declarationHash,
    sourceHash: declaration.sourceHash,
    censusHash: declaration.censusHash,
    engineVersion: declaration.engineVersion,
    channel: "ASSISTED_WEB",
    status: "USER_ACTION_REQUIRED",
    sedeUrl: capability.sedeUrl,
    boxes: declaration.boxes,
    result: declaration.result,
    payment: capability.payment,
    checklist: checklistFor(
      declaration.model,
      capability.payment.status
    ),
    preparedAt: new Date().toISOString(),
    requestFingerprint: fingerprint(declaration),
  };
}

export function createAssistedAdapter(
  model: DeclarationModelCode
): FiscalSubmissionAdapter {
  return {
    model,
    canSubmit(declaration) {
      if (declaration.model !== model) {
        return {
          ...assistedCapability(declaration),
          canPrepare: false,
          reason: `Adaptador ${model} no aplica a ${declaration.model}`,
        };
      }
      return assistedCapability(declaration);
    },
    prepare(declaration) {
      if (declaration.model !== model) {
        throw new Error("MODEL_MISMATCH");
      }
      return prepareAssistedSubmission(declaration);
    },
    // submit omitido a propósito — ASSISTED_WEB_ONLY
  };
}

export const ASSISTED_ADAPTERS: Record<
  DeclarationModelCode,
  FiscalSubmissionAdapter
> = {
  "130": createAssistedAdapter("130"),
  "303": createAssistedAdapter("303"),
  "349": createAssistedAdapter("349"),
  "111": createAssistedAdapter("111"),
  "115": createAssistedAdapter("115"),
};

export function getSubmissionAdapter(
  model: DeclarationModelCode
): FiscalSubmissionAdapter {
  return ASSISTED_ADAPTERS[model];
}
