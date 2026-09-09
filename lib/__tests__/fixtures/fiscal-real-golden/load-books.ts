/**
 * Carga el caso real anonimizado 2026 para tests golden (sin Neon).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { quarterRange, type FiscalQuarter } from "@/lib/fiscal";
import {
  assembleModel130Chain,
  type Model130DataExpense,
  type Model130DataInvoice,
  type Model130DataMarketplace,
} from "@/lib/modelo-130/assemble";
import { presentedQuarterFromFiling } from "@/lib/modelo-130/engine";
import type { Model130Config } from "@/lib/modelo-130/types";
import {
  aggregateModel303Period,
  type Model303AssetRow,
  type Model303ExpenseRow,
  type Model303InvoiceRow,
  type Model303MarketplaceRow,
} from "@/lib/modelo-303";
import type { CensusSettingsRow } from "@/lib/fiscal-obligations";

export function goldenDir(): string {
  return join(process.cwd(), "lib/__tests__/fixtures/fiscal-real-golden");
}

function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

type ExtractFile = {
  census: Record<string, unknown>;
  q1: PeriodSlice;
  q2: PeriodSlice;
  q3: PeriodSlice;
};

type PeriodSlice = {
  invoices: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  marketplace: Record<string, unknown>[];
  assets: Record<string, unknown>[];
};

type AmortRow = {
  yearAmount: number;
  assetId: string;
  desc: string | null;
  purchaseDate: string | null;
  startYear: number | null;
  usefulLifeYears: number | null;
};

function mapInvoice(i: Record<string, unknown>): Model303InvoiceRow & Model130DataInvoice {
  const vatOp = String(i.vatOperationType ?? "SUJETA");
  const subtotal = Number(i.subtotal);
  const vatAmount = Number(i.vatAmount);
  return {
    id: String(i.idHash ?? i.number),
    fullNumber: String(i.number ?? ""),
    issueDate: localDate(String(i.date)),
    subtotal,
    vatAmount,
    irpfAmount: Number(i.irpfAmount),
    status: String(i.status),
    fiscalStatus: String(i.fiscalStatus),
    cashAccounting: Boolean(i.cashAccounting),
    vatOperationType: vatOp,
    invoiceFiscalType: i.invoiceFiscalType ? String(i.invoiceFiscalType) : null,
    lines:
      vatOp === "SUJETA" && vatAmount > 0
        ? [{ vatRate: 21, lineSubtotal: subtotal, lineVat: vatAmount }]
        : [],
  };
}

function mapExpense(e: Record<string, unknown>): Model303ExpenseRow & Model130DataExpense {
  const dua = (e.dua ?? {}) as { base?: number | null; vat?: number | null };
  return {
    id: String(e.idHash ?? e.invoiceNumber ?? "exp"),
    issueDate: localDate(String(e.date)),
    subtotal: Number(e.subtotal),
    vatAmount: Number(e.vatAmount),
    vatRate: Number(e.vatRate ?? 21),
    total: Number(e.total),
    vatOperationType: e.vatOperationType != null ? String(e.vatOperationType) : null,
    deductible: e.deductible as boolean | null | undefined,
    vatDeductiblePct: e.vatDeductiblePct as number | null | undefined,
    irpfDeductiblePct: e.irpfDeductiblePct as number | null | undefined,
    isInvestment: Boolean(e.isInvestment),
    supplierName: e.supplierMasked != null ? String(e.supplierMasked) : null,
    description: e.invoiceNumber != null ? String(e.invoiceNumber) : null,
    importDuaBase: dua.base ?? null,
    importDuaVat: dua.vat ?? null,
  };
}

function mapMarketplace(m: Record<string, unknown>): Model303MarketplaceRow & Model130DataMarketplace {
  return {
    id: String(m.idHash),
    issueDate: localDate(String(m.date)),
    subtotal: Number(m.subtotal),
    vatAmount: Number(m.vatAmount),
    vatRate: Number(m.vatRate ?? 0),
    vatStatus: m.vatStatus != null ? String(m.vatStatus) : null,
    channel: m.channel != null ? String(m.channel) : undefined,
    invoiceId: m.hasInvoice ? "linked" : null,
    transactionType: m.transactionType != null ? String(m.transactionType) : null,
    shipToCountry: m.shipToCountry != null ? String(m.shipToCountry) : null,
  };
}

function mapAsset(a: Record<string, unknown>): Model303AssetRow {
  return {
    id: String(a.idHash),
    purchaseDate: a.date ? localDate(String(a.date)) : null,
    base: Number(a.base),
    vatAmount: Number(a.vatAmount),
    vatOperationType: a.vatOperationType != null ? String(a.vatOperationType) : null,
    description: a.desc != null ? String(a.desc) : null,
    vatDeductiblePct: 100,
  };
}

export function loadGoldenExtract(): ExtractFile {
  return JSON.parse(
    readFileSync(join(goldenDir(), "extracted-read-only.json"), "utf8")
  ) as ExtractFile;
}

export function loadGoldenAmort() {
  const rows = JSON.parse(
    readFileSync(join(goldenDir(), "amort-2026.json"), "utf8")
  ) as AmortRow[];
  return rows.map((r) => ({
    yearAmount: r.yearAmount,
    purchaseDate: r.purchaseDate ? localDate(r.purchaseDate) : null,
    startYear: r.startYear,
    usefulLifeYears: r.usefulLifeYears,
    assetId: r.assetId,
    label: r.desc ?? undefined,
  }));
}

export function goldenCensusSettings(): CensusSettingsRow {
  const c = loadGoldenExtract().census;
  return {
    fiscalRegime: String(c.fiscalRegime ?? "130"),
    irpfDirectEstimationMode: String(c.irpfDirectEstimationMode ?? "UNKNOWN"),
    activityKind130: String(c.activityKind130 ?? "UNKNOWN"),
    priorYearWithholdingPct130:
      c.priorYearWithholdingPct130 == null
        ? null
        : Number(c.priorYearWithholdingPct130),
    activityStartYear:
      c.activityStartYear == null ? null : Number(c.activityStartYear),
    vatPeriodicity: String(c.vatPeriodicity ?? "UNKNOWN"),
    vatUsesSii: String(c.vatUsesSii ?? "UNKNOWN"),
    vatTerritory: String(c.vatTerritory ?? "UNKNOWN"),
    vatActivity390Scope: String(c.vatActivity390Scope ?? "UNKNOWN"),
    lastVatPeriodFilingRequired: String(
      c.lastVatPeriodFilingRequired ?? "UNKNOWN"
    ),
    paysProfessionalsSubjectToWithholding: String(
      c.paysProfessionalsSubjectToWithholding ?? "UNKNOWN"
    ),
    hasEmployees: String(c.hasEmployees ?? "UNKNOWN"),
    rentsBusinessPremises: String(c.rentsBusinessPremises ?? "UNKNOWN"),
    businessRentSubjectToWithholding: String(
      c.businessRentSubjectToWithholding ?? "UNKNOWN"
    ),
    censusModel130: String(c.censusModel130 ?? "UNKNOWN"),
    censusModel303: String(c.censusModel303 ?? "UNKNOWN"),
    censusModel111: String(c.censusModel111 ?? "UNKNOWN"),
    censusModel115: String(c.censusModel115 ?? "UNKNOWN"),
    censusModel180: String(c.censusModel180 ?? "UNKNOWN"),
    censusModel190: String(c.censusModel190 ?? "UNKNOWN"),
    censusModel349: String(c.censusModel349 ?? "UNKNOWN"),
    censusModel347: String(c.censusModel347 ?? "UNKNOWN"),
    censusModel390: String(c.censusModel390 ?? "UNKNOWN"),
    censusSource: String(c.censusSource ?? "UNKNOWN"),
    censusLastUpdatedAt: null,
  };
}

export function booksThroughQuarter(quarter: FiscalQuarter) {
  const extract = loadGoldenExtract();
  const slices = (["q1", "q2", "q3"] as const).slice(0, quarter);
  const invoices: ReturnType<typeof mapInvoice>[] = [];
  const expenses: ReturnType<typeof mapExpense>[] = [];
  const marketplace: ReturnType<typeof mapMarketplace>[] = [];
  const assets: ReturnType<typeof mapAsset>[] = [];
  for (const key of slices) {
    const p = extract[key];
    invoices.push(...p.invoices.map(mapInvoice));
    expenses.push(...p.expenses.map(mapExpense));
    marketplace.push(...p.marketplace.map(mapMarketplace));
    assets.push(...p.assets.map(mapAsset));
  }
  return { invoices, expenses, marketplace, assets, extract };
}

const CONFIG_130: Model130Config = {
  irpfDirectEstimationMode: "NORMAL",
  previousYearNetIncomeMode: "UNKNOWN",
  previousYearNetIncomeFor130Reduction: null,
  irpf130HousingDeduction: "NO",
  agriculturalActivities130: "NONE",
  irregularIncome130Status: "NONE",
  fiscalRegime: "130",
  activityKind130: "UNKNOWN",
  priorYearWithholdingPct130: null,
  activityStartYear: null,
  hasCashAccountingInvoices: false,
};

export function computeGolden130() {
  const { invoices, expenses, marketplace } = booksThroughQuarter(2);
  return assembleModel130Chain({
    year: 2026,
    config: CONFIG_130,
    invoices,
    expenses,
    marketplace,
    amortRows: loadGoldenAmort(),
    presented: {
      1: presentedQuarterFromFiling({
        quarter: 1,
        result: PRESENTED_130_Q1.result,
        boxes: PRESENTED_130_Q1.boxes,
      }),
    },
  });
}

export function computeGolden303(quarter: FiscalQuarter) {
  const { invoices, expenses, marketplace, assets } = booksThroughQuarter(quarter);
  const { from, to } = quarterRange(2026, quarter);
  return aggregateModel303Period({
    invoices: invoices as Model303InvoiceRow[],
    expenses: expenses as Model303ExpenseRow[],
    marketplace: marketplace as Model303MarketplaceRow[],
    assets,
    from,
    to,
    priorCompensation: 0,
  });
}

/** OCR gestoría — origen: FiscalFiling 130:2026:1 / 130:2026:2. No es expected de VEXO. */
export const PRESENTED_130_Q1 = {
  result: 944.7,
  boxes: [
    { code: "01", value: 11471.59 },
    { code: "02", value: 6748.1 },
    { code: "03", value: 4723.49 },
    { code: "04", value: 944.7 },
    { code: "19", value: 944.7 },
  ],
};

