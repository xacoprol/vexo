import { effective347OperatorAmount } from "@/lib/modelo-347/aggregate";
import type { FilingBox } from "@/lib/gemini-fiscal-filing";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type {
  Model347Operator,
  Model347PresentedSnapshot,
  Model347Result,
  Model347Warning,
} from "@/lib/modelo-347/types";
import { round2 } from "@/lib/modelo-347/threshold";

export type Model347WarningDisplay = {
  code: string;
  title: string;
  explanation: string;
  sourceId?: string;
  cta?: { label: string; href: string };
};

export type Model347PresentedCompareRow = {
  taxId: string;
  operatorName: string;
  operationType: string;
  presentedAmount: number | null;
  draftAmount: number;
  status: "match" | "new" | "missing" | "amount_diff" | "quarter_diff";
};

export type Model347PresentedCompare = {
  rows: Model347PresentedCompareRow[];
  matches: boolean;
  presentedHasDetail: boolean;
  legacyDetailWarning: boolean;
};

const WARNING_COPY: Record<
  string,
  { title: string; explanation: string; cta?: { label: string; href: string } }
> = {
  OPERATOR_347_ID_MISSING: {
    title: "Falta NIF del operador",
    explanation: "Sin identificación fiscal no puede declararse en el 347.",
    cta: { label: "Completar NIF", href: "/fiscal/expenses?missingNif=1" },
  },
  OPERATOR_347_ID_PLACEHOLDER: {
    title: "NIF provisional",
    explanation: "Identificador PEND-… — completar antes de declarar.",
  },
  OPERATOR_347_ID_VARIOS: {
    title: "Contraparte «varios»",
    explanation: "No se puede agrupar como operador identificable del 347.",
  },
  MODEL347_CASH_ACCOUNTING_DATA_INCOMPLETE: {
    title: "RECC — datos incompletos",
    explanation:
      "Hay operaciones acogidas al criterio de caja para las que VEXO no dispone de información suficiente para cerrar el Modelo 347.",
    cta: { label: "Revisar cobros", href: "/invoices" },
  },
  MODEL347_CASH_ACCOUNTING_REVIEW_REQUIRED: {
    title: "Criterio de caja (RECC)",
    explanation:
      "Factura en criterio de caja IVA. VEXO imputa por devengo — revisar imputación 347 si aplica RECC.",
  },
  MODEL347_CASH_PAYMENTS_DATA_LIMITED: {
    title: "Posible metálico",
    explanation:
      "VEXO no acumula percepciones en metálico por operador para el apartado específico del 347.",
  },
  MARKETPLACE_347_REVIEW_REQUIRED: {
    title: "Marketplace — revisar",
    explanation: "Ingreso sin contraparte fiscal identificable.",
    cta: { label: "Marketplace", href: "/fiscal/marketplace" },
  },
  LEGACY_347_FILING_DETAIL: {
    title: "347 legacy sin snapshot",
    explanation: "El filing presentado no guarda detalle por operador.",
  },
};

export function humanize347Warnings(
  warnings: Model347Warning[]
): Model347WarningDisplay[] {
  return warnings.map((w) => {
    const copy = WARNING_COPY[w.code];
    return {
      code: w.code,
      title: copy?.title ?? w.code,
      explanation: copy?.explanation ?? w.message,
      sourceId: w.sourceId,
      cta: copy?.cta,
    };
  });
}

export function build347DraftBoxes(result: Model347Result): FilingBox[] {
  return [
    {
      code: "ventas",
      label: "Total ventas declarables",
      value: result.salesTotal,
    },
    {
      code: "compras",
      label: "Total compras declarables",
      value: result.purchasesTotal,
    },
    {
      code: "operadores",
      label: "Operadores declarables",
      value: result.declarableCount,
    },
  ];
}

export function draft347Total(result: Model347Result): number {
  return round2(result.salesTotal + result.purchasesTotal);
}

export function parse347PresentedSnapshot(raw: unknown): Model347PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model347Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model347PresentedSnapshot;
  if (s.version !== 1 || !Array.isArray(s.operators)) return null;
  return s;
}

