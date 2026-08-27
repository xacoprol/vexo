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
  /**
   * Primera huella/registro Veri*Factu observada en el tenant
   * (min Invoice.verifactuRecordAt). Null si nunca se selló.
   */
  verifactuActivationAt: Date | null;
  settings: {
    nif: string | null;
    fiscalRegime: string;
    verifactuMode: string;
    simplifiedInvoiceMaxAmount: number;
    paysProfessionalsSubjectToWithholding: string;
    censusModel111: string;
    model111Periodicity: string;
    censusModel130: string;
    censusModel303: string;
    censusModel115: string;
    model115Periodicity: string;
    censusModel180: string;
    censusModel190: string;
    censusModel349: string;
    censusModel347: string;
    censusModel390: string;
    hasEmployees: string;
    rentsBusinessPremises: string;
    businessRentSubjectToWithholding: string;
    activityKind130: string;
    priorYearWithholdingPct130: number | null;
    activityStartYear: number | null;
    vatPeriodicity: string;
    vatUsesSii: string;
    vatTerritory: string;
    vatActivity390Scope: string;
    lastVatPeriodFilingRequired: string;
    censusSource: string;
    censusLastUpdatedAt: Date | null;
  } | null;
  periodSummary: FiscalPeriodSummary | null;
  draft349: Model349Result | null;
  /** Annual: operaciones 349 de todo el ejercicio para cruce 347↔349 */
  draft349Year: Model349Result[];
  presented303: PresentedFilingView | null;
  presented130: PresentedFilingView | null;
  presented349: PresentedFilingView | null;
  presented111: PresentedFilingView | null;
  presented115: PresentedFilingView | null;
  presented180: PresentedFilingView | null;
  presented190: PresentedFilingView | null;
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
  practicedWithholdingsYear: PracticedWithholdingHealthRow[];
  /** Locales arrendados activos (Fase 9.3). */
  leasesActive: LeaseHealthRow[];
  invoices: InvoiceHealthRow[];
  expenses: ExpenseHealthRow[];
  marketplace: MarketplaceHealthRow[];
  verifactu: VerifactuAuditReport;
  filingsYear: Awaited<ReturnType<typeof listPresentedForYear>>;
};

export type LeaseHealthRow = {
  id: string;
  propertyAddress: string;
  cadastralReference: string | null;
  active: boolean;
  activityUse: string;
  withholdingStatus: string;
  withholdingExemptionReason: string | null;
  defaultWithholdingRate: number | null;
  landlordName: string;
  landlordTaxId: string;
  counterpartyId: string;
  requiresReview: boolean;
};

export type PracticedWithholdingHealthRow = {
  id: string;
  direction: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  status: string;
  baseAmount: unknown;
  rate: number;
  withholdingAmount: unknown;
  accrualDate: Date;
  paymentDate: Date | null;
  year: number;
  quarter: number;
  perceptionKey: string | null;
  perceptionSubKey: string | null;
  counterpartyTaxId: string | null;
  counterpartyName: string | null;
};

