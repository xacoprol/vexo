/**
 * Congela casillas + detalle en FiscalModelSnapshotV1 (Fase 15).
 * Solo se invoca en freeze (confirm review) — no en declaration builder.
 */

import type { FiscalQuarter } from "@/lib/fiscal";
import { buildFiscalPeriodSummary } from "@/lib/fiscal";
import { buildModelo111Draft } from "@/lib/modelo-111";
import { buildModelo115Draft } from "@/lib/modelo-115";
import { buildModelo349Draft } from "@/lib/fiscal-347-349";
import { build349PresentedSnapshot } from "@/lib/modelo-349";
import { build111PresentedSnapshot } from "@/lib/modelo-111";
import { build115PresentedSnapshot } from "@/lib/modelo-115";
import { buildFiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot/build";
import { boxesArrayToRecord } from "@/lib/fiscal-snapshot/build";
import type {
  FiscalModelSnapshotDetail,
  FiscalModelSnapshotV1,
  FiscalSnapshotSourceIds,
} from "@/lib/fiscal-snapshot/types";
import { round2 } from "@/lib/modelo-390/money";

function recordFromNumericObject(
  obj: Record<string, unknown> | null | undefined
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = round2(v);
    else if (v == null) out[k] = null;
  }
  return out;
}

/**
 * Calcula snapshots ricos por modelo en el momento del freeze.
 * El builder de declaración NO debe repetir estas lecturas del libro.
 */
export async function buildEnrichedModelSnapshotsForFreeze(opts: {
  year: number;
  quarter: FiscalQuarter;
  sourceIds: FiscalSnapshotSourceIds;
  census: Record<string, unknown>;
}): Promise<FiscalModelSnapshotV1[]> {
  const { year, quarter, sourceIds, census } = opts;
  const [summary, draft111, draft115, draft349] = await Promise.all([
    buildFiscalPeriodSummary(year, quarter),
    buildModelo111Draft(year, quarter),
    buildModelo115Draft(year, quarter),
    buildModelo349Draft(year, quarter),
  ]);

  const out: FiscalModelSnapshotV1[] = [];

  // 130
  {
    const m = summary.modelo130;
    out.push(
      buildFiscalModelSnapshotV1({
        model: "130",
        year,
        quarter,
        result: m.result,
        boxes: boxesArrayToRecord(m.boxes),
        bases: {},
        sourceIds,
        warnings: (m.warnings ?? []).map(String),
        census,
      })
    );
  }

  // 303
  {
    const m = summary.modelo303;
    out.push(
      buildFiscalModelSnapshotV1({
        model: "303",
        year,
        quarter,
        result: m.result,
        boxes: boxesArrayToRecord(m.boxes),
        bases: {},
        sourceIds,
        warnings: (m.warnings ?? []).map(String),
        census,
        detail: {
          outcome: m.outcome303 ?? undefined,
        },
      })
    );
  }

  // 111
  {
    const presented = build111PresentedSnapshot(draft111);
    out.push(
      buildFiscalModelSnapshotV1({
        model: "111",
        year,
        quarter,
        result: draft111.boxes.box30,
        boxes: recordFromNumericObject(
          presented.boxes as unknown as Record<string, unknown>
        ),
        sourceIds,
        warnings: draft111.warnings.map((w) => w.code),
        census,
        detail: {
          payees: presented.payees,
          outcome: presented.outcome,
        } satisfies FiscalModelSnapshotDetail,
      })
    );
  }

  // 115
  {
    const presented = build115PresentedSnapshot(draft115);
    out.push(
      buildFiscalModelSnapshotV1({
        model: "115",
        year,
        quarter,
        result: draft115.boxes.box05,
        boxes: recordFromNumericObject(
          presented.boxes as unknown as Record<string, unknown>
        ),
        sourceIds,
        warnings: draft115.warnings.map((w) => w.code),
        census,
        detail: {
          landlords: presented.landlords,
          outcome: presented.outcome,
        },
      })
    );
  }

  // 349
  {
    const presented = build349PresentedSnapshot(draft349);
    const totals = draft349.totalsByKey ?? {};
    const result = round2(
      Object.values(totals).reduce((s, v) => s + (Number(v) || 0), 0)
    );
    const boxes: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(totals)) {
      boxes[k] = round2(Number(v) || 0);
    }
    out.push(
      buildFiscalModelSnapshotV1({
        model: "349",
        year,
        quarter,
        result,
        boxes,
        sourceIds,
        warnings: draft349.warnings.map((w) => w.code),
        census,
        detail: {
          periodicity: presented.periodicity,
          operations: presented.operations,
          totalsByKey: Object.fromEntries(
            Object.entries(totals).map(([k, v]) => [k, round2(Number(v) || 0)])
          ),
        },
      })
    );
  }

  return out;
}

/** Completeness check for a frozen model snapshot. */
export function assessSnapshotCompleteness(
  snap: FiscalModelSnapshotV1 | null | undefined
): {
  complete: boolean;
  missing: string[];
} {
  if (!snap) return { complete: false, missing: ["snapshot"] };
  const missing: string[] = [];
  const boxKeys = Object.keys(snap.boxes ?? {});
  if (boxKeys.length === 0) missing.push("boxes");

  switch (snap.model) {
    case "130":
      if (snap.boxes["19"] == null && snap.boxes["box19"] == null) {
        // may use code "19" from ModeloBoxes
        if (!boxKeys.some((k) => k === "19" || k.endsWith("19"))) {
          missing.push("box19/result box");
        }
      }
      break;
    case "303":
      if (!boxKeys.some((k) => k === "71" || k === "box71")) {
        missing.push("box71");
      }
      break;
    case "349":
      if (!snap.detail?.operations) missing.push("detail.operations");
      break;
    case "111":
      if (!snap.detail?.payees) missing.push("detail.payees");
      break;
    case "115":
      if (!snap.detail?.landlords) missing.push("detail.landlords");
      break;
    default:
      break;
  }

  return { complete: missing.length === 0, missing };
}
