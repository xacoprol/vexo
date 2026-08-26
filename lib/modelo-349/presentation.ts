import type { FilingBox } from "@/lib/gemini-fiscal-filing";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import { MODEL349_KEY_LABELS } from "@/lib/modelo-349/keys";
import { parse349PresentedSnapshot } from "@/lib/modelo-349/rectifications";
import type {
  Model349Operation,
  Model349OperationKey,
  Model349Result,
  Model349Warning,
} from "@/lib/modelo-349/types";
import { round2 } from "@/lib/modelo-349/aggregate";

export type Model349WarningDisplay = {
  code: string;
  title: string;
  explanation: string;
  sourceId?: string;
  cta?: { label: string; href: string };
};

export type Model349PresentedCompareRow = {
  vatId: string;
  operatorName: string;
  key: Model349OperationKey;
  presentedAmount: number | null;
  draftAmount: number;
  status: "match" | "new" | "missing" | "amount_diff" | "key_diff";
};

export type Model349PresentedCompare = {
  rows: Model349PresentedCompareRow[];
  matches: boolean;
  presentedHasDetail: boolean;
  legacyDetailWarning: boolean;
};

const WARNING_COPY: Record<
  string,
  { title: string; explanation: string; cta?: { label: string; href: string } }
> = {
  EU_VAT_ID_MISSING: {
    title: "Falta NIF-IVA",
    explanation:
      "La operación intracomunitaria no puede declararse en 349 sin identificación IVA del operador.",
    cta: { label: "Completar NIF", href: "/fiscal/expenses?missingNif=1" },
  },
  EU_VAT_ID_PLACEHOLDER: {
    title: "NIF-IVA provisional",
    explanation:
      "Hay un identificador PEND-… que debe sustituirse por el VAT ID real antes de presentar.",
  },
  EU_VAT_ID_INVALID: {
    title: "NIF-IVA inválido",
    explanation: "El formato del identificador IVA no es válido para un operador UE.",
  },
  MARKETPLACE_349_REVIEW_REQUIRED: {
    title: "Marketplace — revisar 349",
    explanation:
      "Venta marketplace sin perfil B2B/VAT ID o con OSS — no se incluye silenciosamente en el 349.",
    cta: { label: "Ingresos marketplace", href: "/fiscal/marketplace" },
  },
  PRIOR_349_DATA_MISSING: {
    title: "349 anterior sin detalle",
    explanation:
      "Hay una rectificativa que afecta al 349 pero no existe histórico presentado con detalle por operador/clave.",
  },
  LEGACY_349_FILING_DETAIL: {
    title: "349 legacy sin snapshot",
    explanation:
      "El filing presentado solo guarda totales por clave — la rectificación puede requerir revisión manual.",
  },
};

export function humanize349Warnings(
  warnings: Model349Warning[]
): Model349WarningDisplay[] {
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

export function build349DraftBoxes(result: Model349Result): FilingBox[] {
  const keys = ["E", "A", "S", "I"] as const;
  return keys
    .filter((k) => (result.totalsByKey[k] ?? 0) !== 0)
    .map((k) => ({
      code: k,
      label: MODEL349_KEY_LABELS[k],
      value: result.totalsByKey[k] ?? 0,
    }));
}

export function draft349Total(result: Model349Result): number {
  return round2(
    Object.values(result.totalsByKey).reduce(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0
    )
  );
}

function presentedOperations(
  presented: PresentedFilingView
): Model349Operation[] | null {
  const row = presented as PresentedFilingView & { rawExtract?: unknown };
  const snap = parse349PresentedSnapshot(row.rawExtract ?? null);
  if (!snap) return null;
  return snap.operations.map((o) => ({
    ...o,
    trace: [],
  }));
}

export function compare349PresentedVsDraft(
  result: Model349Result,
  presented: PresentedFilingView | null
): Model349PresentedCompare {
  if (!presented) {
    return {
      rows: result.operations.map((o) => ({
        vatId: o.vatId,
        operatorName: o.operatorName,
        key: o.key,
        presentedAmount: null,
        draftAmount: o.amount,
        status: "new" as const,
      })),
      matches: false,
      presentedHasDetail: false,
      legacyDetailWarning: false,
    };
  }

  const presentedOps = presentedOperations(presented);
  const legacyDetailWarning = presentedOps == null && presented.boxes.length > 0;

  if (!presentedOps) {
    return {
      rows: result.operations.map((o) => ({
        vatId: o.vatId,
        operatorName: o.operatorName,
        key: o.key,
        presentedAmount: null,
        draftAmount: o.amount,
        status: "new" as const,
      })),
      matches: false,
      presentedHasDetail: false,
      legacyDetailWarning,
    };
  }

  const draftMap = new Map(
    result.operations.map((o) => [`${o.key}|${o.vatId}`, o] as const)
  );
  const presentedMap = new Map(
    presentedOps.map((o) => [`${o.key}|${o.vatId}`, o] as const)
  );

  const keys = new Set([...draftMap.keys(), ...presentedMap.keys()]);
  const rows: Model349PresentedCompareRow[] = [];

  for (const k of keys) {
    const draft = draftMap.get(k);
    const pres = presentedMap.get(k);
    if (draft && pres) {
      const diff = round2(draft.amount - pres.amount);
      rows.push({
        vatId: draft.vatId,
        operatorName: draft.operatorName,
        key: draft.key,
        presentedAmount: pres.amount,
        draftAmount: draft.amount,
        status: Math.abs(diff) < 0.01 ? "match" : "amount_diff",
      });
    } else if (draft && !pres) {
      rows.push({
        vatId: draft.vatId,
        operatorName: draft.operatorName,
        key: draft.key,
        presentedAmount: null,
        draftAmount: draft.amount,
        status: "new",
      });
    } else if (pres && !draft) {
      rows.push({
        vatId: pres.vatId,
        operatorName: pres.operatorName,
        key: pres.key,
        presentedAmount: pres.amount,
        draftAmount: 0,
        status: "missing",
      });
    }
  }

  const matches = rows.every((r) => r.status === "match");
  return {
    rows: rows.sort((a, b) => Math.abs(b.draftAmount) - Math.abs(a.draftAmount)),
    matches,
    presentedHasDetail: true,
    legacyDetailWarning,
  };
}

export function periodicityLabel(p: Model349Result["periodicity"]): string {
  return p === "MONTHLY" ? "MENSUAL" : "TRIMESTRAL";
}
