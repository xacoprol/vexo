import { endOfYear, startOfYear } from "date-fns";
import { fiscalFilingPeriodKey } from "@/lib/gemini-fiscal-filing";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import {
  sumAmortizationYtd,
  type AmortizationPeriodInput,
} from "@/lib/investment-amortization";
import {
  assembleModel130Chain,
  model130ResultToModeloBoxes,
} from "@/lib/modelo-130/assemble";
import {
  aggregateModel303Period,
  buildModel303ChainFromRows,
  carryFromPresented303,
  model303ResultToLegacyBoxes,
  parsePurchaseVatKind,
  presented303CarryToPriorCompensation,
  isPurchaseReverseCharge as isPurchaseRc,
} from "@/lib/modelo-303";
import type { Model303Outcome, Model303Trace } from "@/lib/modelo-303";
import {
  parseIrpfDirectEstimationMode,
  presentedQuarterFromFiling,
} from "@/lib/modelo-130";
import {
  parseAgriculturalActivities130,
  parseIrpf130HousingDeduction,
  parseIrregularIncome130Status,
  parsePreviousYearNetIncome130Mode,
} from "@/lib/modelo-130/config-enums";
import type {
  Model130Config,
  Model130TraceLine,
  Model130Warning,
  PresentedQuarter130,
} from "@/lib/modelo-130/types";
import { marketplaceIncomeNotInvoicedWhere } from "@/lib/marketplace-invoice";
import { prisma } from "@/lib/prisma";
import { EXPENSE_FISCAL_SELECT } from "@/lib/fiscal-expense-select";
import { buildModel390Result } from "@/lib/modelo-390/engine";
import { buildModelo390LegacyAdapter } from "@/lib/modelo-390/legacy-adapter";

export type FiscalQuarter = 1 | 2 | 3 | 4;

export type VatBucket = {
  rate: number;
  base: number;
  quota: number;
};

export type ModeloBoxes = {
  boxes: { code: string; label: string; value: number }[];
  result: number;
  /** Saldo a compensar que arrastra al siguiente periodo (303). */
  carryForward?: number;
  /** Avisos fiscales (130 / 303). */
  warnings?: { code: string; message: string; sourceId?: string }[];
  /** Trazabilidad Modelo 130. */
  trace?: {
    box01: Model130TraceLine[];
    box02: Model130TraceLine[];
    box06: Model130TraceLine[];
    box05: Model130TraceLine[];
    box13: Model130TraceLine[];
    box15: Model130TraceLine[];
  };
  /** Trazabilidad Modelo 303 (Fase 3). */
  trace303?: Model303Trace;
  /** Resultado 303 tipificado. */
  outcome303?: Model303Outcome;
  /** max(0, −box71) — magnitud interna del periodo (≠ casilla 70). */
  currentPeriodNegative?: number;
  /** box87 — saldo anterior pendiente. */
  priorCompensationPending?: number;
  /** Obligación de presentar (separada del cálculo). */
  filingObligation?: import("@/lib/modelo-130/filing-obligation").FilingObligation;
  scopeNote?: string;
};

export type FiscalPeriodSummary = {
  year: number;
  quarter: FiscalQuarter;
  from: Date;
  to: Date;
  label: string;
  issued: {
    count: number;
    vatBuckets: VatBucket[];
    baseSujeta: number;
    quotaRepercutida: number;
    baseExenta: number;
    baseIntracom: number;
    baseExport: number;
    baseCanarias: number;
    baseMarketplaceCollected: number;
    irpfWithheld: number;
    incomeBase: number;
    invoiceIncomeBase: number;
    marketplaceCount: number;
    marketplaceIncomeBase: number;
  };
  expenses: {
    count: number;
    /** Base IRPF de gastos corrientes (sin bienes de inversión; esos van por amortización) */
    base: number;
    /** IVA soportado compras interiores (casillas 28/29) */
    vatDeductible: number;
    /** AIB IVA devengado: base (casilla 10) */
    aibBase: number;
    /** AIB IVA devengado: cuota (casilla 11) */
    aibQuota: number;
    /** AIB IVA deducible: base (casilla 36) */
    aibDeductibleBase: number;
    /** AIB IVA deducible: cuota (casilla 37) */
    aibDeductibleVat: number;
    /** Servicios desde terceros países (EEUU…): base (16) */
    importServiceBase: number;
    /** Servicios extracomunitarios: cuota ISP (17) */
    importServiceQuota: number;
    total: number;
  };
  modelo303: ModeloBoxes;
  modelo130: ModeloBoxes;
};

