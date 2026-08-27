import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type {
  Model190Outcome,
  Model190PresentedSnapshot,
  Model190Result,
} from "@/lib/modelo-190/types";

export function build190PresentedSnapshot(
  draft: Model190Result
): Model190PresentedSnapshot {
  return {
    version: 1,
    year: draft.year,
    summary: { ...draft.summary },
    records: draft.records.map((r) => ({
      recordKey: r.recordKey,
      counterpartyId: r.counterpartyId,
      taxId: r.taxId,
      name: r.name,
      key: r.key,
      subKey: r.subKey,
      cashPerceptionAmount: r.cashPerceptionAmount,
      withholdingAmount: r.withholdingAmount,
    })),
    reconciliation: {
      status: draft.reconciliation.status,
      sum111Perceptions: draft.reconciliation.sum111Perceptions,
      sum111Withholdings: draft.reconciliation.sum111Withholdings,
      annual190Perceptions: draft.reconciliation.annual190Perceptions,
      annual190Withholdings: draft.reconciliation.annual190Withholdings,
    },
    warnings: draft.warnings.map((w) => ({
      code: w.code,
      message: w.message,
    })),
    outcome: draft.outcome,
    presentedAt: new Date().toISOString(),
  };
}

export function parse190PresentedSnapshot(
  raw: unknown
): Model190PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model190Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model190PresentedSnapshot;
  if (s.version !== 1 || !s.summary) return null;
  return s;
}

export function outcome190Label(outcome: Model190Outcome): string {
  switch (outcome) {
    case "READY":
      return "LISTO";
    case "NO_RELEVANT_PAYMENTS":
      return "SIN PERCEPCIONES RELEVANTES";
    case "REQUIRES_REVIEW":
      return "REQUIERE REVISIÓN";
    default:
      return outcome;
  }
}

export function compare190PresentedVsDraft(
  draft: Model190Result,
  presented: PresentedFilingView | null
): {
  summaryDiffs: {
    field: string;
    draft: number;
    presented: number | null;
    status: "match" | "amount_diff" | "new";
  }[];
  recordDiffs: {
    recordKey: string;
    kind: "new" | "missing" | "amount_diff" | "key_diff" | "match";
    detail?: string;
  }[];
  legacyDetailWarning: boolean;
  presentedHasDetail: boolean;
} {
  const snap = presented
    ? parse190PresentedSnapshot(presented.rawExtract)
    : null;
  const presentedHasDetail = Boolean(snap);
  const legacyDetailWarning = Boolean(
    presented && !snap
      ? true
      : false
  );

  if (presented && !snap) {
    return {
      summaryDiffs: [],
      recordDiffs: [
        {
          recordKey: "*",
          kind: "missing",
          detail: "LEGACY_190_FILING_DETAIL",
        },
      ],
      legacyDetailWarning: true,
      presentedHasDetail: false,
    };
  }

  const summaryFields: {
    field: string;
    draft: number;
    presented: number | null;
  }[] = [
    {
      field: "totalPerceptionRecords",
      draft: draft.summary.totalPerceptionRecords,
      presented: snap?.summary.totalPerceptionRecords ?? null,
    },
    {
      field: "totalCashPerceptionAmount",
      draft: draft.summary.totalCashPerceptionAmount,
      presented: snap?.summary.totalCashPerceptionAmount ?? null,
    },
    {
      field: "totalWithholdingAmount",
      draft: draft.summary.totalWithholdingAmount,
      presented: snap?.summary.totalWithholdingAmount ?? null,
    },
  ];

  const summaryDiffs = summaryFields.map((f) => {
    let status: "match" | "amount_diff" | "new" = "new";
    if (f.presented == null) status = "new";
    else if (moneyEqual(f.draft, f.presented)) status = "match";
    else status = "amount_diff";
    return { ...f, status };
  });

  const presentedMap = new Map(
    (snap?.records ?? []).map((r) => [r.recordKey, r])
  );
  const draftKeys = new Set(draft.records.map((r) => r.recordKey));
  const recordDiffs: {
    recordKey: string;
    kind: "new" | "missing" | "amount_diff" | "key_diff" | "match";
    detail?: string;
  }[] = [];

  for (const r of draft.records) {
    const p = presentedMap.get(r.recordKey);
    if (!p) {
      recordDiffs.push({ recordKey: r.recordKey, kind: "new" });
      continue;
    }
    if (
      p.key !== r.key ||
      p.subKey !== r.subKey
    ) {
      recordDiffs.push({
        recordKey: r.recordKey,
        kind: "key_diff",
        detail: `${p.key}/${p.subKey} → ${r.key}/${r.subKey}`,
      });
    } else if (
      !moneyEqual(p.cashPerceptionAmount, r.cashPerceptionAmount) ||
      !moneyEqual(p.withholdingAmount, r.withholdingAmount)
    ) {
      recordDiffs.push({ recordKey: r.recordKey, kind: "amount_diff" });
    } else {
      recordDiffs.push({ recordKey: r.recordKey, kind: "match" });
    }
  }
  for (const key of presentedMap.keys()) {
    if (!draftKeys.has(key)) {
      recordDiffs.push({ recordKey: key, kind: "missing" });
    }
  }

  return {
    summaryDiffs,
    recordDiffs,
    legacyDetailWarning,
    presentedHasDetail,
  };
}

export function draft190ResultAmount(draft: Model190Result): number {
  return round2(draft.summary.totalWithholdingAmount);
}
