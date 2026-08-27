import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type {
  Model190ConsistencyIssue,
  Model190PayeeRecord,
  Model190Reconciliation,
  Model190WithholdingRow,
} from "@/lib/modelo-190/types";

export type Quarter111SnapshotInput = {
  quarter: 1 | 2 | 3 | 4;
  /** box08 / percepciones */
  perceptionAmount: number;
  /** box09 / retenciones */
  withholdingAmount: number;
  presented: boolean;
  /** withholdingIds incluidos en ese 111 (motor o snapshot) */
  withholdingIds: string[];
  byCounterparty: {
    counterpartyId: string;
    name: string;
    baseAmount: number;
    withholdingAmount: number;
  }[];
};

/**
 * Conciliación 111 Q1–Q4 ↔ 190 anual.
 * Totales + perceptor + sourceId. Filing presentado = verdad histórica del trimestre.
 */
export function reconcile111To190(opts: {
  year: number;
  quarters: Quarter111SnapshotInput[];
  annualRecords: Model190PayeeRecord[];
  annualSummary: {
    totalCashPerceptionAmount: number;
    totalWithholdingAmount: number;
  };
  annualIncludedIds: string[];
  requiresReview: boolean;
}): Model190Reconciliation {
  const notes: string[] = [];
  const presented111Quarters: number[] = [];
  const provisionalQuarters: number[] = [];

  let sum111Perceptions = 0;
  let sum111Withholdings = 0;
  const q111ByCp = new Map<
    string,
    { name: string; base: number; wh: number }
  >();
  const q111IdCount = new Map<string, number>();

  for (const q of opts.quarters) {
    if (q.presented) presented111Quarters.push(q.quarter);
    else provisionalQuarters.push(q.quarter);

    sum111Perceptions = round2(sum111Perceptions + q.perceptionAmount);
    sum111Withholdings = round2(sum111Withholdings + q.withholdingAmount);

    for (const p of q.byCounterparty) {
      const cur = q111ByCp.get(p.counterpartyId) ?? {
        name: p.name,
        base: 0,
        wh: 0,
      };
      cur.base = round2(cur.base + p.baseAmount);
      cur.wh = round2(cur.wh + p.withholdingAmount);
      q111ByCp.set(p.counterpartyId, cur);
    }
    for (const id of q.withholdingIds) {
      q111IdCount.set(id, (q111IdCount.get(id) ?? 0) + 1);
    }
  }

  const annual190Perceptions = opts.annualSummary.totalCashPerceptionAmount;
  const annual190Withholdings = opts.annualSummary.totalWithholdingAmount;
  const perceptionDelta = round2(annual190Perceptions - sum111Perceptions);
  const withholdingDelta = round2(annual190Withholdings - sum111Withholdings);

  const annualByCp = new Map<string, { name: string; base: number }>();
  for (const r of opts.annualRecords) {
    const cur = annualByCp.get(r.counterpartyId) ?? {
      name: r.name,
      base: 0,
    };
    cur.base = round2(cur.base + r.cashPerceptionAmount);
    annualByCp.set(r.counterpartyId, cur);
  }

  const payeeDiffs: Model190Reconciliation["payeeDiffs"] = [];
  const allCp = new Set([...q111ByCp.keys(), ...annualByCp.keys()]);
  for (const id of allCp) {
    const q = q111ByCp.get(id);
    const a = annualByCp.get(id);
    const qBase = q?.base ?? 0;
    const aBase = a?.base ?? 0;
    if (!moneyEqual(qBase, aBase)) {
      payeeDiffs.push({
        counterpartyId: id,
        name: a?.name ?? q?.name ?? id,
        q111Base: qBase,
        annual190Base: aBase,
        delta: round2(aBase - qBase),
      });
    }
  }

  const consistency: Model190ConsistencyIssue[] = [];
  const annualSet = new Set(opts.annualIncludedIds);

  for (const [id, count] of q111IdCount) {
    if (count > 1) {
      consistency.push({
        code: "WITHHOLDING_DOUBLE_COUNTED",
        withholdingId: id,
        message: `Withholding ${id} aparece en ${count} trimestres 111.`,
      });
    }
    if (!annualSet.has(id)) {
      consistency.push({
        code: "WITHHOLDING_MISSING_190",
        withholdingId: id,
        message: `Withholding ${id} está en 111 pero no en 190.`,
      });
    }
  }
  for (const id of annualSet) {
    if (!q111IdCount.has(id)) {
      consistency.push({
        code: "WITHHOLDING_MISSING_111",
        withholdingId: id,
        message: `Withholding ${id} está en 190 pero no en ningún 111 del año.`,
      });
    }
  }

  if (provisionalQuarters.length > 0) {
    notes.push(
      `Trimestres 111 sin presentar: ${provisionalQuarters.join(", ")} → conciliación PROVISIONAL.`
    );
  }
  if (presented111Quarters.length > 0) {
    notes.push(
      `Trimestres 111 presentados (histórico): ${presented111Quarters.join(", ")}.`
    );
  }

  let status: Model190Reconciliation["status"];
  if (opts.requiresReview || consistency.length > 0) {
    status = "REQUIRES_REVIEW";
  } else if (provisionalQuarters.length > 0) {
    status = "PROVISIONAL";
  } else if (
    !moneyEqual(perceptionDelta, 0) ||
    !moneyEqual(withholdingDelta, 0) ||
    payeeDiffs.length > 0
  ) {
    status = "DIFFERENCES";
  } else {
    status = "MATCH";
  }

  return {
    status,
    sum111Perceptions,
    sum111Withholdings,
    annual190Perceptions,
    annual190Withholdings,
    perceptionDelta,
    withholdingDelta,
    presented111Quarters,
    provisionalQuarters,
    payeeDiffs,
    consistency,
    notes,
  };
}

/** Helper tests: mapear filas anuales a ids. */
export function withholdingIdsFromRows(
  rows: Model190WithholdingRow[]
): string[] {
  return rows.map((w) => w.id);
}