export type FiscalQuarterSlice = {
  quarter: FiscalQuarter;
  label: string;
  incomeBase: number;
  expensesBase: number;
  irpfWithheld: number;
  modelo303Result: number;
  modelo130Result: number;
};

export type FiscalYearSummary = {
  year: number;
  from: Date;
  to: Date;
  label: string;
  issued: FiscalPeriodSummary["issued"];
  expenses: FiscalPeriodSummary["expenses"];
  modelo303: ModeloBoxes;
  modelo130: ModeloBoxes;
  /** Borrador orientativo Modelo 390 (declaración-resumen anual IVA) */
  modelo390: ModeloBoxes;
  /** Suma de resultados 303 de cada trimestre (a ingresar neto del año) */
  ivaNetYear: number;
  /** Suma de ingresos a cuenta 130 (solo resultados positivos de cada T) */
  irpfPaymentsYear: number;
  quarters: FiscalQuarterSlice[];
  /** Cadena trimestral 303 con trazas (salud fiscal / auditoría). */
  chain303: Record<FiscalQuarter, ModeloBoxes>;
  /** Cadena trimestral 130 YTD con trazas. */
  chain130: Record<FiscalQuarter, ModeloBoxes>;
};

type InvoiceRow = {
  id: string;
  fullNumber?: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  irpfAmount: unknown;
  status: string;
  fiscalStatus: string;
  cashAccounting?: boolean;
  vatOperationType: string | null;
  invoiceFiscalType?: string | null;
  rectificationType?: string | null;
  rectifiesInvoiceId?: string | null;
  rectifiesInvoiceFullNumber?: string | null;
  lines: {
    vatRate: number;
    lineSubtotal: unknown;
    lineVat: unknown;
  }[];
};

type ExpenseRow = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  total: unknown;
  vatOperationType: string | null;
  /**
   * @deprecated Preferir vatDeductiblePct / irpfDeductiblePct.
   * Si los pct faltan, se deriva: true→100/100, false→0/0.
   */
  deductible?: boolean | null;
  vatDeductiblePct?: number | null;
  irpfDeductiblePct?: number | null;
  /** IVA interior → casillas 30/31 vía InvestmentAsset; no entra en 28/29 */
  isInvestment: boolean;
  description?: string | null;
  supplierName?: string | null;
  importDuaBase?: unknown;
  importDuaVat?: unknown;
  importDuaDocumentId?: string | null;
};

type MarketplaceRow = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  vatStatus: string | null;
  channel?: string;
  orderId?: string | null;
  invoiceId?: string | null;
};

/** IVA de bienes de inversión interiores en el trimestre de compra → 30/31. */
type AssetVatRow = {
  id?: string;
  purchaseDate: Date | null;
  base: unknown;
  vatAmount: unknown;
  vatOperationType?: string | null;
  description?: string | null;
  vatDeductiblePct?: number | null;
};

function parseFilingBoxesLocal(
  raw: unknown
): { code: string; value: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      code: String(o.code ?? "").trim(),
      value: Number(o.value) || 0,
    };
  });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function quarterRange(
  year: number,
  quarter: FiscalQuarter
): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1, 0, 0, 0, 0);
  const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  return { from, to };
}

export function yearRange(year: number): { from: Date; to: Date } {
  const from = startOfYear(new Date(year, 0, 1));
  const to = endOfYear(new Date(year, 0, 1));
  return { from, to };
}

export function currentFiscalPeriod(now = new Date()): {
  year: number;
  quarter: FiscalQuarter;
} {
  const m = now.getMonth(); // 0–11
  const y = now.getFullYear();
  // En mes de plazo (ene/abr/jul/oct) hasta día 20: trimestre que vence.
  // Fuera de esa ventana: trimestre civil en curso (para ir preparando).
  if (m === 0 && now.getDate() <= 20) return { year: y - 1, quarter: 4 };
  if (m === 3 && now.getDate() <= 20) return { year: y, quarter: 1 };
  if (m === 6 && now.getDate() <= 20) return { year: y, quarter: 2 };
  if (m === 9 && now.getDate() <= 20) return { year: y, quarter: 3 };

  if (m <= 2) return { year: y, quarter: 1 };
  if (m <= 5) return { year: y, quarter: 2 };
  if (m <= 8) return { year: y, quarter: 3 };
  return { year: y, quarter: 4 };
}

