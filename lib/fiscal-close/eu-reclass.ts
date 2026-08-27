/**
 * Preview reclasificación UE A→I (sin persistir).
 */

import { quarterRange, type FiscalQuarter } from "@/lib/fiscal";
import { aggregateModel303Period } from "@/lib/modelo-303";
import { resolve349KeyFromPurchase } from "@/lib/modelo-349/keys";

export type EuReclassExpense = {
  id: string;
  issueDate: Date;
  subtotal: number | { toNumber?: () => number };
  vatAmount: number | { toNumber?: () => number };
  vatRate?: number | null;
  total: number | { toNumber?: () => number };
  vatOperationType: string | null;
  vatDeductiblePct?: number | null;
  irpfDeductiblePct?: number | null;
  isInvestment?: boolean | null;
  supplierName?: string | null;
  category?: string | null;
  description?: string | null;
  supplierNif?: string | null;
  documentId?: string | null;
  notes?: string | null;
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "toNumber" in v) {
    return Number((v as { toNumber: () => number }).toNumber());
  }
  return Number(v) || 0;
}

export type EuNatureClassification =
  | "CONFIRMED_SERVICE"
  | "CONFIRMED_GOODS"
  | "INSUFFICIENT_DATA";

/**
 * Clasifica por evidencia documental — no por nombre de proveedor.
 */
export function classifyEuPurchaseNature(exp: EuReclassExpense): {
  classification: EuNatureClassification;
  reasons: string[];
  suggestedType: "SERVICIO_INTRACOMUNITARIO" | null;
} {
  const reasons: string[] = [];
  const op = String(exp.vatOperationType ?? "");
  if (op !== "INTRACOMUNITARIA") {
    return {
      classification: "INSUFFICIENT_DATA",
      reasons: ["No es INTRACOMUNITARIA actualmente."],
      suggestedType: null,
    };
  }

  const desc = String(exp.description ?? "").toLowerCase();
  const cat = String(exp.category ?? "").toUpperCase();
  const notes = String(exp.notes ?? "").toLowerCase();
  const hasDoc = Boolean(exp.documentId);

  const looksSubscription =
    /suscripci[oó]n|subscription|saas|software|app|plataforma|cloud|icom/.test(
      desc
    ) || cat === "SOFTWARE";
  const mentionsReverse =
    /reverse charge|inversi[oó]n del sujeto|intracomunitaria/.test(notes);

  if (cat === "SOFTWARE" && looksSubscription && hasDoc) {
    reasons.push("category SOFTWARE");
    reasons.push("descripción de suscripción/servicio");
    if (exp.supplierNif) reasons.push(`VAT ID ${exp.supplierNif}`);
    if (mentionsReverse) reasons.push("reverse charge en notas/documento");
    reasons.push("documento adjunto presente");
    return {
      classification: "CONFIRMED_SERVICE",
      reasons,
      suggestedType: "SERVICIO_INTRACOMUNITARIO",
    };
  }

  if (cat === "SOFTWARE" && looksSubscription && !hasDoc) {
    reasons.push("category SOFTWARE / descripción sugiere servicio");
    reasons.push("sin documento adjunto → insuficiente para confirmar");
    return {
      classification: "INSUFFICIENT_DATA",
      reasons,
      suggestedType: null,
    };
  }

  reasons.push("Evidencia documental insuficiente para bien vs servicio.");
  return {
    classification: "INSUFFICIENT_DATA",
    reasons,
    suggestedType: null,
  };
}

export function previewEuReclassification(opts: {
  year: number;
  quarter: FiscalQuarter;
  expenses: EuReclassExpense[];
  reclassifyIds: string[];
}): {
  before: {
    box10: number;
    box11: number;
    box36: number;
    box71: number;
    keyA: number;
    keyI: number;
  };
  after: {
    box10: number;
    box11: number;
    box36: number;
    box71: number;
    keyA: number;
    keyI: number;
  };
  delta: {
    box10: number;
    box11: number;
    box36: number;
    box71: number;
    keyA: number;
    keyI: number;
  };
} {
  const { from, to } = quarterRange(opts.year, opts.quarter);
  const idSet = new Set(opts.reclassifyIds);

  const mapExp = (reclass: boolean) =>
    opts.expenses.map((e) => ({
      id: e.id,
      issueDate: e.issueDate,
      subtotal: num(e.subtotal),
      vatAmount: num(e.vatAmount),
      vatRate: e.vatRate ?? 21,
      total: num(e.total),
      vatOperationType:
        reclass && idSet.has(e.id)
          ? "SERVICIO_INTRACOMUNITARIO"
          : e.vatOperationType,
      vatDeductiblePct: e.vatDeductiblePct ?? 100,
      irpfDeductiblePct: e.irpfDeductiblePct ?? 100,
      isInvestment: Boolean(e.isInvestment),
      supplierName: e.supplierName ?? "",
    }));

  const sumKeys = (reclass: boolean) => {
    let A = 0;
    let I = 0;
    for (const e of opts.expenses) {
      const op =
        reclass && idSet.has(e.id)
          ? "SERVICIO_INTRACOMUNITARIO"
          : e.vatOperationType;
      const k = resolve349KeyFromPurchase(op);
      if (k === "A") A += num(e.subtotal);
      if (k === "I") I += num(e.subtotal);
    }
    return { A: Math.round(A * 100) / 100, I: Math.round(I * 100) / 100 };
  };

  const b303 = aggregateModel303Period({
    invoices: [],
    marketplace: [],
    assets: [],
    expenses: mapExp(false),
    from,
    to,
  }).modelo303.boxes;
  const a303 = aggregateModel303Period({
    invoices: [],
    marketplace: [],
    assets: [],
    expenses: mapExp(true),
    from,
    to,
  }).modelo303.boxes;
  const bk = sumKeys(false);
  const ak = sumKeys(true);

  const before = {
    box10: b303.box10,
    box11: b303.box11,
    box36: b303.box36,
    box71: b303.box71,
    keyA: bk.A,
    keyI: bk.I,
  };
  const after = {
    box10: a303.box10,
    box11: a303.box11,
    box36: a303.box36,
    box71: a303.box71,
    keyA: ak.A,
    keyI: ak.I,
  };
  return {
    before,
    after,
    delta: {
      box10: Math.round((after.box10 - before.box10) * 100) / 100,
      box11: Math.round((after.box11 - before.box11) * 100) / 100,
      box36: Math.round((after.box36 - before.box36) * 100) / 100,
      box71: Math.round((after.box71 - before.box71) * 100) / 100,
      keyA: Math.round((after.keyA - before.keyA) * 100) / 100,
      keyI: Math.round((after.keyI - before.keyI) * 100) / 100,
    },
  };
}
