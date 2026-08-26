import type { FiscalQuarter } from "@/lib/fiscal";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { Model303Warning } from "@/lib/modelo-303/types";
import { moneyEqual } from "@/lib/modelo-390/money";
import type {
  Model390AnnualVatSummary,
  Model390FilingObligation,
} from "@/lib/modelo-390/types";
import type { VatPeriodicity, VatTerritory } from "@/lib/modelo-390/vat-config";

export type LastPeriodAnnualInfoStatus =
  | "COMPLETE"
  | "INCOMPLETE"
  | "REQUIRES_REVIEW";

export type LastPeriodAnnual303Field = {
  code: string;
  label: string;
  value: number | null;
  known: boolean;
};

export type LastPeriodAnnual303Comparison = {
  quarter: FiscalQuarter;
  divergesFromCurrent: boolean;
  differences: {
    code: string;
    label: string;
    presented: number | null;
    current: number | null;
  }[];
};

export type LastPeriodAnnual303Info = {
  applicable: boolean;
  status: LastPeriodAnnualInfoStatus;
  lastPeriodLabel: string;
  fields: LastPeriodAnnual303Field[];
  warnings: Model303Warning[];
  presented?: LastPeriodAnnual303Comparison;
};

const ANNUAL_BOX_CODES = [
  "27",
  "45",
  "32",
  "33",
  "34",
  "35",
  "59",
  "60",
  "99",
] as const;

