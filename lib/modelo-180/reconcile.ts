import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type {
  Model180ConsistencyIssue,
  Model180LandlordRecord,
  Model180Reconciliation,
} from "@/lib/modelo-180/types";

export type Quarter115SnapshotInput = {
  quarter: 1 | 2 | 3 | 4;
  baseAmount: number;
  withholdingAmount: number;
  presented: boolean;
  withholdingIds: string[];
  byLease: {
    leaseId: string | null;
    counterpartyId: string;
    baseAmount: number;
    withholdingAmount: number;
  }[];
};

export function reconcile115To180(opts: {
  year: number;
  quarters: Quarter115SnapshotInput[];
  annualRecords: Model180LandlordRecord[];
  annualSummary: {
    totalBaseAmount: number;
    totalWithholdingAmount: number;
  };
  annualIncludedIds: string[];
  requiresReview: boolean;
}): Model180Reconciliation {
  const notes: string[] = [];
  const presented115Quarters: number[] = [];
  const provisionalQuarters: number[] = [];
  let sum115Bases = 0;
  let sum115Withholdings = 0;
  const qByLease = new Map<
    string,
    { counterpartyId: string; base: number }
  >();
  const qIdCount = new Map<string, number>();

  for (const q of opts.quarters) {
    if (q.presented) presented115Quarters.push(q.quarter);
    else provisionalQuarters.push(q.quarter);
    sum115Bases = round2(sum115Bases + q.baseAmount);
    sum115Withholdings = round2(sum115Withholdings + q.withholdingAmount);
    for (const row of q.byLease) {
      const key = `${row.counterpartyId}|${row.leaseId ?? "NO_LEASE"}`;
      const cur = qByLease.get(key) ?? {
        counterpartyId: row.counterpartyId,
        base: 0,
      };
      cur.base = round2(cur.base + row.baseAmount);
      qByLease.set(key, cur);
    }
    for (const id of q.withholdingIds) {
      qIdCount.set(id, (qIdCount.get(id) ?? 0) + 1);
    }
  }

  const annual180Bases = opts.annualSummary.totalBaseAmount;
  const annual180Withholdings = opts.annualSummary.totalWithholdingAmount;
  const baseDelta = round2(annual180Bases - sum115Bases);
  const withholdingDelta = round2(
    annual180Withholdings - sum115Withholdings
  );

  const leaseDiffs: Model180Reconciliation["leaseDiffs"] = [];
  const annualMap = new Map(
    opts.annualRecords.map((r) => [r.recordKey, r] as const)
  );
  const allKeys = new Set([...qByLease.keys(), ...annualMap.keys()]);
  for (const key of allKeys) {
    const q = qByLease.get(key);
    const a = annualMap.get(key);
    const qBase = q?.base ?? 0;
    const aBase = a?.annualBaseAmount ?? 0;
    if (!moneyEqual(qBase, aBase)) {
      leaseDiffs.push({
        leaseId: a?.leaseId ?? null,
        counterpartyId:
          a?.counterpartyId ?? q?.counterpartyId ?? key.split("|")[0]!,
        q115Base: qBase,
        annual180Base: aBase,
        delta: round2(aBase - qBase),
      });
    }
  }

  const consistency: Model180ConsistencyIssue[] = [];
  const annualSet = new Set(opts.annualIncludedIds);
  for (const [id, count] of qIdCount) {
    if (count > 1) {
      consistency.push({
        code: "WITHHOLDING_DOUBLE_COUNTED",
        withholdingId: id,
        message: `Withholding ${id} en ${count} trimestres 115.`,
      });
    }
    if (!annualSet.has(id)) {
      consistency.push({
        code: "WITHHOLDING_MISSING_180",
        withholdingId: id,
        message: `Withholding ${id} en 115 pero no en 180.`,
      });
    }
  }
  for (const id of annualSet) {
    if (!qIdCount.has(id)) {
      consistency.push({
        code: "WITHHOLDING_MISSING_115",
        withholdingId: id,
        message: `Withholding ${id} en 180 pero no en ningún 115 del año.`,
      });
    }
  }

  if (provisionalQuarters.length) {
    notes.push(
      `Trimestres 115 sin presentar: ${provisionalQuarters.join(", ")} → PROVISIONAL.`
    );
  }

  let status: Model180Reconciliation["status"];
  if (opts.requiresReview || consistency.length > 0) {
    status = "REQUIRES_REVIEW";
  } else if (provisionalQuarters.length > 0) {
    status = "PROVISIONAL";
  } else if (
    !moneyEqual(baseDelta, 0) ||
    !moneyEqual(withholdingDelta, 0) ||
    leaseDiffs.length > 0
  ) {
    status = "DIFFERENCES";
  } else {
    status = "MATCH";
  }

  return {
    status,
    sum115Bases,
    sum115Withholdings,
    annual180Bases,
    annual180Withholdings,
    baseDelta,
    withholdingDelta,
    presented115Quarters,
    provisionalQuarters,
    leaseDiffs,
    consistency,
    notes,
  };
}
