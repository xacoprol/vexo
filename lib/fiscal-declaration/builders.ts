/**
 * Declaration builders — SOLO leen snapshot congelado.
 * No consultan gastos/facturas/leases actuales.
 */

import type { FiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot/types";
import { serializeBoxes, serializeMoney } from "@/lib/fiscal-declaration/money";
import type {
  DeclarationModelCode,
  FiscalDeclarationDraft,
} from "@/lib/fiscal-declaration/types";
import { DECLARATION_DRAFT_VERSION, DECLARATION_SCHEMA } from "@/lib/fiscal-declaration/types";

export type BuildFromSnapshotInput = {
  model: DeclarationModelCode;
  frozen: FiscalModelSnapshotV1;
  preFilingReviewId: string;
  sourceHash: string;
  censusHash: string;
  metadata: FiscalDeclarationDraft["metadata"];
  generatedAt?: string;
};

/** Mapeo puro snapshot → draft (sin hash/validation aún). */
export function buildDeclarationFromFrozenSnapshot(
  input: BuildFromSnapshotInput
): Omit<FiscalDeclarationDraft, "declarationHash" | "validation"> {
  const { frozen, model } = input;
  const quarter = frozen.quarter ?? 1;
  return {
    version: DECLARATION_DRAFT_VERSION,
    schema: DECLARATION_SCHEMA,
    model,
    year: frozen.year,
    quarter,
    period: `${quarter}T`,
    preFilingReviewId: input.preFilingReviewId,
    engineVersion: frozen.engineVersion,
    sourceHash: input.sourceHash,
    censusHash: input.censusHash,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    boxes: serializeBoxes(frozen.boxes ?? {}),
    result: serializeMoney(frozen.result),
    detail: frozen.detail,
    metadata: { ...input.metadata },
  };
}

export function build130FromSnapshot(
  input: Omit<BuildFromSnapshotInput, "model">
) {
  return buildDeclarationFromFrozenSnapshot({ ...input, model: "130" });
}

export function build303FromSnapshot(
  input: Omit<BuildFromSnapshotInput, "model">
) {
  return buildDeclarationFromFrozenSnapshot({ ...input, model: "303" });
}

export function build349FromSnapshot(
  input: Omit<BuildFromSnapshotInput, "model">
) {
  return buildDeclarationFromFrozenSnapshot({ ...input, model: "349" });
}

export function build111FromSnapshot(
  input: Omit<BuildFromSnapshotInput, "model">
) {
  return buildDeclarationFromFrozenSnapshot({ ...input, model: "111" });
}

export function build115FromSnapshot(
  input: Omit<BuildFromSnapshotInput, "model">
) {
  return buildDeclarationFromFrozenSnapshot({ ...input, model: "115" });
}
