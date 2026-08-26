import type {
  Model303Outcome,
  Model303Trace,
  Model303TraceLine,
  Model303Warning,
} from "@/lib/modelo-303/types";

export type Model303BoxRow = { code: string; label: string; value: number };

export type Model303OutcomeDisplay = {
  outcome: Model303Outcome;
  amount: number | null;
  headline: string;
  sublabel: string;
};

export type Model303FiscalSummaryRow = {
  label: string;
  boxCode: string;
  value: number;
};

export type Model303CompensationDisplay = {
  priorPending: number;
  appliedThisPeriod: number;
  pendingForFuture: number;
  newNegativeThisPeriod: number | null;
};

export type Model303WarningDisplay = {
  code: string;
  title: string;
  explanation: string;
  sourceId?: string;
  cta?: { label: string; href: string };
};

export type Model303BoxSection = {
  title: string;
  boxes: Model303BoxRow[];
};

export type Model303PresentedCompare = {
  presentedResult: number;
  draftResult: number;
  difference: number;
  matches: boolean;
};

const OUTCOME_COPY: Record<
  Model303Outcome,
  { headline: string; sublabel: string; showAmount: boolean }
> = {
  TO_PAY: {
    headline: "A INGRESAR",
    sublabel: "Resultado positivo de la autoliquidación",
    showAmount: true,
  },
  TO_COMPENSATE: {
    headline: "A COMPENSAR",
    sublabel:
      "Saldo negativo optado a compensar en trimestres siguientes (devolución no automatizada en VEXO)",
    showAmount: true,
  },
  ZERO: {
    headline: "RESULTADO CERO",
    sublabel: "No hay importe a ingresar ni saldo nuevo a compensar",
    showAmount: true,
  },
  NO_ACTIVITY: {
    headline: "SIN ACTIVIDAD",
    sublabel: "No hay operaciones que alimenten el modelo en este periodo",
    showAmount: false,
  },
};

const BOX_SECTIONS: { title: string; codes: string[] }[] = [
  {
    title: "IVA devengado",
    codes: [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "16",
      "17",
      "27",
    ],
  },
  {
    title: "IVA deducible",
    codes: [
      "28",
      "29",
      "30",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36",
      "37",
      "38",
      "39",
      "45",
    ],
  },
  {
    title: "Operaciones informativas",
    codes: ["59", "60", "123", "revisar"],
  },
  {
    title: "Liquidación y compensaciones",
    codes: ["46", "110", "78", "87", "69", "70", "109", "71"],
  },
];

const QUOTA_FOR_RATE: Record<string, string> = {
  "02": "03",
  "05": "06",
  "08": "09",
};

function shouldShowBox(
  row: Model303BoxRow,
  boxes: Model303BoxRow[],
  trace: Model303Trace | undefined,
  showAll: boolean
): boolean {
  if (showAll) return true;
  if (isNonZeroBox(row)) return true;
  if (boxHasTrace(trace, row.code)) return true;
  const quotaCode = QUOTA_FOR_RATE[row.code];
  if (quotaCode && Math.abs(boxValueFromList(boxes, quotaCode)) >= 0.005) {
    return true;
  }
  return false;
}

const QUOTA_BOXES = new Set([
  "03",
  "06",
  "09",
  "11",
  "13",
  "17",
  "27",
  "29",
  "31",
  "33",
  "35",
  "37",
  "39",
  "45",
]);

const WARNING_COPY: Record<
  string,
  Omit<Model303WarningDisplay, "code" | "sourceId">
