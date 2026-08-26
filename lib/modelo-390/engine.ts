import { quarterRange, yearRange, type FiscalQuarter } from "@/lib/fiscal";
import { EXPENSE_FISCAL_SELECT } from "@/lib/fiscal-expense-select";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { fiscalFilingPeriodKey } from "@/lib/gemini-fiscal-filing";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { marketplaceIncomeNotInvoicedWhere } from "@/lib/marketplace-invoice";
import {
  buildModel303ChainFromRows,
  type Model303ExpenseRow,
  type Model303InvoiceRow,
  type Model303MarketplaceRow,
  type Model303AssetRow,
} from "@/lib/modelo-303/aggregate";
import {
  carryFromPresented303,
  presented303CarryToPriorCompensation,
} from "@/lib/modelo-303/compensation";
import { buildAnnualFrom303 } from "@/lib/modelo-390/annual-303";
import {
  aggregateModel303PeriodFor390,
  buildAnnualFromOperations,
  quarter303FromResult,
} from "@/lib/modelo-390/annual-operations";
import {
  buildCompensationSummary,
  openingBalanceFromFirstQuarter,
} from "@/lib/modelo-390/compensation";
import { assess390FilingObligation } from "@/lib/modelo-390/obligation";
import {
  parseVatPeriodicity,
  parseVatTerritory,
} from "@/lib/modelo-390/vat-config";
import { buildLastPeriodAnnual303Info } from "@/lib/modelo-303/last-period-annual";
import { reconcileAnnualVat } from "@/lib/modelo-390/reconcile";
import type { Model390Result } from "@/lib/modelo-390/types";
import { prisma } from "@/lib/prisma";

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
    select: { vatRate: true, lineSubtotal: true, lineVat: true },
  },
} as const;

function collectReviewFlags(warnings: { code: string }[]): boolean {
  const reviewCodes = new Set([
    "IMPORT_DOCUMENT_MISSING",
    "VAT_PRORATA_REVIEW_REQUIRED",
    "CASH_ACCOUNTING_NOT_FULLY_SUPPORTED",
    "ANNUAL_IMPORT_DATA_INCOMPLETE",
    "VAT_RECC_ANNUAL_REVIEW_REQUIRED",
    "VAT_PRORATA_ANNUAL_REVIEW_REQUIRED",
  ]);
  return warnings.some((w) => reviewCodes.has(w.code));
}

async function fetch390Rows(from: Date, to: Date) {
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
      where: { issueDate: { gte: from, lte: to } },
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
        transactionType: true,
        shipToCountry: true,
        invoiceId: true,
      },
    }),
    prisma.investmentAsset.findMany({
      where: { purchaseDate: { gte: from, lte: to } },
      select: {
        id: true,
        description: true,
        purchaseDate: true,
        base: true,
        vatAmount: true,
        vatOperationType: true,
        expense: { select: { vatDeductiblePct: true } },
      },
    }),
  ]);

  const invRows: Model303InvoiceRow[] = invoices.map((inv) => ({
    ...inv,
    rectifiesInvoiceFullNumber: inv.rectifiesInvoice?.fullNumber ?? null,
  }));

  const assetRows: Model303AssetRow[] = assets.map((a) => ({
    id: a.id,
    description: a.description,
    purchaseDate: a.purchaseDate,
    base: a.base,
    vatAmount: a.vatAmount,
    vatOperationType: a.vatOperationType,
    vatDeductiblePct: a.expense?.vatDeductiblePct ?? null,
  }));

  return {
    invoices: invRows,
    expenses: expenses as Model303ExpenseRow[],
    marketplace: marketplace as Model303MarketplaceRow[],
    assets: assetRows,
  };
}

async function priorYearCompensation(year: number): Promise<number> {
  const prev = year - 1;
  const presented = await prisma.fiscalFiling.findUnique({
    where: { periodKey: fiscalFilingPeriodKey("303", prev, 4) },
    select: { result: true, boxes: true },
  });
  if (presented) {
    return presented303CarryToPriorCompensation(carryFromPresented303(presented));
  }
  return 0;
}