export type InvoiceHealthRow = {
  id: string;
  fullNumber: string;
  issueDate: Date;
  createdAt: Date;
  fiscalStatus: string;
  status: string;
  verifactuHash: string | null;
  verifactuRecordAt: Date | null;
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
  supplierNif: string | null;
  category: string;
  vatOperationType: string;
  subtotal: unknown;
  vatAmount: unknown;
  total: unknown;
  vatDeductiblePct: number;
  irpfDeductiblePct: number;
  isInvestment: boolean;
  practicedWithholdingStatus: string;
  leaseId: string | null;
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

  const [settings, invoices, expenses, marketplace, withholdings, leases, verifactu, filingsYear] =
    await Promise.all([
      countQuery(
        prisma.companySettings.findFirst({
          select: {
            nif: true,
            fiscalRegime: true,
            verifactuMode: true,
            simplifiedInvoiceMaxAmount: true,
            paysProfessionalsSubjectToWithholding: true,
            censusModel111: true,
            model111Periodicity: true,
            censusModel130: true,
            censusModel303: true,
            censusModel115: true,
            model115Periodicity: true,
            censusModel180: true,
            censusModel190: true,
            censusModel349: true,
            censusModel347: true,
            censusModel390: true,
            hasEmployees: true,
            rentsBusinessPremises: true,
            businessRentSubjectToWithholding: true,
            activityKind130: true,
            priorYearWithholdingPct130: true,
            activityStartYear: true,
            vatPeriodicity: true,
            vatUsesSii: true,
            vatTerritory: true,
            vatActivity390Scope: true,
            lastVatPeriodFilingRequired: true,
            censusSource: true,
            censusLastUpdatedAt: true,
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
            verifactuRecordAt: true,
            createdAt: true,
            invoiceKind: true,
            invoiceFiscalType: true,
            rectificationType: true,
            rectificationMethod: true,
            rectifiesInvoiceId: true,
            seriesId: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            client: { select: { nif: true, name: true } },
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
            supplierNif: true,
            category: true,
            vatOperationType: true,
            subtotal: true,
            vatAmount: true,
            total: true,
            vatDeductiblePct: true,
            irpfDeductiblePct: true,
            isInvestment: true,
            practicedWithholdingStatus: true,
            leaseId: true,
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
      countQuery(
        prisma.fiscalWithholding.findMany({
          where: { year: opts.year },
          select: {
            id: true,
            direction: true,
            kind: true,
            sourceType: true,
            sourceId: true,
            status: true,
            baseAmount: true,
            rate: true,
            withholdingAmount: true,
            accrualDate: true,
            paymentDate: true,
            year: true,
            quarter: true,
            perceptionKey: true,
            perceptionSubKey: true,
            counterparty: {
              select: { taxId: true, name: true },
            },
          },
        })
      ),
      countQuery(
        prisma.businessPremisesLease.findMany({
          where: { active: true },
          select: {
            id: true,
            propertyAddress: true,
            cadastralReference: true,
            active: true,
            activityUse: true,
            withholdingStatus: true,
            withholdingExemptionReason: true,
            defaultWithholdingRate: true,
            counterpartyId: true,
            counterparty: {
              select: { name: true, taxId: true, requiresReview: true },
            },
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
    createdAt: i.createdAt,
    fiscalStatus: i.fiscalStatus,
    status: i.status,
    verifactuHash: i.verifactuHash,
    verifactuRecordAt: i.verifactuRecordAt,
    invoiceKind: i.invoiceKind,
    invoiceFiscalType: i.invoiceFiscalType,
    rectificationType: i.rectificationType,
    rectificationMethod: i.rectificationMethod,
    rectifiesInvoiceId: i.rectifiesInvoiceId,
    seriesId: i.seriesId,
    subtotal: i.subtotal,
    vatAmount: i.vatAmount,
    total: i.total,
    clientNif: i.client.nif || null,
    clientName: i.client.name || null,
    irpfAmount: i.irpfAmount,
    vatOperationType: i.vatOperationType,
    lineCount: i._count.lines,
  }));

  const invoiceRowsYear = invoiceRows;
  const expenseRowsYear: ExpenseHealthRow[] = expenses.map((e) => ({
    id: e.id,
    issueDate: e.issueDate,
    supplierName: e.supplierName,
    supplierNif: e.supplierNif,
    category: e.category,
    vatOperationType: e.vatOperationType,
    subtotal: e.subtotal,
    vatAmount: e.vatAmount,
    total: e.total,
    vatDeductiblePct: e.vatDeductiblePct,
    irpfDeductiblePct: e.irpfDeductiblePct,
    isInvestment: e.isInvestment,
    practicedWithholdingStatus: e.practicedWithholdingStatus,
    leaseId: e.leaseId ?? null,
    documentId: e.documentId,
    importDuaBase: e.importDuaBase,
    importDuaVat: e.importDuaVat,
    importDuaNumber: e.importDuaNumber,
    importDuaDate: e.importDuaDate,
    importDuaDocumentId: e.importDuaDocumentId,
    invoiceNumber: e.invoiceNumber,
  }));
  const marketplaceRowsYear = marketplace as MarketplaceHealthRow[];
  const practicedWithholdingsYear: PracticedWithholdingHealthRow[] =
    withholdings.map((w) => ({
      id: w.id,
      direction: w.direction,
      kind: w.kind,
      sourceType: w.sourceType,
      sourceId: w.sourceId,
      status: w.status,
      baseAmount: w.baseAmount,
      rate: w.rate,
      withholdingAmount: w.withholdingAmount,
      accrualDate: w.accrualDate,
      paymentDate: w.paymentDate ?? null,
      year: w.year,
      quarter: w.quarter,
      perceptionKey: w.perceptionKey ?? null,
      perceptionSubKey: w.perceptionSubKey ?? null,
      counterpartyTaxId: w.counterparty.taxId,
      counterpartyName: w.counterparty.name,
    }));

  const leasesActive: LeaseHealthRow[] = leases.map((l) => ({
    id: l.id,
    propertyAddress: l.propertyAddress,
    cadastralReference: l.cadastralReference ?? null,
    active: l.active,
    activityUse: l.activityUse,
    withholdingStatus: l.withholdingStatus,
    withholdingExemptionReason: l.withholdingExemptionReason,
    defaultWithholdingRate: l.defaultWithholdingRate,
    landlordName: l.counterparty.name,
    landlordTaxId: l.counterparty.taxId,
    counterpartyId: l.counterpartyId,
    requiresReview: l.counterparty.requiresReview,
  }));

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
  let presented111: PresentedFilingView | null = null;
  let presented115: PresentedFilingView | null = null;
  let presented180: PresentedFilingView | null = null;
  let presented190: PresentedFilingView | null = null;

  if (mode === "quarter" && quarter != null) {
    let motorChains: Awaited<ReturnType<typeof buildFiscalMotorChains>>;
    [
      periodSummary,
      draft349,
      presented303,
      presented130,
      presented349,
      presented111,
      presented115,
      draft349All,
      motorChains,
    ] = await Promise.all([
        countQuery(buildFiscalPeriodSummary(opts.year, quarter)),
        countQuery(buildModelo349Draft(opts.year, quarter)),
        countQuery(getPresentedFiling("303", opts.year, quarter)),
        countQuery(getPresentedFiling("130", opts.year, quarter)),
        countQuery(getPresentedFiling("349", opts.year, quarter)),
        countQuery(getPresentedFiling("111", opts.year, quarter)),
        countQuery(getPresentedFiling("115", opts.year, quarter)),
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
    [model390, draft347, presented347, presented390, yearSummary, draft349Year, presented180, presented190] =
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
        countQuery(getPresentedFiling("180", opts.year, null)),
        countQuery(getPresentedFiling("190", opts.year, null)),
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
    verifactuActivationAt: (() => {
      const times = invoiceRowsYear
        .map((i) => i.verifactuRecordAt)
        .filter((d): d is Date => d != null)
        .map((d) => d.getTime());
      if (!times.length) return null;
      return new Date(Math.min(...times));
    })(),
    settings: settings
      ? {
          nif: settings.nif,
          fiscalRegime: settings.fiscalRegime,
          verifactuMode: settings.verifactuMode,
          simplifiedInvoiceMaxAmount: Number(settings.simplifiedInvoiceMaxAmount),
          paysProfessionalsSubjectToWithholding:
            settings.paysProfessionalsSubjectToWithholding ?? "UNKNOWN",
          censusModel111: settings.censusModel111 ?? "UNKNOWN",
          model111Periodicity: settings.model111Periodicity ?? "UNKNOWN",
          censusModel130: settings.censusModel130 ?? "UNKNOWN",
          censusModel303: settings.censusModel303 ?? "UNKNOWN",
          censusModel115: settings.censusModel115 ?? "UNKNOWN",
          model115Periodicity: settings.model115Periodicity ?? "UNKNOWN",
          censusModel180: settings.censusModel180 ?? "UNKNOWN",
          censusModel190: settings.censusModel190 ?? "UNKNOWN",
          censusModel349: settings.censusModel349 ?? "UNKNOWN",
          censusModel347: settings.censusModel347 ?? "UNKNOWN",
          censusModel390: settings.censusModel390 ?? "UNKNOWN",
          hasEmployees: settings.hasEmployees ?? "UNKNOWN",
          rentsBusinessPremises: settings.rentsBusinessPremises ?? "UNKNOWN",
          businessRentSubjectToWithholding:
            settings.businessRentSubjectToWithholding ?? "UNKNOWN",
          activityKind130: settings.activityKind130 ?? "UNKNOWN",
          priorYearWithholdingPct130:
            settings.priorYearWithholdingPct130 != null
              ? Number(settings.priorYearWithholdingPct130)
              : null,
          activityStartYear: settings.activityStartYear ?? null,
          vatPeriodicity: settings.vatPeriodicity ?? "UNKNOWN",
          vatUsesSii: settings.vatUsesSii ?? "UNKNOWN",
          vatTerritory: settings.vatTerritory ?? "UNKNOWN",
          vatActivity390Scope: settings.vatActivity390Scope ?? "UNKNOWN",
          lastVatPeriodFilingRequired:
            settings.lastVatPeriodFilingRequired ?? "UNKNOWN",
          censusSource: settings.censusSource ?? "UNKNOWN",
          censusLastUpdatedAt: settings.censusLastUpdatedAt ?? null,
        }
      : null,
    periodSummary,
    draft349,
    draft349Year,
    presented303,
    presented130,
    presented349,
    presented111,
    presented115,
    presented180,
    presented190,
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
    practicedWithholdingsYear,
    leasesActive,
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