> = {
  IMPORT_DOCUMENT_MISSING: {
    title: "Importación sin DUA",
    explanation:
      "No se ha incluido IVA deducible porque falta documentación aduanera en el gasto.",
    cta: { label: "Revisar gastos", href: "/fiscal/expenses" },
  },
  MARKETPLACE_VAT_REVIEW_REQUIRED: {
    title: "Marketplace pendiente de revisión",
    explanation:
      "No hay información suficiente para clasificar fiscalmente esta operación de marketplace.",
    cta: { label: "Revisar ingresos", href: "/fiscal/income" },
  },
  PRIOR_FILING_PROVISIONAL: {
    title: "Compensación anterior provisional",
    explanation:
      "Falta el Modelo 303 presentado del trimestre anterior; el arrastre puede cambiar al registrarlo.",
    cta: { label: "Ver presentados", href: "/fiscal/filings" },
  },
  RECTIFICATION_NOT_SUPPORTED: {
    title: "Rectificativa no soportada",
    explanation:
      "Hay documentos con importe negativo. VEXO no calcula autoliquidaciones rectificativas automáticamente.",
  },
  CASH_ACCOUNTING_NOT_FULLY_SUPPORTED: {
    title: "Criterio de caja",
    explanation:
      "Hay facturas en criterio de caja. VEXO no soporta todavía completamente el RECC en el 303.",
    cta: { label: "Ver facturas", href: "/invoices" },
  },
};

export function boxValueFromList(
  boxes: Model303BoxRow[],
  code: string
): number {
  const row = boxes.find((b) => b.code === code);
  return row?.value ?? 0;
}

export function getOutcomeDisplay(
  outcome: Model303Outcome | undefined,
  box71: number
): Model303OutcomeDisplay {
  const resolved = outcome ?? "ZERO";
  const copy = OUTCOME_COPY[resolved];
  return {
    outcome: resolved,
    amount: copy.showAmount ? box71 : null,
    headline: copy.headline,
    sublabel: copy.sublabel,
  };
}

export function buildFiscalSummary(
  boxes: Model303BoxRow[]
): Model303FiscalSummaryRow[] {
  return [
    {
      label: "IVA devengado",
      boxCode: "27",
      value: boxValueFromList(boxes, "27"),
    },
    {
      label: "IVA deducible",
      boxCode: "45",
      value: boxValueFromList(boxes, "45"),
    },
    {
      label: "Resultado régimen general",
      boxCode: "46",
      value: boxValueFromList(boxes, "46"),
    },
    {
      label: "Compensación anterior aplicada",
      boxCode: "78",
      value: boxValueFromList(boxes, "78"),
    },
    {
      label: "Resultado final",
      boxCode: "71",
      value: boxValueFromList(boxes, "71"),
    },
  ];
}

export function buildCompensationDisplay(
  boxes: Model303BoxRow[],
  currentPeriodNegative?: number
): Model303CompensationDisplay {
  const priorPending = boxValueFromList(boxes, "110");
  const appliedThisPeriod = boxValueFromList(boxes, "78");
  const pendingForFuture = boxValueFromList(boxes, "87");
  const newNeg =
    currentPeriodNegative != null && currentPeriodNegative > 0
      ? currentPeriodNegative
      : null;
  return {
    priorPending,
    appliedThisPeriod,
    pendingForFuture,
    newNegativeThisPeriod: newNeg,
  };
}

export function comparePresentedVsDraft(
  presentedResult: number,
  draftResult: number
): Model303PresentedCompare {
  const difference =
    Math.round((draftResult - presentedResult + Number.EPSILON) * 100) / 100;
  return {
    presentedResult,
    draftResult,
    difference,
    matches: Math.abs(difference) < 0.05,
  };
}

export function humanizeWarning(
  warning: Model303Warning
): Model303WarningDisplay {
  const known = WARNING_COPY[warning.code];
  const sourceCta = warningSourceCta(warning);
  if (known) {
    return {
      code: warning.code,
      title: known.title,
      explanation: warning.message || known.explanation,
      sourceId: warning.sourceId,
      cta: sourceCta ?? known.cta,
    };
  }
  return {
    code: warning.code,
    title: "Revisión necesaria",
    explanation: warning.message,
    sourceId: warning.sourceId,
    cta: sourceCta,
  };
}

function warningSourceCta(
  warning: Model303Warning
): { label: string; href: string } | undefined {
  if (!warning.sourceId) return undefined;
  switch (warning.code) {
    case "RECTIFICATION_NOT_SUPPORTED":
      return {
        label: "Ver factura",
        href: `/invoices/${warning.sourceId}`,
      };
    case "IMPORT_DOCUMENT_MISSING":
      return {
        label: "Ver gasto",
        href: `/fiscal/expenses/${warning.sourceId}/edit`,
      };
    case "MARKETPLACE_VAT_REVIEW_REQUIRED":
      return {
        label: "Ver ingreso",
        href: `/fiscal/income/${warning.sourceId}/edit`,
      };
    default:
      return undefined;
  }
}

