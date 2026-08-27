import { createHash } from "node:crypto";
import type { FiscalSnapshotSourceIds } from "@/lib/fiscal-snapshot/types";

/** Ordena IDs y claves de forma determinista. */
export function normalizeSourceIds(
  sourceIds: FiscalSnapshotSourceIds
): FiscalSnapshotSourceIds {
  const out: FiscalSnapshotSourceIds = {};
  const keys = Object.keys(sourceIds).sort() as (keyof FiscalSnapshotSourceIds)[];
  for (const k of keys) {
    const arr = sourceIds[k];
    if (!arr?.length) continue;
    out[k] = [...new Set(arr.map(String))].sort();
  }
  return out;
}

/**
 * Hash estable del universo de fuentes.
 * Mismo conjunto (cualquier orden) → mismo hash; añadir/quitar ID → cambia.
 */
export function computeSourceHash(sourceIds: FiscalSnapshotSourceIds): string {
  const normalized = normalizeSourceIds(sourceIds);
  const payload = JSON.stringify(normalized);
  return createHash("sha256").update(payload).digest("hex");
}
