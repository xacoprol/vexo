import {
  buildFiscalPeriodSummary,
  buildFiscalMotorChains,
  buildFiscalYearSummary,
  quarterRange,
  yearRange,
  type FiscalPeriodSummary,
  type FiscalQuarter,
  type ModeloBoxes,
} from "@/lib/fiscal";
import { buildModelo347Draft, buildModelo349Draft } from "@/lib/fiscal-347-349";
import { getPresentedFiling, listPresentedForYear } from "@/lib/fiscal-filings";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import { FISCAL_STATUS, isInvoiceIssued } from "@/lib/invoice-fiscal-lifecycle";
import { buildModel390Result } from "@/lib/modelo-390/engine";
import type { Model390Result } from "@/lib/modelo-390/types";
import type { Model347Result } from "@/lib/modelo-347";
import type { Model349Result } from "@/lib/modelo-349";
import { prisma } from "@/lib/prisma";
import { auditVerifactuChain, type VerifactuAuditReport } from "@/lib/verifactu-audit";

export type FiscalHealthContext = {
  year: number;
  quarter: FiscalQuarter | null;
  mode: "quarter" | "annual";
  queryCount: number;
  settings: {
    nif: string | null;
    fiscalRegime: string;
    verifactuMode: string;
    simplifiedInvoiceMaxAmount: number;
  } | null;
  periodSummary: FiscalPeriodSummary | null;
  draft349: Model349Result | null;
  /** Annual: operaciones 349 de todo el ejercicio para cruce 347↔349 */
  draft349Year: Model349Result[];
  presented303: PresentedFilingView | null;
  presented130: PresentedFilingView | null;
  presented349: PresentedFilingView | null;
  model390: Model390Result | null;
  draft347: Model347Result | null;
  presented347: PresentedFilingView | null;
  presented390: PresentedFilingView | null;
  yearSummary: Awaited<ReturnType<typeof buildFiscalYearSummary>> | null;
  /** Cadena 303 trimestral con trazas (año completo). */
  chain303: Record<FiscalQuarter, ModeloBoxes> | null;
  /** Cadena 130 YTD trimestral con trazas. */
  chain130: Record<FiscalQuarter, ModeloBoxes> | null;
  /** 349 de los 4 trimestres para cruce UE. */
  draft349All: Model349Result[];
  /** Facturas del ejercicio completo (YTD / rectificativas). */
  invoicesYear: InvoiceHealthRow[];
  expensesYear: ExpenseHealthRow[];
  marketplaceYear: MarketplaceHealthRow[];
  invoices: InvoiceHealthRow[];
  expenses: ExpenseHealthRow[];
  marketplace: MarketplaceHealthRow[];
  verifactu: VerifactuAuditReport;
  filingsYear: Awaited<ReturnType<typeof listPresentedForYear>>;
};

export type InvoiceHealthRow = {
  id: string;
  fullNumber: string;
  issueDate: Date;
  fiscalStatus: string;
  status: string;
  verifactuHash: string | null;
  invoiceKind: string;
  invoiceFiscalType: string | null;
  rectificationType: string | null;
  rectificationMethod: string | null;
  rectifiesInvoiceId: string | null;
  seriesId: string | null;
  subtotal: unknown;
  vatAmount: unknown;
  total: unknown;
  clientNif: string | null;
  clientName: string | null;
  irpfAmount: unknown;
  vatOperationType: string | null;
  lineCount: number;
};

export type ExpenseHealthRow = {
  id: string;
  issueDate: Date;
  supplierName: string;
  vatOperationType: string;
  subtotal: unknown;
  vatAmount: unknown;
  vatDeductiblePct: number;
  irpfDeductiblePct: number;
  isInvestment: boolean;
  documentId: string | null;
  importDuaBase: unknown;
  importDuaVat: unknown;
  importDuaNumber: string | null;
  importDuaDate: Date | null;
  importDuaDocumentId: string | null;
  invoiceNumber: string | null;
};

export type MarketplaceHealthRow = {
  id: string;
  issueDate: Date;
  channel: string;
  subtotal: unknown;
  vatStatus: string | null;
  invoiceId: string | null;
  orderId: string | null;
};

