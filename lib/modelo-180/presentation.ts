import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type {
  Model180Outcome,
  Model180PresentedSnapshot,
  Model180Result,
} from "@/lib/modelo-180/types";

export function build180PresentedSnapshot(
  draft: Model180Result
): Model180PresentedSnapshot {
  return {
    version: 1,
    year: draft.year,
    summary: { ...draft.summary },
    records: draft.records.map((r) => ({
      recordKey: r.recordKey,
      counterpartyId: r.counterpartyId,
      taxId: r.taxId,
      name: r.name,
      leaseId: r.leaseId,
      propertyAddress: r.propertyAddress,
      cadastralReference: r.cadastralReference,
      annualBaseAmount: r.annualBaseAmount,
      annualWithholdingAmount: r.annualWithholdingAmount,
    })),
    reconciliation: {
      status: draft.reconciliation.status,
      sum115Bases: draft.reconciliation.sum115Bases,
      sum115Withholdings: draft.reconciliation.sum115Withholdings,
      annual180Bases: draft.reconciliation.annual180Bases,
      annual180Withholdings: draft.reconciliation.annual180Withholdings,
    },
    warnings: draft.warnings.map((w) => ({
      code: w.code,
      message: w.message,
    })),
    outcome: draft.outcome,
    presentedAt: new Date().toISOString(),
  };
}

export function parse180PresentedSnapshot(
  raw: unknown
): Model180PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model180Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model180PresentedSnapshot;
  if (s.version !== 1 || !s.summary) return null;
  return s;
}

export function outcome180Label(outcome: Model180Outcome): string {
  switch (outcome) {
    case "READY":
      return "LISTO";
    case "NO_RELEVANT_PAYMENTS":
      return "SIN RENTAS RELEVANTES";
    case "REQUIRES_REVIEW":
      return "REQUIERE REVISIÓN";
    default:
      return outcome;
  }
}

export function compare180PresentedVsDraft(
  draft: Model180Result,
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
    kind: "new" | "missing" | "amount_diff" | "property_diff" | "match";
    detail?: string;
  }[];
  legacyDetailWarning: boolean;
  presentedHasDetail: boolean;
} {
  const snap = presented
    ? parse180PresentedSnapshot(presented.rawExtract)
    : null;
  const presentedHasDetail = Boolean(snap);
  const legacyDetailWarning = Boolean(presented && !snap);

  if (presented && !snap) {
    return {
      summaryDiffs: [],
      recordDiffs: [
        {
          recordKey: "*",
          kind: "missing",
          detail: "LEGACY_180_FILING_DETAIL",
        },
      ],
      legacyDetailWarning: true,
      presentedHasDetail: false,
    };
  }

  const summaryDiffs = [
    {
      field: "totalPayeeRecords",
      draft: draft.summary.totalPayeeRecords,
      presented: snap?.summary.totalPayeeRecords ?? null,
    },
    {
      field: "totalBaseAmount",
      draft: draft.summary.totalBaseAmount,
      presented: snap?.summary.totalBaseAmount ?? null,
    },
    {
      field: "totalWithholdingAmount",
      draft: draft.summary.totalWithholdingAmount,
      presented: snap?.summary.totalWithholdingAmount ?? null,
    },
  ].map((f) => {
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
    kind: "new" | "missing" | "amount_diff" | "property_diff" | "match";
    detail?: string;
  }[] = [];

  for (const r of draft.records) {
    const p = presentedMap.get(r.recordKey);
    if (!p) {
      recordDiffs.push({ recordKey: r.recordKey, kind: "new" });
      continue;
    }
    if (
      (p.cadastralReference ?? "") !== (r.cadastralReference ?? "") ||
      p.propertyAddress !== r.propertyAddress
    ) {
      recordDiffs.push({
        recordKey: r.recordKey,
        kind: "property_diff",
      });
    } else if (
      !moneyEqual(p.annualBaseAmount, r.annualBaseAmount) ||
      !moneyEqual(p.annualWithholdingAmount, r.annualWithholdingAmount)
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

export function draft180ResultAmount(draft: Model180Result): number {
  return round2(draft.summary.totalWithholdingAmount);
}