export function parseFiscalPeriod(sp: {
  year?: string;
  q?: string;
}): { year: number; quarter: FiscalQuarter } {
  const now = currentFiscalPeriod();
  const year = parseInt(sp.year ?? "", 10);
  const q = parseInt(sp.q ?? "", 10);
  return {
    year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : now.year,
    quarter:
      q === 1 || q === 2 || q === 3 || q === 4 ? (q as FiscalQuarter) : now.quarter,
  };
}

export function parseFiscalYear(sp: { year?: string }): number {
  const nowY = new Date().getFullYear();
  const year = parseInt(sp.year ?? "", 10);
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : nowY;
}

export const EXPENSE_CATEGORIES = [
  { id: "SUMINISTROS", label: "Suministros" },
  { id: "SOFTWARE", label: "Software / SaaS" },
  { id: "MATERIAL", label: "Material" },
  { id: "DIETAS", label: "Dietas / desplazamiento" },
  { id: "PROFESIONALES", label: "Servicios profesionales" },
  { id: "OTROS", label: "Otros" },
] as const;

/** Tipo de IVA en gastos (compras). */
export const EXPENSE_VAT_OPERATION_TYPES = [
  { value: "INTERIOR", label: "Compra interior (España)" },
  {
    value: "INTRACOMUNITARIA",
    label: "Adquisición intracomunitaria de bienes (AIB)",
  },
  {
    value: "SERVICIO_INTRACOMUNITARIO",
    label: "Servicio intracomunitario UE (inversión sujeto pasivo)",
  },
  {
    value: "SERVICIO_EXTRACOMUNITARIO",
    label: "Servicio extracom. (EEUU, factura 0 % IVA)",
  },
  {
    value: "IMPORTACION_BIENES",
    label: "Importación de bienes (requiere DUA — no calculado)",
  },
] as const;

export type ExpenseVatOperationType =
  (typeof EXPENSE_VAT_OPERATION_TYPES)[number]["value"];

export function parseExpenseVatOperationType(
  raw: unknown
): ExpenseVatOperationType {
  const kind = parsePurchaseVatKind(raw);
  const legacy = {
    DOMESTIC: "INTERIOR",
    EU_GOODS: "INTRACOMUNITARIA",
    EU_SERVICES: "SERVICIO_INTRACOMUNITARIO",
    NON_EU_SERVICES: "SERVICIO_EXTRACOMUNITARIO",
    IMPORT_GOODS: "IMPORTACION_BIENES",
  } as const;
  const v = legacy[kind];
  if (
    EXPENSE_VAT_OPERATION_TYPES.some((t) => t.value === v)
  ) {
    return v as ExpenseVatOperationType;
  }
  return "INTERIOR";
}

export function isExpenseIntracom(op: string | null | undefined): boolean {
  return parsePurchaseVatKind(op) === "EU_GOODS";
}

export function isExpenseEuService(op: string | null | undefined): boolean {
  return parsePurchaseVatKind(op) === "EU_SERVICES";
}

export function isExpenseImportService(op: string | null | undefined): boolean {
  return parsePurchaseVatKind(op) === "NON_EU_SERVICES";
}

export function isExpenseImportGoods(op: string | null | undefined): boolean {
  return parsePurchaseVatKind(op) === "IMPORT_GOODS";
}

/** Compras con inversión del sujeto pasivo (UE bienes/servicios o terceros países). */
export function isExpenseReverseCharge(op: string | null | undefined): boolean {
  return isPurchaseRc(parsePurchaseVatKind(op));
}

function model303ToModeloBoxes(
  result: ReturnType<typeof aggregateModel303Period>["modelo303"]
): ModeloBoxes {
  const legacy = model303ResultToLegacyBoxes(result);
  return {
    boxes: legacy.boxes,
    result: legacy.result,
    carryForward: legacy.carryForward,
    warnings: legacy.warnings,
    trace303: legacy.trace,
    outcome303: legacy.outcome,
    scopeNote: legacy.scopeNote,
    currentPeriodNegative: result.currentPeriodNegative,
    priorCompensationPending: result.priorCompensationPending,
  };
}

