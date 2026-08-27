/**
 * Hash determinista del artefacto de declaración (sin generatedAt).
 */

import { createHash } from "node:crypto";
import type { FiscalDeclarationDraft } from "@/lib/fiscal-declaration/types";

function stableJson(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

/**
 * Mismo contenido fiscal → mismo hash (orden de keys irrelevante).
 * Excluye generatedAt y validation (derivados).
 */
export function computeDeclarationHash(
  draft: Omit<
    FiscalDeclarationDraft,
    "declarationHash" | "generatedAt" | "validation"
  > & { validation?: unknown; generatedAt?: unknown; declarationHash?: unknown }
): string {
  const payload = {
    schema: draft.schema,
    version: draft.version,
    model: draft.model,
    year: draft.year,
    quarter: draft.quarter,
    period: draft.period,
    preFilingReviewId: draft.preFilingReviewId,
    engineVersion: draft.engineVersion,
    sourceHash: draft.sourceHash,
    censusHash: draft.censusHash,
    boxes: draft.boxes,
    result: draft.result,
    detail: draft.detail ?? null,
    metadata: {
      nif: draft.metadata.nif ?? null,
      taxpayerName: draft.metadata.taxpayerName ?? null,
      regime: draft.metadata.regime ?? null,
    },
  };
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}