let queryCounter = 0;

function countQuery<T>(p: Promise<T>): Promise<T> {
  queryCounter++;
  return p;
}

export async function loadFiscalHealthContext(opts: {
  year: number;
  quarter?: FiscalQuarter;
}): Promise<FiscalHealthContext> {
  queryCounter = 0;
  const mode = opts.quarter != null ? "quarter" : "annual";
  const quarter = opts.quarter ?? null;
  const { from: yearFrom, to: yearTo } = yearRange(opts.year);
  const { from, to } =
    quarter != null
      ? quarterRange(opts.year, quarter)
      : { from: yearFrom, to: yearTo };

  const [settings, invoices, expenses, marketplace, verifactu, filingsYear] =
    await Promise.all([
      countQuery(
        prisma.companySettings.findFirst({
          select: {
            nif: true,
            fiscalRegime: true,
            verifactuMode: true,
            simplifiedInvoiceMaxAmount: true,
          },
        })
      ),
      countQuery(
        prisma.invoice.findMany({
          where: { issueDate: { gte: yearFrom, lte: yearTo } },
          select: {
            id: true,
            fullNumber: true,
            issueDate: true,
            fiscalStatus: true,
            status: true,
            verifactuHash: true,
            invoiceKind: true,
            invoiceFiscalType: true,
            rectificationType: true,
            rectificationMethod: true,
            rectifiesInvoiceId: true,
            seriesId: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            clientNif: true,
            clientName: true,
            irpfAmount: true,
            vatOperationType: true,
            _count: { select: { lines: true } },
          },
          orderBy: { issueDate: "asc" },
        })
      ),
      countQuery(
        prisma.expense.findMany({
          where: { issueDate: { gte: yearFrom, lte: yearTo } },
          select: {
            id: true,
            issueDate: true,
            supplierName: true,
            vatOperationType: true,
            subtotal: true,
            vatAmount: true,
            vatDeductiblePct: true,
            irpfDeductiblePct: true,
            isInvestment: true,
            documentId: true,
            importDuaBase: true,
            importDuaVat: true,
            importDuaNumber: true,
            importDuaDate: true,
            importDuaDocumentId: true,
            invoiceNumber: true,
          },
        })
      ),
      countQuery(
        prisma.marketplaceIncome.findMany({
          where: { issueDate: { gte: yearFrom, lte: yearTo } },
          select: {
            id: true,
            issueDate: true,
            channel: true,
            subtotal: true,
            vatStatus: true,
            invoiceId: true,
            orderId: true,
          },
        })
      ),
      auditVerifactuChain(),
      countQuery(listPresentedForYear(opts.year)),
    ]);

  const invoiceRows: InvoiceHealthRow[] = invoices.map((i) => ({
    id: i.id,
    fullNumber: i.fullNumber,
    issueDate: i.issueDate,
    fiscalStatus: i.fiscalStatus,
    status: i.status,
    verifactuHash: i.verifactuHash,
    invoiceKind: i.invoiceKind,
    invoiceFiscalType: i.invoiceFiscalType,
    rectificationType: i.rectificationType,
    rectificationMethod: i.rectificationMethod,
    rectifiesInvoiceId: i.rectifiesInvoiceId,
    seriesId: i.seriesId,
    subtotal: i.subtotal,
    vatAmount: i.vatAmount,
    total: i.total,
    clientNif: i.clientNif,
    clientName: i.clientName,
    irpfAmount: i.irpfAmount,
    vatOperationType: i.vatOperationType,
    lineCount: i._count.lines,
  }));

  const invoiceRowsYear = invoiceRows;
  const expenseRowsYear = expenses as ExpenseHealthRow[];
  const marketplaceRowsYear = marketplace as MarketplaceHealthRow[];

  const invoicesInPeriod = invoiceRowsYear.filter(
    (i) => i.issueDate >= from && i.issueDate <= to
  );
  const expensesInPeriod = expenseRowsYear.filter(
    (e) => e.issueDate >= from && e.issueDate <= to
  );
  const marketplaceInPeriod = marketplaceRowsYear.filter(
    (m) => m.issueDate >= from && m.issueDate <= to
  );

  let periodSummary: FiscalPeriodSummary | null = null;
  let draft349: Model349Result | null = null;
  let draft349Year: Model349Result[] = [];
  let draft349All: Model349Result[] = [];
  let chain303: Record<FiscalQuarter, ModeloBoxes> | null = null;
  let chain130: Record<FiscalQuarter, ModeloBoxes> | null = null;
  let presented303: PresentedFilingView | null = null;
  let presented130: PresentedFilingView | null = null;
  let presented349: PresentedFilingView | null = null;

  if (mode === "quarter" && quarter != null) {
    let motorChains: Awaited<ReturnType<typeof buildFiscalMotorChains>>;
    [periodSummary, draft349, presented303, presented130, presented349, draft349All, motorChains] =
      await Promise.all([
        countQuery(buildFiscalPeriodSummary(opts.year, quarter)),
        countQuery(buildModelo349Draft(opts.year, quarter)),
        countQuery(getPresentedFiling("303", opts.year, quarter)),
        countQuery(getPresentedFiling("130", opts.year, quarter)),
        countQuery(getPresentedFiling("349", opts.year, quarter)),
        countQuery(
          Promise.all(
            ([1, 2, 3, 4] as FiscalQuarter[]).map((q) =>
              buildModelo349Draft(opts.year, q)
            )
          )
        ),
        countQuery(buildFiscalMotorChains(opts.year)),
      ]);
    chain303 = motorChains.chain303;
    chain130 = motorChains.chain130;
  }

  let model390: Model390Result | null = null;
  let draft347: Model347Result | null = null;
  let presented347: PresentedFilingView | null = null;
  let presented390: PresentedFilingView | null = null;
  let yearSummary: Awaited<ReturnType<typeof buildFiscalYearSummary>> | null =
    null;

  if (mode === "annual") {
    [model390, draft347, presented347, presented390, yearSummary, draft349Year] =
      await Promise.all([
        countQuery(buildModel390Result(opts.year)),
        countQuery(buildModelo347Draft(opts.year)),
        countQuery(getPresentedFiling("347", opts.year, null)),
        countQuery(getPresentedFiling("390", opts.year, null)),
        countQuery(buildFiscalYearSummary(opts.year)),
        countQuery(
          Promise.all(
            ([1, 2, 3, 4] as FiscalQuarter[]).map((q) =>
              buildModelo349Draft(opts.year, q)
            )
          )
        ),
      ]);
    chain303 = yearSummary?.chain303 ?? null;
    chain130 = yearSummary?.chain130 ?? null;
    draft349All = draft349Year;
  }

  return {
    year: opts.year,
    quarter,
    mode,
    queryCount: queryCounter,
    settings: settings
      ? {
          nif: settings.nif,
          fiscalRegime: settings.fiscalRegime,
          verifactuMode: settings.verifactuMode,
          simplifiedInvoiceMaxAmount: Number(settings.simplifiedInvoiceMaxAmount),
        }
      : null,
    periodSummary,
    draft349,
    draft349Year,
    presented303,
    presented130,
    presented349,
    model390,
    draft347,
    presented347,
    presented390,
    yearSummary,
    chain303,
    chain130,
    draft349All,
    invoicesYear: invoiceRowsYear,
    expensesYear: expenseRowsYear,
    marketplaceYear: marketplaceRowsYear,
    invoices: invoicesInPeriod,
    expenses: expensesInPeriod,
    marketplace: marketplaceInPeriod,
    verifactu,
    filingsYear,
  };
}

export function isDraftInvoiceId(
  ctx: FiscalHealthContext,
  sourceId: string | undefined
): boolean {
  if (!sourceId) return false;
  const inv = ctx.invoicesYear.find((i) => i.id === sourceId);
  if (!inv) return false;
  return inv.fiscalStatus === FISCAL_STATUS.DRAFT && !inv.verifactuHash;
}