/**
 * Cadena trimestral del 303: casilla 110 arrastra saldos a compensar.
 * Si hay 303 presentado del trimestre, el arrastre al siguiente usa ese
 * saldo (casilla 87 + resultado negativo), no el borrador.
 */
function buildModelo303Chain(
  year: number,
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  marketplace: MarketplaceRow[],
  priorYearCompensation = 0,
  presentedCarryByQuarter: Partial<Record<FiscalQuarter, number>> = {},
  assets: AssetVatRow[] = []
): Record<FiscalQuarter, ModeloBoxes> {
  const chain = buildModel303ChainFromRows({
    year,
    invoices,
    expenses,
    marketplace,
    assets,
    priorYearCompensation,
    presentedCarryByQuarter,
    quarterRange,
  });
  const out = {} as Record<FiscalQuarter, ModeloBoxes>;
  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    out[q] = model303ToModeloBoxes(chain[q]);
  }
  return out;
}

/**
 * Borrador orientativo Modelo 390 — eliminado.
 * @deprecated Usar `buildModel390Result` + `buildModelo390LegacyAdapter`.
 */

function buildModelo130Placeholder(
  incomeBase: number,
  expenseBase: number,
  irpfWithheld: number
): ModeloBoxes {
  const rendimiento = round2(incomeBase - expenseBase);
  const pago20 = round2(Math.max(0, rendimiento) * 0.2);
  const retenciones = round2(Math.max(0, irpfWithheld));
  const resultado130 = round2(pago20 - retenciones);
  return {
    boxes: [
      { code: "01", label: "Ingresos computables", value: incomeBase },
      { code: "02", label: "Gastos deducibles", value: expenseBase },
      { code: "03", label: "Rendimiento neto", value: rendimiento },
      { code: "04", label: "20 % rendimiento positivo", value: pago20 },
      { code: "06", label: "Retenciones", value: retenciones },
      { code: "19", label: "Resultado (orientativo)", value: resultado130 },
    ],
    result: resultado130,
  };
}

async function fetchModel130Config(): Promise<Model130Config> {
  const s = await prisma.companySettings.findFirst({
    select: {
      irpfDirectEstimationMode: true,
      previousYearNetIncomeFor130Reduction: true,
      previousYearNetIncome130Mode: true,
      irpf130HousingDeduction: true,
      agriculturalActivities130: true,
      irregularIncome130Status: true,
      fiscalRegime: true,
      activityKind130: true,
      priorYearWithholdingPct130: true,
    },
  });
  const activityRaw = String(s?.activityKind130 ?? "UNKNOWN").toUpperCase();
  const activityKind130 =
    activityRaw === "PROFESSIONAL"
      ? "PROFESSIONAL"
      : activityRaw === "BUSINESS"
        ? "BUSINESS"
        : "UNKNOWN";

  return {
    irpfDirectEstimationMode: parseIrpfDirectEstimationMode(
      s?.irpfDirectEstimationMode
    ),
    previousYearNetIncomeMode: parsePreviousYearNetIncome130Mode(
      s?.previousYearNetIncome130Mode
    ),
    previousYearNetIncomeFor130Reduction:
      s?.previousYearNetIncomeFor130Reduction != null
        ? Number(s.previousYearNetIncomeFor130Reduction)
        : null,
    irpf130HousingDeduction: parseIrpf130HousingDeduction(
      s?.irpf130HousingDeduction
    ),
    agriculturalActivities130: parseAgriculturalActivities130(
      s?.agriculturalActivities130
    ),
    irregularIncome130Status: parseIrregularIncome130Status(
      s?.irregularIncome130Status
    ),
    fiscalRegime: s?.fiscalRegime === "131" ? "131" : "130",
    activityKind130,
    priorYearWithholdingPct130:
      s?.priorYearWithholdingPct130 != null
        ? Number(s.priorYearWithholdingPct130)
        : null,
    hasCashAccountingInvoices: false,
  };
}

