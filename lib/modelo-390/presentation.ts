import type { Model390PresentedSnapshot, Model390Result } from "@/lib/modelo-390/types";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import { moneyEqual, round2 } from "@/lib/modelo-390/money";

export type Model390WarningDisplay = {
  code: string;
  title: string;
  explanation: string;
  severity: "blocking" | "review" | "info";
  sourceId?: string;
};

const WARNING_COPY: Record<
  string,
  { title: string; explanation: string; severity: Model390WarningDisplay["severity"] }
> = {
  PROVISIONAL_303_QUARTER: {
    title: "303 provisional",
    explanation: "Uno o más trimestres usan borrador — no hay filing presentado.",
    severity: "review",
  },
  ANNUAL_IMPORT_DATA_INCOMPLETE: {
    title: "Importación incompleta",
    explanation: "Falta documentación aduanera de al menos una importación.",
    severity: "blocking",
  },
  VAT_PRORATA_ANNUAL_REVIEW_REQUIRED: {
    title: "Posible prorrata anual",
    explanation: "Hay operaciones sujetas y exentas — revisar regularización anual.",
    severity: "blocking",
  },
  VAT_RECC_ANNUAL_REVIEW_REQUIRED: {
    title: "Criterio de caja IVA",
    explanation: "Operaciones RECC — VEXO no cierra el resumen anual por devengo automático.",
    severity: "blocking",
  },
  LEGACY_303_FILING_DETAIL: {
    title: "303 legacy",
    explanation: "Filing presentado sin casillas estructuradas.",
    severity: "info",
  },
  VAT390_MONTHLY_REVIEW: {
    title: "Periodicidad mensual",
    explanation: "Contrastar obligación/exoneración del 390 con periodicidad mensual.",
    severity: "review",
  },
};

export function humanize390Warnings(
  warnings: Model390Result["warnings"]
): Model390WarningDisplay[] {
  return warnings.map((w) => {
    const copy = WARNING_COPY[w.code];
    return {
      code: w.code,
      title: copy?.title ?? w.code,
      explanation: copy?.explanation ?? w.message,
      severity: copy?.severity ?? "info",
      sourceId: w.sourceId,
    };
  });
}

export function obligationHeadline(
  status: Model390Result["filingObligation"]["status"]
): string {
  switch (status) {
    case "REQUIRED":
      return "OBLIGATORIO";
    case "EXEMPT":
      return "EXONERADO";
    default:
      return "REVISAR OBLIGACIÓN";
  }
}

export function reconciliationHeadline(
  status: Model390Result["reconciliation"]["status"]
): string {
  switch (status) {
    case "MATCH":
      return "303 y operaciones coinciden";
    case "DIFFERENCES":
      return "Hay diferencias que revisar";
    case "PROVISIONAL":
      return "Conciliación provisional (303 no cerrados)";
    default:
      return "Revisión obligatoria antes de cerrar";
  }
}

export function build390PresentedSnapshot(result: Model390Result): Model390PresentedSnapshot {
  return {
    version: 1,
    filingObligation: result.filingObligation,
    annualFromOperations: {
      outputVat: result.annualFromOperations.outputVat,
      inputVat: result.annualFromOperations.inputVat,
      activityNet: result.annualFromOperations.activityNet,
    },
    annualFrom303: {
      outputVat: result.annualFrom303.outputVat,
      inputVat: result.annualFrom303.inputVat,
      activityNet: result.annualFrom303.activityNet,
    },
    reconciliation: result.reconciliation,
  };
}

export function parse390PresentedSnapshot(raw: unknown): Model390PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model390Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model390PresentedSnapshot;
  if (s.version !== 1) return null;
  return s;
}

export function compare390PresentedVsDraft(
  result: Model390Result,
  presented: PresentedFilingView | null
): {
  matches: boolean;
  presentedOutput: number | null;
  draftOutput: number;
  presentedInput: number | null;
  draftInput: number;
} {
  const snap = presented
    ? parse390PresentedSnapshot(
        (presented as PresentedFilingView & { rawExtract?: unknown }).rawExtract ?? null
      )
    : null;

  const draftOutput = result.annualFromOperations.outputVat;
  const draftInput = result.annualFromOperations.inputVat;

  if (!snap) {
    return {
      matches: false,
      presentedOutput: presented?.vatRepercutida != null ? round2(Number(presented.vatRepercutida)) : null,
      draftOutput,
      presentedInput: presented?.vatDeductible != null ? round2(Number(presented.vatDeductible)) : null,
      draftInput,
    };
  }

  return {
    matches:
      moneyEqual(snap.annualFromOperations.outputVat, draftOutput) &&
      moneyEqual(snap.annualFromOperations.inputVat, draftInput),
    presentedOutput: snap.annualFromOperations.outputVat,
    draftOutput,
    presentedInput: snap.annualFromOperations.inputVat,
    draftInput,
  };
}