export function build347PresentedSnapshot(
  result: Model347Result
): Model347PresentedSnapshot {
  return {
    version: 1,
    operators: result.declarableOperators.map((o) => ({
      taxId: o.taxId,
      name: o.name,
      operationType: o.operationType,
      annualAmount: o.annualAmount,
      ...(o.cashAccountingAnnualAmount != null
        ? { cashAccountingAnnualAmount: o.cashAccountingAnnualAmount }
        : {}),
      q1: o.quarters.q1,
      q2: o.quarters.q2,
      q3: o.quarters.q3,
      q4: o.quarters.q4,
    })),
  };
}

function presentedOperators(
  presented: PresentedFilingView
): Model347Operator[] | null {
  const snap = parse347PresentedSnapshot(
    (presented as PresentedFilingView & { rawExtract?: unknown }).rawExtract ?? null
  );
  if (!snap) return null;
  return snap.operators.map((o) => ({
    operatorId: o.taxId,
    taxId: o.taxId,
    name: o.name,
    country: null,
    operationType: o.operationType,
    annualAmount: o.annualAmount,
    quarters: { q1: o.q1, q2: o.q2, q3: o.q3, q4: o.q4 },
    trace: [],
    declarable: true,
  }));
}

export function compare347PresentedVsDraft(
  result: Model347Result,
  presented: PresentedFilingView | null
): Model347PresentedCompare {
  const draftOps = result.declarableOperators;
  if (!presented) {
    return {
      rows: draftOps.map((o) => ({
        taxId: o.taxId,
        operatorName: o.name,
        operationType: o.operationType,
        presentedAmount: null,
        draftAmount: effective347OperatorAmount(o),
        status: "new" as const,
      })),
      matches: false,
      presentedHasDetail: false,
      legacyDetailWarning: false,
    };
  }

  const presOps = presentedOperators(presented);
  const legacyDetailWarning = presOps == null && presented.boxes.length > 0;

  if (!presOps) {
    return {
      rows: draftOps.map((o) => ({
        taxId: o.taxId,
        operatorName: o.name,
        operationType: o.operationType,
        presentedAmount: null,
        draftAmount: effective347OperatorAmount(o),
        status: "new" as const,
      })),
      matches: false,
      presentedHasDetail: false,
      legacyDetailWarning,
    };
  }

  const draftMap = new Map(
    draftOps.map((o) => [`${o.operationType}|${o.taxId}`, o] as const)
  );
  const presMap = new Map(
    presOps.map((o) => [`${o.operationType}|${o.taxId}`, o] as const)
  );
  const keys = new Set([...draftMap.keys(), ...presMap.keys()]);
  const rows: Model347PresentedCompareRow[] = [];

  for (const k of keys) {
    const draft = draftMap.get(k);
    const pres = presMap.get(k);
    if (draft && pres) {
      const diff = round2(effective347OperatorAmount(draft) - pres.annualAmount);
      const quarterDiff =
        draft.quarters.q1 !== pres.quarters.q1 ||
        draft.quarters.q2 !== pres.quarters.q2 ||
        draft.quarters.q3 !== pres.quarters.q3 ||
        draft.quarters.q4 !== pres.quarters.q4;
      rows.push({
        taxId: draft.taxId,
        operatorName: draft.name,
        operationType: draft.operationType,
        presentedAmount: pres.annualAmount,
        draftAmount: effective347OperatorAmount(draft),
        status:
          Math.abs(diff) < 0.01
            ? quarterDiff
              ? "quarter_diff"
              : "match"
            : "amount_diff",
      });
    } else if (draft && !pres) {
      rows.push({
        taxId: draft.taxId,
        operatorName: draft.name,
        operationType: draft.operationType,
        presentedAmount: null,
        draftAmount: effective347OperatorAmount(draft),
        status: "new",
      });
    } else if (pres && !draft) {
      rows.push({
        taxId: pres.taxId,
        operatorName: pres.name,
        operationType: pres.operationType,
        presentedAmount: pres.annualAmount,
        draftAmount: 0,
        status: "missing",
      });
    }
  }

  return {
    rows: rows.sort((a, b) => Math.abs(b.draftAmount) - Math.abs(a.draftAmount)),
    matches: rows.every((r) => r.status === "match"),
    presentedHasDetail: true,
    legacyDetailWarning,
  };
}

export function operationTypeLabel(t: "A" | "B"): string {
  return t === "A" ? "Compras" : "Ventas";
}