async function fetchPresented130Quarters(
  year: number
): Promise<Partial<Record<FiscalQuarter, PresentedQuarter130>>> {
  const rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "130", year, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const out: Partial<Record<FiscalQuarter, PresentedQuarter130>> = {};
  for (const r of rows) {
    if (r.quarter === 1 || r.quarter === 2 || r.quarter === 3 || r.quarter === 4) {
      const boxes = parseFilingBoxesLocal(r.boxes).map((b) => ({
        code: b.code,
        value: b.value,
      }));
      out[r.quarter as FiscalQuarter] = presentedQuarterFromFiling({
        quarter: r.quarter as FiscalQuarter,
        result: Number(r.result),
        boxes,
      });
    }
  }
  return out;
}

function buildModelo130ChainFromData(
  year: number,
  config: Model130Config,
  invoices: Model130DataInvoice[],
  expenses: Model130DataExpense[],
  marketplace: Model130DataMarketplace[],
  amortRows: Model130AmortRow[],
  presented: Partial<Record<FiscalQuarter, PresentedQuarter130>>
): Record<FiscalQuarter, ModeloBoxes> {
  const chain = assembleModel130Chain({
    year,
    config,
    invoices,
    expenses,
    marketplace,
    amortRows,
    presented,
  });
  const out = {} as Record<FiscalQuarter, ModeloBoxes>;
  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    out[q] = model130ResultToModeloBoxes(chain[q], config);
  }
  return out;
}

type Model130DataInvoice = InvoiceRow;
type Model130DataExpense = ExpenseRow;
type Model130DataMarketplace = MarketplaceRow;

type Model130AmortRow = AmortizationPeriodInput & {
  assetId?: string;
  label?: string;
};

function aggregateRows(
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  marketplace: MarketplaceRow[],
  from: Date,
  to: Date,
  priorCompensation303 = 0,
  assets: AssetVatRow[] = [],
  priorCompensationProvisional = false
): {
  issued: FiscalPeriodSummary["issued"];
  expenses: FiscalPeriodSummary["expenses"];
  modelo303: ModeloBoxes;
  modelo130: ModeloBoxes;
} {
  const agg = aggregateModel303Period({
    invoices,
    expenses,
    marketplace,
    assets,
    from,
    to,
    priorCompensation: priorCompensation303,
    priorCompensationProvisional,
  });

  return {
    issued: agg.issued,
    expenses: agg.expenses,
    modelo303: model303ToModeloBoxes(agg.modelo303),
    modelo130: buildModelo130Placeholder(
      agg.issued.incomeBase,
      agg.expenses.base,
      agg.issued.irpfWithheld
    ),
  };
}

const invoiceSelect = {
  id: true,
  fullNumber: true,
  issueDate: true,
  subtotal: true,
  vatAmount: true,
  irpfAmount: true,
  status: true,
  fiscalStatus: true,
  cashAccounting: true,
  vatOperationType: true,
  invoiceFiscalType: true,
  rectificationType: true,
  rectifiesInvoiceId: true,
  rectifiesInvoice: { select: { fullNumber: true } },
  lines: {
    select: {
      vatRate: true,
      lineSubtotal: true,
      lineVat: true,
    },
  },
} as const;

async function fetchFiscalRows(from: Date, to: Date) {
  const [invoices, expenses, marketplace, assets] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: from, lte: to },
      },
      select: invoiceSelect,
    }),
    prisma.expense.findMany({
      where: {
        issueDate: { gte: from, lte: to },
      },
      select: EXPENSE_FISCAL_SELECT,
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
      select: {
        id: true,
        issueDate: true,
        subtotal: true,
        vatAmount: true,
        vatRate: true,
        vatStatus: true,
        channel: true,
        orderId: true,
        invoiceId: true,
      },
    }),
    prisma.investmentAsset.findMany({
      where: {
        purchaseDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        description: true,
        purchaseDate: true,
        base: true,
        vatAmount: true,
        vatOperationType: true,
        expense: {
          select: { vatDeductiblePct: true },
        },
      },
    }),
  ]);
  return {
    invoices: invoices.map((inv) => {
      const row = inv as InvoiceRow & {
        rectifiesInvoice?: { fullNumber: string } | null;
      };
      return {
        ...row,
        rectifiesInvoiceFullNumber: row.rectifiesInvoice?.fullNumber ?? null,
      };
    }),
    expenses: expenses as ExpenseRow[],
    marketplace: marketplace as MarketplaceRow[],
    assets: assets.map((a) => ({
      id: a.id,
      description: a.description,
      purchaseDate: a.purchaseDate,
      base: a.base,
      vatAmount: a.vatAmount,
      vatOperationType: a.vatOperationType,
      vatDeductiblePct: a.expense?.vatDeductiblePct ?? null,
    })) as AssetVatRow[],
  };
}

