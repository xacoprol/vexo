import {
  FISCAL_SNAPSHOT_V1,
  modelSnapshotRawKey,
  type FiscalModelSnapshotV1,
} from "@/lib/fiscal-snapshot/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Lee FiscalModelSnapshotV1 desde rawExtract.
 * Acepta fiscalSnapshotV1 o model{N}Snapshot.version===1 con sourceHash.
 */
export function parseFiscalModelSnapshotV1(
  rawExtract: unknown,
  model?: string
): FiscalModelSnapshotV1 | null {
  if (!isRecord(rawExtract)) return null;

  const candidates: unknown[] = [];
  if (rawExtract.fiscalSnapshotV1) candidates.push(rawExtract.fiscalSnapshotV1);
  if (model) {
    const k = modelSnapshotRawKey(model);
    if (rawExtract[k]) candidates.push(rawExtract[k]);
  }

  for (const c of candidates) {
    const snap = coerceSnapshot(c);
    if (snap) return snap;
  }
  return null;
}

function coerceSnapshot(raw: unknown): FiscalModelSnapshotV1 | null {
  if (!isRecord(raw)) return null;
  if (Number(raw.version) !== FISCAL_SNAPSHOT_V1) return null;
  if (typeof raw.sourceHash !== "string" || !raw.sourceHash) return null;
  if (typeof raw.bookCutoffAt !== "string") return null;
  if (typeof raw.model !== "string") return null;
  if (!Number.isFinite(Number(raw.year))) return null;

  const sourceIds = isRecord(raw.sourceIds) ? raw.sourceIds : {};
  return {
    version: FISCAL_SNAPSHOT_V1,
    model: String(raw.model),
    year: Number(raw.year),
    quarter:
      raw.quarter == null || raw.quarter === ""
        ? null
        : Number(raw.quarter),
    period: typeof raw.period === "string" ? raw.period : undefined,
    computedAt: String(raw.computedAt ?? raw.bookCutoffAt),
    engineVersion: String(raw.engineVersion ?? "unknown"),
    result:
      raw.result == null || raw.result === ""
        ? null
        : Number(raw.result),
    boxes: isRecord(raw.boxes)
      ? (raw.boxes as FiscalModelSnapshotV1["boxes"])
      : {},
    bases: isRecord(raw.bases)
      ? (raw.bases as FiscalModelSnapshotV1["bases"])
      : {},
    sourceIds: {
      expenses: Array.isArray(sourceIds.expenses)
        ? sourceIds.expenses.map(String)
        : undefined,
      invoices: Array.isArray(sourceIds.invoices)
        ? sourceIds.invoices.map(String)
        : undefined,
      withholdings: Array.isArray(sourceIds.withholdings)
        ? sourceIds.withholdings.map(String)
        : undefined,
      leases: Array.isArray(sourceIds.leases)
        ? sourceIds.leases.map(String)
        : undefined,
      marketplace: Array.isArray(sourceIds.marketplace)
        ? sourceIds.marketplace.map(String)
        : undefined,
    },
    sourceHash: String(raw.sourceHash),
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.map(String)
      : [],
    census: isRecord(raw.census) ? raw.census : {},
    bookCutoffAt: String(raw.bookCutoffAt),
  };
}

export function hasFiscalSnapshotV1(
  rawExtract: unknown,
  model?: string
): boolean {
  return parseFiscalModelSnapshotV1(rawExtract, model) != null;
}