function sourceDocumentLink(
  sourceType: Model303TraceLine["sourceType"] | undefined,
  sourceId: string
): { label: string; href: string } | undefined {
  switch (sourceType) {
    case "invoice":
      return { label: "Ver factura", href: `/invoices/${sourceId}` };
    case "expense":
      return { label: "Ver gasto", href: `/fiscal/expenses/${sourceId}/edit` };
    case "marketplace":
      return { label: "Ver ingreso", href: `/fiscal/income/${sourceId}/edit` };
    default:
      return undefined;
  }
}

export function humanizeWarnings(
  warnings: Model303Warning[]
): Model303WarningDisplay[] {
  return warnings.map((w) => humanizeWarning(w));
}

export function getTraceForBox(
  trace: Model303Trace | undefined,
  boxCode: string
): Model303TraceLine[] {
  if (!trace) return [];
  return trace[`box${boxCode}`] ?? [];
}

export function boxHasTrace(
  trace: Model303Trace | undefined,
  boxCode: string
): boolean {
  return getTraceForBox(trace, boxCode).length > 0;
}

export function traceLineAmount(
  line: Model303TraceLine,
  boxCode: string
): number {
  if (boxCode === "02" || boxCode === "05" || boxCode === "08") {
    return line.vatRate ?? 0;
  }
  if (QUOTA_BOXES.has(boxCode)) {
    if (["29", "31", "33", "35", "37", "39"].includes(boxCode)) {
      return line.vatDeductible ?? 0;
    }
    return line.vatAccrued ?? 0;
  }
  return line.base ?? line.vatAccrued ?? line.vatDeductible ?? 0;
}

export function sourceDocumentHref(
  sourceType: Model303TraceLine["sourceType"],
  sourceId?: string
): { label: string; href: string } | null {
  if (!sourceId) return null;
  return sourceDocumentLink(sourceType, sourceId) ?? null;
}

function isNonZeroBox(row: Model303BoxRow): boolean {
  if (row.code === "02" || row.code === "05" || row.code === "08") return true;
  return Math.abs(row.value) >= 0.005;
}

export function groupBoxesForDisplay(
  boxes: Model303BoxRow[],
  trace: Model303Trace | undefined,
  showAll: boolean
): Model303BoxSection[] {
  const byCode = new Map<string, Model303BoxRow[]>();
  for (const row of boxes) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  return BOX_SECTIONS.map((section) => {
    const sectionBoxes: Model303BoxRow[] = [];
    for (const code of section.codes) {
      const rows = byCode.get(code) ?? [];
      for (const row of rows) {
        if (shouldShowBox(row, boxes, trace, showAll)) {
          sectionBoxes.push(row);
        }
      }
    }
    return { title: section.title, boxes: sectionBoxes };
  }).filter((s) => s.boxes.length > 0);
}

export function parseScopeLimitations(
  scopeNote: string | undefined,
  warnings: Model303Warning[]
): string[] {
  const items: string[] = [];
  if (scopeNote) {
    if (/RE|recargo equivalencia|16\/17/i.test(scopeNote)) {
      items.push("Recargo de equivalencia no incluido en este borrador.");
    }
    if (/rectificativ/i.test(scopeNote)) {
      items.push("Autoliquidaciones rectificativas no automatizadas.");
    }
    if (/devolución no automatizada/i.test(scopeNote)) {
      items.push(
        "Un resultado negativo puede solicitarse a devolución en AEAT; VEXO asume compensación."
      );
    }
  }
  const codes = new Set(warnings.map((w) => w.code));
  if (codes.has("CASH_ACCOUNTING_NOT_FULLY_SUPPORTED")) {
    items.push("Criterio de caja (RECC) parcialmente soportado.");
  }
  if (codes.has("IMPORT_DOCUMENT_MISSING")) {
    items.push("Importaciones sin DUA documentado pueden quedar sin IVA deducible.");
  }
  if (codes.has("RECTIFICATION_NOT_SUPPORTED")) {
    items.push("Facturas rectificativas requieren revisión manual.");
  }
  return [...new Set(items)];
}