function parsePresentedBox(
  presented: PresentedFilingView | null,
  code: string
): number | null {
  if (!presented?.boxes?.length) return null;
  const row = presented.boxes.find((b) => b.code === code);
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

function field(
  code: string,
  label: string,
  value: number | null,
  known: boolean
): LastPeriodAnnual303Field {
  return { code, label, value, known };
}

/**
 * Bloque anual del último 303 para sujetos exonerados del 390.
 * Consume el resumen anual de Fase 7 — no recalcula operaciones.
 */
export function buildLastPeriodAnnual303Info(opts: {
  year: number;
  filingObligation: Model390FilingObligation;
  annualFromOperations: Model390AnnualVatSummary;
  requiresReview: boolean;
  vatPeriodicity: VatPeriodicity;
  vatTerritory: VatTerritory;
  presentedLast303: PresentedFilingView | null;
}): LastPeriodAnnual303Info {
  const {
    filingObligation,
    annualFromOperations,
    requiresReview,
    vatPeriodicity,
    vatTerritory,
    presentedLast303,
  } = opts;
  const applicable =
    filingObligation.status === "EXEMPT" &&
    filingObligation.requiresLastPeriodAnnualInfo;

  const b = annualFromOperations.breakdown;
  const warnings: Model303Warning[] = [];

  const volumeTotal = round2Safe(
    b.taxableBaseDomestic +
      b.baseExenta +
      b.baseIntracomDeliveries +
      b.baseExport +
      b.baseMarketplaceOss +
      b.importCurrentBase +
      b.importInvestmentBase
  );

  const fields: LastPeriodAnnual303Field[] = [
    field("99", "Volumen total operaciones ejercicio", volumeTotal, true),
    field("27", "Total cuota devengada anual", annualFromOperations.outputVat, true),
    field("45", "Total cuota deducible anual", annualFromOperations.inputVat, true),
    field("32", "Importaciones corrientes (base anual)", b.importCurrentBase, true),
    field("33", "Importaciones corrientes (cuota anual)", b.importCurrentVat, true),
    field("34", "Importaciones inversión (base anual)", b.importInvestmentBase, true),
    field("35", "Importaciones inversión (cuota anual)", b.importInvestmentVat, true),
    field("59", "Entregas intracomunitarias (base anual)", b.baseIntracomDeliveries, true),
    field("60", "Exportaciones (base anual)", b.baseExport, true),
    field(
      "prorrata",
      "Porcentaje de prorrata definitivo",
      null,
      false
    ),
    field(
      "sectores",
      "Sectores diferenciados",
      null,
      false
    ),
    field(
      "multi_admin",
      "Tributación exclusiva territorio común",
      vatTerritory === "COMMON_ONLY" ? 1 : vatTerritory === "OTHER" ? 0 : null,
      vatTerritory !== "UNKNOWN"
    ),
  ];

  const annualWarnings = annualFromOperations.warnings;
  const hasProrrataFlag = annualWarnings.some(
    (w) =>
      w.code === "VAT_PRORATA_REVIEW_REQUIRED" ||
      w.code === "VAT_PRORATA_ANNUAL_REVIEW_REQUIRED"
  );
  const hasImportIncomplete = annualWarnings.some(
    (w) =>
      w.code === "IMPORT_DOCUMENT_MISSING" ||
      w.code === "ANNUAL_IMPORT_DATA_INCOMPLETE"
  );

  if (hasProrrataFlag) {
    warnings.push({
      code: "VAT_PRORATA_ANNUAL_REVIEW_REQUIRED",
      message:
        "Actividad mixta sujeta/exenta — el bloque anual del último 303 puede requerir prorrata. VEXO no la calcula automáticamente.",
    });
  }
  if (hasImportIncomplete) {
    warnings.push({
      code: "ANNUAL_IMPORT_DATA_INCOMPLETE",
      message:
        "Hay importaciones sin DUA completo — revisar antes de cerrar la información anual del último 303.",
    });
  }
  if (vatTerritory === "UNKNOWN") {
    warnings.push({
      code: "VAT390_TERRITORY_UNKNOWN",
      message:
        "Territorio de tributación IVA desconocido — puede afectar al bloque anual del último 303.",
    });
  }
  if (vatTerritory === "OTHER") {
    warnings.push({
      code: "VAT390_MULTI_ADMIN_REVIEW",
      message:
        "Tributación fuera de territorio común exclusivo — revisar información anual sobre varias Administraciones.",
    });
  }

  let status: LastPeriodAnnualInfoStatus = "COMPLETE";
  if (
    hasProrrataFlag ||
    hasImportIncomplete ||
    vatTerritory === "UNKNOWN" ||
    vatTerritory === "OTHER" ||
    requiresReview
  ) {
    status = "REQUIRES_REVIEW";
  } else if (!applicable) {
    status = "INCOMPLETE";
  }

  const lastQuarter: FiscalQuarter = 4;
  const lastPeriodLabel =
    vatPeriodicity === "MONTHLY"
      ? `Diciembre ${opts.year} (último período mensual)`
      : `4T ${opts.year}`;

  let presented: LastPeriodAnnual303Comparison | undefined;
  if (presentedLast303) {
    const differences: LastPeriodAnnual303Comparison["differences"] = [];
    for (const code of ANNUAL_BOX_CODES) {
      const f = fields.find((x) => x.code === code);
      const current = f?.known ? f.value : null;
      const pres = parsePresentedBox(presentedLast303, code);
      if (current != null && pres != null && !moneyEqual(current, pres)) {
        differences.push({
          code,
          label: f?.label ?? code,
          presented: pres,
          current,
        });
      }
    }
    presented = {
      quarter: lastQuarter,
      divergesFromCurrent: differences.length > 0,
      differences,
    };
    if (differences.length > 0) {
      warnings.push({
        code: "LAST_303_ANNUAL_DIVERGENCE",
        message:
          "El último 303 presentado difiere del cálculo anual actual — el filing presentado no se modifica.",
      });
    }
  }

  if (!applicable) {
    return {
      applicable: false,
      status: "INCOMPLETE",
      lastPeriodLabel,
      fields: [],
      warnings: [],
      presented,
    };
  }

  return {
    applicable: true,
    status,
    lastPeriodLabel,
    fields,
    warnings,
    presented,
  };
}

function round2Safe(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lastPeriodAnnualInfoHeadline(
  status: LastPeriodAnnualInfoStatus
): string {
  switch (status) {
    case "COMPLETE":
      return "COMPLETA";
    case "REQUIRES_REVIEW":
      return "REQUIERE REVISIÓN";
    default:
      return "PENDIENTE";
  }
}