async function presented303Carries(
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

export async function buildModel390Result(year: number): Promise<Model390Result> {
  const settings = await prisma.companySettings.findFirst({
    select: {
      vatUsesSii: true,
      vatPeriodicity: true,
      vatTerritory: true,
      vatActivity390Scope: true,
      lastVatPeriodFilingRequired: true,
      vat390FilingObligation: true,
      vat390ExemptionReason: true,
    },
  });

  const filingObligation = assess390FilingObligation(settings);

  const { from, to } = yearRange(year);
  const [rows, priorComp, presentedCarries] = await Promise.all([
    fetch390Rows(from, to),
    priorYearCompensation(year),
    presented303Carries(year),
  ]);

  const draftChain = buildModel303ChainFromRows({
    year,
    invoices: rows.invoices,
    expenses: rows.expenses,
    marketplace: rows.marketplace,
    assets: rows.assets,
    priorYearCompensation: priorComp,
    presentedCarryByQuarter: presentedCarries,
    quarterRange,
  });

  const opsQuarterResults = ([1, 2, 3, 4] as FiscalQuarter[]).map((q) => {
    const range = quarterRange(year, q);
    return aggregateModel303PeriodFor390({
      invoices: rows.invoices,
      expenses: rows.expenses,
      marketplace: rows.marketplace,
      assets: rows.assets,
      from: range.from,
      to: range.to,
      priorCompensation: 0,
      priorCompensationProvisional: false,
    });
  });

  const opsQuarterMeta = opsQuarterResults.map((r, i) =>
    quarter303FromResult((i + 1) as FiscalQuarter, r, "DRAFT")
  );

  const annualFromOperations = buildAnnualFromOperations({
    year,
    quarterResults: opsQuarterResults,
    quarterMeta: opsQuarterMeta,
  });

  const presentedByQuarter: Partial<
    Record<FiscalQuarter, Awaited<ReturnType<typeof getPresentedFiling>>>
  > = {};
  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    presentedByQuarter[q] = await getPresentedFiling("303", year, q);
  }

  const annualFrom303 = buildAnnualFrom303({
    draftQuarterResults: draftChain,
    presentedByQuarter: presentedByQuarter as Partial<
      Record<FiscalQuarter, NonNullable<Awaited<ReturnType<typeof getPresentedFiling>>>>
    >,
  });

  const allWarnings = [
    ...annualFromOperations.warnings,
    ...annualFrom303.warnings,
    ...filingObligation.warnings,
  ];

  const mappedWarnings = allWarnings.map((w) => {
    if (w.code === "CASH_ACCOUNTING_NOT_FULLY_SUPPORTED") {
      return {
        ...w,
        code: "VAT_RECC_ANNUAL_REVIEW_REQUIRED",
        message:
          "Operaciones con criterio de caja IVA — VEXO imputa por devengo; revisar resumen anual.",
      };
    }
    if (w.code === "VAT_PRORATA_REVIEW_REQUIRED") {
      return {
        ...w,
        code: "VAT_PRORATA_ANNUAL_REVIEW_REQUIRED",
        message:
          "Actividad mixta sujeta/exenta — puede requerir regularización anual de prorrata.",
      };
    }
    if (w.code === "IMPORT_DOCUMENT_MISSING") {
      return {
        ...w,
        code: "ANNUAL_IMPORT_DATA_INCOMPLETE",
        message: w.message,
      };
    }
    return w;
  });

  const requiresReview =
    collectReviewFlags(mappedWarnings) ||
    mappedWarnings.some((w) => w.code === "PROVISIONAL_303_QUARTER");

  const reconciliation = reconcileAnnualVat({
    operations: annualFromOperations,
    from303: annualFrom303,
    requiresReview: collectReviewFlags(mappedWarnings),
  });

  const compensationSummary = buildCompensationSummary({
    openingBalance: openingBalanceFromFirstQuarter(annualFrom303.quarters ?? []),
    quarters: annualFrom303.quarters ?? [],
  });

  const lastPeriodAnnualInfo = buildLastPeriodAnnual303Info({
    year,
    filingObligation,
    annualFromOperations,
    requiresReview,
    vatPeriodicity: parseVatPeriodicity(settings?.vatPeriodicity) ?? "UNKNOWN",
    vatTerritory: parseVatTerritory(settings?.vatTerritory) ?? "UNKNOWN",
    presentedLast303: presentedByQuarter[4] ?? null,
  });

  return {
    year,
    filingObligation,
    annualFromOperations,
    annualFrom303,
    reconciliation,
    compensationSummary,
    warnings: mappedWarnings,
    requiresReview,
    lastPeriodAnnualInfo,
  };
}