export const PRESENTED_130_Q2 = {
  result: 281.11,
  boxes: [
    { code: "01", value: 21785.72 },
    { code: "02", value: 14480.67 },
    { code: "03", value: 7305.05 },
    { code: "04", value: 1461.01 },
    { code: "05", value: 944.7 },
    { code: "06", value: 235.2 },
    { code: "07", value: 281.11 },
    { code: "19", value: 281.11 },
  ],
};

export const PRESENTED_303_Q2 = {
  result: 808.49,
  boxes: [
    { code: "07", value: 7218.79 },
    { code: "09", value: 1530.69 },
    { code: "10", value: 104.09 },
    { code: "11", value: 21.86 },
    { code: "27", value: 1552.55 },
    { code: "28", value: 3451.15 },
    { code: "29", value: 724.76 },
    { code: "36", value: 104.09 },
    { code: "37", value: 21.86 },
    { code: "45", value: 744.06 },
    { code: "46", value: 808.49 },
    { code: "66", value: 808.49 },
    { code: "78", value: 0 },
    { code: "87", value: 0 },
    { code: "110", value: 0 },
  ],
};

export const PRESENTED_349_Q2 = {
  operators: 1,
  amount: 104.09,
};

/**
 * Expected VEXO 2T 2026 — origen: motor sobre libros reales + amortización
 * + 130 cas.05 desde 130 Q1 presentado (944.70) + 303 fail-closed tipos ≠ 4/10/21
 * + abonos/notas de crédito con signo negativo (no clamp a 0).
 * NO copiado del OCR de gestoría.
 */
