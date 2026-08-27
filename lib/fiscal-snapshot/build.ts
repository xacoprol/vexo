import {
  FISCAL_ENGINE_VERSION,
  FISCAL_SNAPSHOT_V1,
  type FiscalModelSnapshotV1,
  type FiscalSnapshotSourceIds,
} from "@/lib/fiscal-snapshot/types";
import { computeSourceHash, normalizeSourceIds } from "@/lib/fiscal-snapshot/hash";

export type BuildFiscalModelSnapshotV1Input = {
  model: string;
  year: number;
  quarter?: number | null;
  period?: string;
  result: number | null;
  boxes?: Record<string, number | string | null>;
  bases?: Record<string, number | string | null>;
  sourceIds?: FiscalSnapshotSourceIds;
  warnings?: string[];
  census?: Record<string, unknown>;
  /** Si se omite, usa computedAt. */
  bookCutoffAt?: string | Date;
  computedAt?: string | Date;
  engineVersion?: string;
  detail?: import("@/lib/fiscal-snapshot/types").FiscalModelSnapshotDetail;
};

function toIso(d: string | Date | undefined): string {
  if (d == null) return new Date().toISOString();
  if (typeof d === "string") return d;
  return d.toISOString();
}

export function buildFiscalModelSnapshotV1(
  input: BuildFiscalModelSnapshotV1Input
): FiscalModelSnapshotV1 {
  const sourceIds = normalizeSourceIds(input.sourceIds ?? {});
  const computedAt = toIso(input.computedAt);
  const bookCutoffAt = toIso(input.bookCutoffAt ?? computedAt);
  return {
    version: FISCAL_SNAPSHOT_V1,
    model: String(input.model),
    year: input.year,
    quarter: input.quarter ?? null,
    period: input.period,
    computedAt,
    engineVersion: input.engineVersion ?? FISCAL_ENGINE_VERSION,
    result: input.result,
    boxes: input.boxes ?? {},
    bases: input.bases ?? {},
    sourceIds,
    sourceHash: computeSourceHash(sourceIds),
    warnings: [...(input.warnings ?? [])].map(String).sort(),
    census: input.census ?? {},
    bookCutoffAt,
    ...(input.detail ? { detail: input.detail } : {}),
  };
}

/** Serializa boxes FilingBox[] → Record. */
export function boxesArrayToRecord(
  boxes: { code: string; value: number }[] | undefined
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const b of boxes ?? []) {
    out[String(b.code)] = Number.isFinite(Number(b.value))
      ? Number(b.value)
      : null;
  }
  return out;
}
