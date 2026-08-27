import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type {
  Model111Boxes,
  Model111Outcome,
  Model111PresentedSnapshot,
  Model111Result,
} from "@/lib/modelo-111/types";

export function build111PresentedSnapshot(
  draft: Model111Result
): Model111PresentedSnapshot {
  return {
    version: 1,
    year: draft.year,
    quarter: draft.quarter,
    boxes: { ...draft.boxes },
    payees: draft.payees.map((p) => ({
      counterpartyId: p.counterpartyId,
      name: p.name,
      taxId: p.taxId,
      baseAmount: p.baseAmount,
      withholdingAmount: p.withholdingAmount,
    })),
    outcome: draft.outcome,
    presentedAt: new Date().toISOString(),
  };
}

export function parse111PresentedSnapshot(
  raw: unknown
): Model111PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model111Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model111PresentedSnapshot;
  if (s.version !== 1 || !s.boxes) return null;
  return s;
}

export function draft111BoxesList(
  draft: Model111Result
): { code: string; value: number }[] {
  return draft.boxList.map((b) => ({
    code: b.code,
    value: round2(b.value),
  }));
}

export function draft111ResultAmount(draft: Model111Result): number {
  return round2(draft.boxes.box30);
}

export function outcome111Label(outcome: Model111Outcome): string {
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

export function compare111PresentedVsDraft(
  draft: Model111Result,
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
    ? parse111PresentedSnapshot(presented.rawExtract)
    : null;
  const presentedHasDetail = Boolean(snap);
  const legacyDetailWarning = Boolean(presented && !snap);

  const presentedMap = new Map<string, number>();
  if (snap) {
    for (const [k, v] of Object.entries(snap.boxes)) {
      const code = k.replace(/^box/, "");
      presentedMap.set(code.padStart(2, "0"), Number(v) || 0);
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
    if (p == null) status = presented ? "new" : "new";
    else if (moneyEqual(b.value, p)) status = "match";
    else status = "amount_diff";
    return {
      code,
      draft: b.value,
      presented: p,
      status,
    };
  });

  return { rows, legacyDetailWarning, presentedHasDetail };
}

export function boxesFromRecord(boxes: Model111Boxes): {
  code: string;
  value: number;
}[] {
  return Object.entries(boxes).map(([k, v]) => ({
    code: k.replace(/^box/, "").padStart(2, "0"),
    value: round2(Number(v) || 0),
  }));
}
