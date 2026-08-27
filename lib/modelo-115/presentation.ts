import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type {
  Model115Boxes,
  Model115Outcome,
  Model115PresentedSnapshot,
  Model115Result,
} from "@/lib/modelo-115/types";

export function build115PresentedSnapshot(
  draft: Model115Result
): Model115PresentedSnapshot {
  return {
    version: 1,
    year: draft.year,
    quarter: draft.quarter,
    boxes: { ...draft.boxes },
    landlords: draft.landlords.map((l) => ({
      counterpartyId: l.counterpartyId,
      taxId: l.taxId,
      name: l.name,
      baseAmount: l.baseAmount,
      withholdingAmount: l.withholdingAmount,
    })),
    outcome: draft.outcome,
    presentedAt: new Date().toISOString(),
  };
}

export function parse115PresentedSnapshot(
  raw: unknown
): Model115PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model115Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model115PresentedSnapshot;
  if (s.version !== 1 || !s.boxes) return null;
  return s;
}

export function draft115BoxesList(
  draft: Model115Result
): { code: string; value: number }[] {
  return draft.boxList.map((b) => ({
    code: b.code,
    value: round2(b.value),
  }));
}

export function draft115ResultAmount(draft: Model115Result): number {
  return round2(draft.boxes.box05);
}

export function outcome115Label(outcome: Model115Outcome): string {
  switch (outcome) {
    case "TO_PAY":
      return "A INGRESAR";
    case "NEGATIVE":
      return "NEGATIVA";
    case "NO_RELEVANT_PAYMENTS":
      return "SIN RENTAS RELEVANTES";
    case "REQUIRES_REVIEW":
      return "REQUIERE REVISIÓN";
    default:
      return outcome;
  }
}

export function compare115PresentedVsDraft(
  draft: Model115Result,
  presented: PresentedFilingView | null
): {
  rows: {
    code: string;
    draft: number;
    presented: number | null;
    status: "match" | "amount_diff" | "new" | "missing";
  }[];
  legacyDetailWarning: boolean;
  presentedHasDetail: boolean;
} {
  const snap = presented
    ? parse115PresentedSnapshot(presented.rawExtract)
    : null;
  const presentedHasDetail = Boolean(snap);
  const legacyDetailWarning = Boolean(presented && !snap);

  const presentedMap = new Map<string, number>();
  if (snap) {
    for (const [k, v] of Object.entries(snap.boxes as Model115Boxes)) {
      const code = k.replace(/^box/, "").padStart(2, "0");
      presentedMap.set(code, Number(v) || 0);
    }
  } else if (presented?.boxes) {
    for (const b of presented.boxes) {
      presentedMap.set(String(b.code).padStart(2, "0"), Number(b.value) || 0);
    }
  }

  const rows = draft.boxList.map((b) => {
    const code = b.code.padStart(2, "0");
    const p = presentedMap.has(code) ? presentedMap.get(code)! : null;
    let status: "match" | "amount_diff" | "new" | "missing" = "new";
    if (p != null && moneyEqual(b.value, p)) status = "match";
    else if (p != null) status = "amount_diff";
    return { code, draft: b.value, presented: p, status };
  });

  return { rows, legacyDetailWarning, presentedHasDetail };
}