export const VEXO_130_Q2 = {
  box01: 21670.87,
  box02: 12516.55,
  box03: 9154.32,
  box04: 1830.86,
  box05: 944.7,
  box06: 235.2,
  box07: 650.96,
  box15: 0,
  box19: 650.96,
};

export const VEXO_130_Q1 = {
  box01: 11361.4,
  box02: 6216.21,
  box07: 1029.04,
  box19: 1029.04,
};

export const VEXO_303_Q2 = {
  box07: 6646.28,
  box09: 1391.01,
  box10: 1390.14,
  box11: 291.93,
  box12: 60,
  box13: 12.6,
  box27: 1695.54,
  box28: 4750.55,
  box29: 802.12,
  box36: 893.64,
  box37: 187.66,
  box38: 496.5,
  box39: 104.27,
  box45: 1094.05,
  box46: 601.49,
  box59: 0,
  box60: 365,
  box71: 601.49,
  box123: 116.5,
  baseExenta: 2602.8,
  otherBase: 578.89,
  otherQuota: 136.44,
};

/** Operadores 349 Q2 — VAT ID públicos de proveedores UE (no NIF del titular). */
export const Q2_349_OPERATORS = [
  {
    key: "A" as const,
    vatId: "DE351952217",
    amount: 1037.32,
    name: "Makeblock Europe B.V.",
    verdict: "VEXO_LIKELY_CORRECT" as const,
    note: "AIB bienes xTool. Gestoría omitió ~1037 € en 349/303 cas.10.",
  },
  {
    key: "A" as const,
    vatId: "IT04061550275",
    amount: 165.25,
    name: "PIXARTPRINTING SPA",
    verdict: "VEXO_LIKELY_CORRECT" as const,
    note: "AIB impresión. Gestoría omitió.",
  },
  {
    key: "A" as const,
    vatId: "DE360354704",
    amount: 104.09,
    name: "Bambulab GmbH",
    verdict: "MATCH" as const,
    note: "Único operador del 349 presentado.",
  },
  {
    key: "A" as const,
    vatId: "IE3347697KH",
    amount: 68.49,
    name: "Shopify International Limited",
    verdict: "NEEDS_REVIEW" as const,
    note: "SOFTWARE clasificado INTRACOMUNITARIA (bienes/A). Contraparte y merchant vs intermediario no demostrados.",
  },
  {
    key: "A" as const,
    vatId: "IE9700053D",
    amount: 14.99,
    name: "APPLE",
    verdict: "NEEDS_REVIEW" as const,
    note: "SOFTWARE clasificado INTRACOMUNITARIA (bienes/A). Misma duda que Shopify.",
  },
];
