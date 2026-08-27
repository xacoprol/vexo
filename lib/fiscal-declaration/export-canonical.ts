/**
 * Export canónico VEXO — NO es formato oficial AEAT.
 */

import type { FiscalDeclarationDraft } from "@/lib/fiscal-declaration/types";

export type VexoDeclarationExportV1 = {
  schema: "vexo-fiscal-declaration/1";
  model: string;
  year: number;
  period: string;
  taxpayer: {
    nif?: string;
    name?: string;
    regime?: string;
  };
  boxes: Record<string, string | null>;
  result: string | null;
  detail?: FiscalDeclarationDraft["detail"];
  integrity: {
    sourceHash: string;
    censusHash: string;
    declarationHash: string;
    engineVersion: string;
    preFilingReviewId: string;
  };
  /** Informativo; no entra en declarationHash */
  meta: {
    generatedAt: string;
    frozenAt?: string;
    note: string;
  };
};

export function toCanonicalVexoExport(
  draft: FiscalDeclarationDraft
): VexoDeclarationExportV1 {
  return {
    schema: "vexo-fiscal-declaration/1",
    model: draft.model,
    year: draft.year,
    period: draft.period,
    taxpayer: {
      nif: draft.metadata.nif,
      name: draft.metadata.taxpayerName,
      regime: draft.metadata.regime,
    },
    boxes: draft.boxes,
    result: draft.result,
    detail: draft.detail,
    integrity: {
      sourceHash: draft.sourceHash,
      censusHash: draft.censusHash,
      declarationHash: draft.declarationHash,
      engineVersion: draft.engineVersion,
      preFilingReviewId: draft.preFilingReviewId,
    },
    meta: {
      generatedAt: draft.generatedAt,
      frozenAt: draft.metadata.frozenAt,
      note: "Exportación interna VEXO. No es formato oficial AEAT ni predeclaración telemática.",
    },
  };
}
