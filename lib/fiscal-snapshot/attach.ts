import {
  modelSnapshotRawKey,
  type FiscalModelSnapshotV1,
} from "@/lib/fiscal-snapshot/types";

/**
 * Fusiona snapshot v1 en rawExtract sin borrar campos OCR/legacy.
 * Escribe fiscalSnapshotV1 y, si el model*Snapshot no existe o es pobre, lo rellena.
 */
export function attachFiscalSnapshotV1(
  rawExtract: Record<string, unknown> | null | undefined,
  snapshot: FiscalModelSnapshotV1
): Record<string, unknown> {
  const base =
    rawExtract != null && typeof rawExtract === "object"
      ? { ...rawExtract }
      : {};

  base.fiscalSnapshotV1 = snapshot;

  const key = modelSnapshotRawKey(snapshot.model);
  const existing = base[key];
  if (
    existing == null ||
    (typeof existing === "object" &&
      existing != null &&
      !("sourceHash" in (existing as object)))
  ) {
    // Conserva snapshot rico previo (p.ej. model349Snapshot con operations)
    // y añade fiscalSnapshotV1; solo crea model* si vacío.
    if (existing == null) {
      base[key] = snapshot;
    } else {
      base[key] = {
        ...(existing as object),
        fiscalAudit: snapshot,
      };
    }
  }

  return base;
}