async function fetchYearAmortizationRows(
  year: number
): Promise<Model130AmortRow[]> {
  const rows = await prisma.investmentAmortization.findMany({
    where: { year },
    select: {
      amount: true,
      asset: {
        select: {
          id: true,
          description: true,
          purchaseDate: true,
          startYear: true,
          usefulLifeYears: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    yearAmount: Number(r.amount),
    purchaseDate: r.asset.purchaseDate,
    startYear: r.asset.startYear,
    usefulLifeYears: r.asset.usefulLifeYears,
    assetId: r.asset.id,
    label: r.asset.description?.trim() || `Bien ${r.asset.id.slice(0, 8)}`,
  }));
}

/** Carry-forward (casilla 87 + resultado a compensar) de 303 presentados del año. */
async function fetchPresented303Carries(
  year: number
): Promise<Partial<Record<FiscalQuarter, number>>> {
  const rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "303", year, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const out: Partial<Record<FiscalQuarter, number>> = {};
  for (const r of rows) {
    if (r.quarter === 1 || r.quarter === 2 || r.quarter === 3 || r.quarter === 4) {
      out[r.quarter as FiscalQuarter] = presented303CarryToPriorCompensation(
        carryFromPresented303(r)
      );
    }
  }
  return out;
}

/** Agrega facturas emitidas + gastos del trimestre para libros y borradores 303/130. */
export async function buildFiscalPeriodSummary(
  year: number,
  quarter: FiscalQuarter
): Promise<FiscalPeriodSummary> {
  const { from, to } = quarterRange(year, quarter);
  const label = `${quarter}T ${year}`;
  // 303 = solo el trimestre; 130 = YTD desde 1 ene (necesita filas de todo el año hasta fin T)
  const yearStart = yearRange(year).from;
  const [
    { invoices, expenses, marketplace, assets },
    priorYearCompensation,
    amortRows,
    presented130,
    presented303,
    model130Config,
  ] = await Promise.all([
    fetchFiscalRows(yearStart, to),
    getPriorYear303Compensation(year),
    fetchYearAmortizationRows(year),
    fetchPresented130Quarters(year),
    fetchPresented303Carries(year),
    fetchModel130Config(),
  ]);
  const quarterAgg = aggregateRows(
    invoices,
    expenses,
    marketplace,
    from,
    to,
    0,
    assets
  );
  const chain130 = buildModelo130ChainFromData(
    year,
    model130Config,
    invoices,
    expenses,
    marketplace,
    amortRows,
    presented130
  );
  const chain303 = buildModelo303Chain(
    year,
    invoices,
    expenses,
    marketplace,
    priorYearCompensation,
    presented303,
    assets
  );

  const modelo130 = chain130[quarter];

  return {
    year,
    quarter,
    from,
    to,
    label,
    issued: quarterAgg.issued,
    expenses: quarterAgg.expenses,
    modelo303: chain303[quarter],
    modelo130,
  };
}

/**
 * Resumen fiscal del año completo: 3 queries + agregación en memoria
 * (anual + desglose por trimestre).
 */
export async function buildFiscalYearSummary(
  year: number
): Promise<FiscalYearSummary> {
  const { from, to } = yearRange(year);
  const [
    { invoices, expenses, marketplace, assets },
    priorYearCompensation,
    amortRows,
    presented130,
    presented303,
    model130Config,
  ] = await Promise.all([
    fetchFiscalRows(from, to),
    getPriorYear303Compensation(year),
    fetchYearAmortizationRows(year),
    fetchPresented130Quarters(year),
    fetchPresented303Carries(year),
    fetchModel130Config(),
  ]);
  const yearAgg = aggregateRows(
    invoices,
    expenses,
    marketplace,
    from,
    to,
    0,
    assets
  );
  const chain130 = buildModelo130ChainFromData(
    year,
    model130Config,
    invoices,
    expenses,
    marketplace,
    amortRows,
    presented130
  );
  const chain303 = buildModelo303Chain(
    year,
    invoices,
    expenses,
    marketplace,
    priorYearCompensation,
    presented303,
    assets
  );

  const quarters: FiscalQuarterSlice[] = ([1, 2, 3, 4] as FiscalQuarter[]).map(
    (q) => {
      const range = quarterRange(year, q);
      const agg = aggregateRows(
        invoices,
        expenses,
        marketplace,
        range.from,
        range.to,
        0,
        assets
      );
      const amortYtd = sumAmortizationYtd(amortRows, year, q);
      return {
        quarter: q,
        label: `${q}T ${year}`,
        incomeBase: agg.issued.incomeBase,
        expensesBase: round2(agg.expenses.base + amortYtd),
        irpfWithheld: agg.issued.irpfWithheld,
        modelo303Result: chain303[q].result,
        modelo130Result: chain130[q].result,
      };
    }
  );

  const ivaNetYear = round2(
    quarters.reduce((s, q) => s + q.modelo303Result, 0)
  );
  // Suma de lo a ingresar por trimestre (solo positivos, coherente con casilla 05)
  const irpfPaymentsYear = round2(
    ([1, 2, 3, 4] as FiscalQuarter[]).reduce(
      (s, q) => s + Math.max(0, chain130[q].result),
      0
    )
  );

  const model390Result = await buildModel390Result(year);

  return {
    year,
    from,
    to,
    label: `Año ${year}`,
    issued: yearAgg.issued,
    expenses: yearAgg.expenses,
    // Agregado anual sin cadena de compensación (eso es por trimestre)
    modelo303: yearAgg.modelo303,
    modelo130: chain130[4],
    modelo390: buildModelo390LegacyAdapter(model390Result),
    ivaNetYear,
    irpfPaymentsYear,
    quarters,
    chain303,
    chain130,
  };
}

/**
 * Cadenas trimestrales 303/130 para auditoría cruzada (sin resumen anual completo).
 */
export async function buildFiscalMotorChains(year: number): Promise<{
  chain303: Record<FiscalQuarter, ModeloBoxes>;
  chain130: Record<FiscalQuarter, ModeloBoxes>;
}> {
  const { from, to } = yearRange(year);
  const [
    { invoices, expenses, marketplace, assets },
    priorYearCompensation,
    amortRows,
    presented130,
    presented303,
    model130Config,
  ] = await Promise.all([
    fetchFiscalRows(from, to),
    getPriorYear303Compensation(year),
    fetchYearAmortizationRows(year),
    fetchPresented130Quarters(year),
    fetchPresented303Carries(year),
    fetchModel130Config(),
  ]);
  const chain130 = buildModelo130ChainFromData(
    year,
    model130Config,
    invoices,
    expenses,
    marketplace,
    amortRows,
    presented130
  );
  const chain303 = buildModelo303Chain(
    year,
    invoices,
    expenses,
    marketplace,
    priorYearCompensation,
    presented303,
    assets
  );
  return { chain303, chain130 };
}

/**
 * Semilla de casilla 110 al empezar el año: arrastre del 4T anterior
 * (casilla 87 + resultado a compensar del presentado, o cadena borrador).
 */
async function getPriorYear303Compensation(year: number): Promise<number> {
  const prev = year - 1;
  const presented = await prisma.fiscalFiling.findUnique({
    where: {
      periodKey: fiscalFilingPeriodKey("303", prev, 4),
    },
    select: { result: true, boxes: true },
  });
  if (presented) {
    return presented303CarryToPriorCompensation(carryFromPresented303(presented));
  }
  // Sin 4T presentado: calcula cadena 303 del año anterior (sin recursión de compensación)
  const { to } = yearRange(prev);
  const yearStart = yearRange(prev).from;
  const { invoices, expenses, marketplace, assets } = await fetchFiscalRows(
    yearStart,
    to
  );
  const chain = buildModelo303Chain(
    prev,
    invoices,
    expenses,
    marketplace,
    0,
    {},
    assets
  );
  const last = chain[4];
  return round2(last.carryForward ?? 0);
}
