import { quarterRange, type FiscalQuarter } from "@/lib/fiscal";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { marketplaceIncomeNotInvoicedWhere } from "@/lib/marketplace-invoice";
import {
  aggregate349Period,
  buildMonthlyOutputTotalsForQuarter,
  buildQuarterTotalsMap,
  num,
  type Model349ExpenseRow,
  type Model349InvoiceRow,
  type Model349MarketplaceRow,
} from "@/lib/modelo-349/aggregate";
import { resolve349PrimaryDeadline } from "@/lib/modelo-349/deadlines";
import { resolve349FilingPeriods } from "@/lib/modelo-349/filing-periods";
import {
  priorQuarters,
  quarterPeriodLabel,
  resolve349Periodicity,
} from "@/lib/modelo-349/periodicity";
import {
  build349Rectifications,
  type Presented349Filing,
} from "@/lib/modelo-349/rectifications";
import type { Model349Result } from "@/lib/modelo-349/types";
import { prisma } from "@/lib/prisma";

const invoiceSelect = {
  id: true,
  fullNumber: true,
  issueDate: true,
  subtotal: true,
  vatOperationType: true,
  invoiceFiscalType: true,
  rectifiesInvoiceId: true,
  rectificationMethod: true,
  substitutionCorrectSubtotal: true,
  client: { select: { name: true, nif: true, countryCode: true } },
} as const;

const expenseSelect = {
  id: true,
  issueDate: true,
  subtotal: true,
  vatOperationType: true,
  supplierName: true,
  supplierNif: true,
  description: true,
} as const;

async function load349SourceRows(opts: {
  from: Date;
  to: Date;
  historyFrom: Date;
}): Promise<{
  invoices: Model349InvoiceRow[];
  expenses: Model349ExpenseRow[];
  marketplace: Model349MarketplaceRow[];
  presentedFilings: Presented349Filing[];
}> {
  const [invoices, expenses, marketplace, filings] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: opts.historyFrom, lte: opts.to },
      },
      select: invoiceSelect,
    }),
    prisma.expense.findMany({
      where: { issueDate: { gte: opts.historyFrom, lte: opts.to } },
      select: expenseSelect,
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: opts.from, lte: opts.to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
      select: {
        id: true,
        issueDate: true,
        subtotal: true,
        vatStatus: true,
        shipToCountry: true,
        channel: true,
        orderId: true,
        invoiceId: true,
      },
    }),
    prisma.fiscalFiling.findMany({
      where: { modelType: "349" },
      select: {
        year: true,
        quarter: true,
        boxes: true,
        rawExtract: true,
      },
    }),
  ]);

  return {
    invoices: invoices.map((i) => ({
      ...i,
      subtotal: num(i.subtotal),
      substitutionCorrectSubtotal:
        i.substitutionCorrectSubtotal != null
          ? num(i.substitutionCorrectSubtotal)
          : null,
    })),
    expenses: expenses.map((e) => ({ ...e, subtotal: num(e.subtotal) })),
    marketplace: marketplace.map((m) => ({ ...m, subtotal: num(m.subtotal) })),
    presentedFilings: filings.map((f) => ({
      year: f.year,
      quarter: f.quarter,
      boxes: Array.isArray(f.boxes)
        ? (f.boxes as { code: string; value: number }[])
        : [],
      rawExtract: f.rawExtract,
    })),
  };
}

function historyStart(year: number, quarter: FiscalQuarter): Date {
  const priors = priorQuarters(year, quarter, 4);
  const oldest = priors[priors.length - 1];
  const { from } = quarterRange(oldest.year, oldest.quarter);
  return from;
}

export async function buildModel349Result(
  year: number,
  quarter: FiscalQuarter
): Promise<Model349Result> {
  const { from, to } = quarterRange(year, quarter);
  const historyFrom = historyStart(year, quarter);

  const { invoices, expenses, marketplace, presentedFilings } =
    await load349SourceRows({ from, to, historyFrom });

  const quarterTotals = buildQuarterTotalsMap(invoices, expenses, year, quarter);
  const { periodicity, monthlyRegimeReason, thresholdContext } =
    resolve349Periodicity({
      referenceYear: year,
      referenceQuarter: quarter,
      quarterTotals,
    });

  const monthlyOutputAmounts = buildMonthlyOutputTotalsForQuarter(
    invoices,
    year,
    quarter
  );
  const filingPeriods = resolve349FilingPeriods({
    year,
    quarter,
    periodicity,
    monthlyRegimeReason,
    monthlyOutputAmounts,
  });
  const deadline = resolve349PrimaryDeadline({
    year,
    quarter,
    periodicity,
    filingPeriods,
  });

  const agg = aggregate349Period({
    invoices,
    expenses,
    marketplace,
    year,
    quarter,
  });

  const originalsById = new Map(
    invoices.map((i) => [i.id, i] as const)
  );

  const rectifications = build349Rectifications({
    rectifyingInvoices: invoices.filter(
      (i) => i.invoiceFiscalType === "RECTIFYING"
    ),
    originalsById,
    presentedFilings,
    filingPeriodYear: year,
    filingPeriodQuarter: quarter,
    warnings: agg.warnings,
  });

  const totalOperations = agg.operations.reduce((s, o) => s + o.amount, 0);
  const hasOps = agg.operations.length > 0;
  const incompleteVatId = agg.skippedMissingVatId > 0;

  return {
    year,
    quarter,
    label: quarterPeriodLabel(year, quarter),
    periodicity,
    monthlyRegimeReason,
    thresholdContext,
    filingPeriods,
    deadline,
    operations: agg.operations,
    rectifications,
    warnings: agg.warnings,
    totalsByKey: agg.totalsByKey,
    totalOperations,
    hasOps,
    incompleteVatId,
    needsAttention: hasOps || incompleteVatId || rectifications.length > 0,
    skippedMissingVatId: agg.skippedMissingVatId,
    skippedMissingVatIdEntregas: agg.skippedMissingVatIdEntregas,
    skippedMissingVatIdAdquisiciones: agg.skippedMissingVatIdAdquisiciones,
  };
}

export async function buildModel349Engine(
  year: number,
  quarter: FiscalQuarter
): Promise<Model349Result> {
  return buildModel349Result(year, quarter);
}
