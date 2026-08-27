/**
 * Cargas I/O pre-filing / EU review (sin "use server").
 */

import { prisma } from "@/lib/prisma";
import { quarterRange, type FiscalQuarter } from "@/lib/fiscal";
import { EXPENSE_FISCAL_SELECT } from "@/lib/fiscal-expense-select";
import { periodKeyClose, type PreFilingReviewRow } from "@/lib/fiscal-close/pre-filing";
import {
  classifyEuPurchaseNature,
  previewEuReclassification,
} from "@/lib/fiscal-close/eu-reclass";

export async function loadLatestPreFilingReview(
  year: number,
  quarter: number
): Promise<PreFilingReviewRow | null> {
  const periodKey = periodKeyClose(year, quarter);
  try {
    const row = await prisma.fiscalPreFilingReview.findFirst({
      where: { periodKey, supersededAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return row as PreFilingReviewRow;
  } catch {
    return null;
  }
}

export async function loadPeriodBookSourceIds(
  year: number,
  quarter: FiscalQuarter
) {
  const { from, to } = quarterRange(year, quarter);
  const [expenses, invoices] = await Promise.all([
    prisma.expense.findMany({
      where: { issueDate: { gte: from, lte: to } },
      select: { id: true },
    }),
    prisma.invoice.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        status: { not: "ANULADA" },
        fiscalStatus: "ISSUED",
      },
      select: { id: true },
    }),
  ]);
  let withholdings: { id: string }[] = [];
  try {
    withholdings = await prisma.fiscalWithholding.findMany({
      where: {
        status: "ACTIVE",
        paymentDate: { gte: from, lte: to },
      },
      select: { id: true },
    });
  } catch {
    withholdings = [];
  }
  return {
    expenses: expenses.map((e) => e.id),
    invoices: invoices.map((i) => i.id),
    withholdings: withholdings.map((w) => w.id),
  };
}

export async function buildEuReviewsForPeriod(
  year: number,
  quarter: FiscalQuarter
) {
  const { from, to } = quarterRange(year, quarter);
  const expenses = await prisma.expense.findMany({
    where: {
      issueDate: { gte: from, lte: to },
      vatOperationType: "INTRACOMUNITARIA",
      category: "SOFTWARE",
    },
    select: {
      id: true,
      issueDate: true,
      subtotal: true,
      vatAmount: true,
      vatRate: true,
      total: true,
      vatOperationType: true,
      vatDeductiblePct: true,
      irpfDeductiblePct: true,
      isInvestment: true,
      supplierName: true,
      category: true,
      description: true,
      supplierNif: true,
      documentId: true,
      notes: true,
    },
  });

  const reclassIds = expenses
    .filter(
      (e) =>
        classifyEuPurchaseNature(e).classification === "CONFIRMED_SERVICE"
    )
    .map((e) => e.id);

  const allPeriod = await prisma.expense.findMany({
    where: { issueDate: { gte: from, lte: to } },
    select: EXPENSE_FISCAL_SELECT,
  });

  const preview =
    reclassIds.length > 0
      ? previewEuReclassification({
          year,
          quarter,
          expenses: allPeriod,
          reclassifyIds: reclassIds,
        })
      : null;

  return expenses.map((e) => {
    const c = classifyEuPurchaseNature(e);
    return {
      expenseId: e.id,
      classification: c.classification,
      currentType: String(e.vatOperationType),
      suggestedType: c.suggestedType,
      reasons: c.reasons,
      impact:
        c.classification === "CONFIRMED_SERVICE" && preview
          ? {
              delta349A: preview.delta.keyA,
              delta349I: preview.delta.keyI,
              delta303Result: preview.delta.box71,
            }
          : undefined,
    };
  });
}
