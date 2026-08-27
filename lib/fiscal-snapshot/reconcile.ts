import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import { computeSourceHash } from "@/lib/fiscal-snapshot/hash";
import type {
  BookDriftChange,
  BookDriftReport,
  FiscalModelSnapshotV1,
  FiscalSnapshotSourceIds,
} from "@/lib/fiscal-snapshot/types";

function listIds(
  ids: FiscalSnapshotSourceIds,
  type: keyof FiscalSnapshotSourceIds
): string[] {
  return (ids[type] ?? []).map(String);
}

function diffIds(
  filed: FiscalSnapshotSourceIds,
  current: FiscalSnapshotSourceIds
): { added: BookDriftChange[]; removed: BookDriftChange[] } {
  const types: (keyof FiscalSnapshotSourceIds)[] = [
    "expenses",
    "invoices",
    "withholdings",
    "leases",
    "marketplace",
  ];
  const added: BookDriftChange[] = [];
  const removed: BookDriftChange[] = [];
  for (const t of types) {
    const a = new Set(listIds(filed, t));
    const b = new Set(listIds(current, t));
    for (const id of b) {
      if (!a.has(id)) added.push({ sourceType: t, sourceId: id });
    }
    for (const id of a) {
      if (!b.has(id)) removed.push({ sourceType: t, sourceId: id });
    }
  }
  return { added, removed };
}

/**
 * Compara snapshot presentado vs snapshot/libro actual.
 * No decide complementaria/rectificativa AEAT.
 */
export function reconcileFiledSnapshotToCurrent(opts: {
  filed: FiscalModelSnapshotV1 | null;
  current: FiscalModelSnapshotV1 | null;
  /** Si no hay snapshot filed pero sí evidencia de altas posteriores. */
  postFilingDataDetected?: boolean;
  legacyLimited?: boolean;
}): BookDriftReport {
  const notes: string[] = [];

  if (!opts.filed && opts.legacyLimited) {
    if (opts.postFilingDataDetected) {
      notes.push("POST_FILING_DATA_DETECTED");
      notes.push(
        "Filing legacy sin snapshot: hay operaciones del periodo incorporadas después de la presentación."
      );
    } else {
      notes.push(
        "Filing legacy sin snapshot estructurado: comparación limitada."
      );
    }
    return {
      reconciliationStatus: "LEGACY_LIMITED",
      filedResult: null,
      currentResult: opts.current?.result ?? null,
      delta:
        opts.current?.result != null
          ? round2(opts.current.result)
          : null,
      filedSourceHash: null,
      currentSourceHash: opts.current?.sourceHash ?? null,
      changes: { added: [], removed: [], modified: [] },
      notes,
    };
  }

  if (!opts.filed) {
    return {
      reconciliationStatus: "NO_FILING",
      filedResult: null,
      currentResult: opts.current?.result ?? null,
      delta: null,
      filedSourceHash: null,
      currentSourceHash: opts.current?.sourceHash ?? null,
      changes: { added: [], removed: [], modified: [] },
      notes,
    };
  }

  if (!opts.current) {
    notes.push("Sin cálculo actual comparable.");
    return {
      reconciliationStatus: "UNEXPLAINED_DIFFERENCE",
      filedResult: opts.filed.result,
      currentResult: null,
      delta: null,
      filedSourceHash: opts.filed.sourceHash,
      currentSourceHash: null,
      changes: { added: [], removed: [], modified: [] },
      notes,
    };
  }

  const { added, removed } = diffIds(
    opts.filed.sourceIds,
    opts.current.sourceIds
  );
  const currentHash = computeSourceHash(opts.current.sourceIds);
  const hashMatch = opts.filed.sourceHash === currentHash;
  const resultDelta =
    opts.filed.result != null && opts.current.result != null
      ? round2(opts.current.result - opts.filed.result)
      : null;
  const resultMatch =
    opts.filed.result != null &&
    opts.current.result != null &&
    moneyEqual(opts.filed.result, opts.current.result);

  if (hashMatch && (resultMatch || resultDelta == null)) {
    return {
      reconciliationStatus: "MATCH",
      filedResult: opts.filed.result,
      currentResult: opts.current.result,
      delta: 0,
      filedSourceHash: opts.filed.sourceHash,
      currentSourceHash: currentHash,
      changes: { added: [], removed: [], modified: [] },
      notes,
    };
  }

  if (added.length > 0 || removed.length > 0 || !hashMatch) {
    notes.push("CURRENT_BOOK_CHANGED_AFTER_FILING");
    if (added.length > 0) {
      notes.push(
        `${added.length} fuente(s) del periodo añadidas después del filing.`
      );
    }
    if (removed.length > 0) {
      notes.push(
        `${removed.length} fuente(s) del filing ya no están en el libro actual.`
      );
    }
    const status =
      added.length > 0
        ? "POTENTIAL_AMENDMENT_REQUIRED"
        : "CURRENT_BOOK_CHANGED_AFTER_FILING";
    return {
      reconciliationStatus: status,
      filedResult: opts.filed.result,
      currentResult: opts.current.result,
      delta: resultDelta,
      filedSourceHash: opts.filed.sourceHash,
      currentSourceHash: currentHash,
      changes: { added, removed, modified: [] },
      notes,
    };
  }

  notes.push("Hash de fuentes igual pero resultado/casillas difieren.");
  return {
    reconciliationStatus: "UNEXPLAINED_DIFFERENCE",
    filedResult: opts.filed.result,
    currentResult: opts.current.result,
    delta: resultDelta,
    filedSourceHash: opts.filed.sourceHash,
    currentSourceHash: currentHash,
    changes: { added: [], removed: [], modified: [] },
    notes,
  };
}
