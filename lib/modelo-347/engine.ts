import { yearRange } from "@/lib/fiscal";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { marketplaceIncomeNotInvoicedWhere } from "@/lib/marketplace-invoice";
import {
  aggregate347Year,
  effective347OperatorAmount,
  num,
  type Model347ExpenseRow,
  type Model347InvoiceRow,
  type Model347MarketplaceRow,
} from "@/lib/modelo-347/aggregate";
import { resolve347Deadline } from "@/lib/modelo-347/deadlines";
import type { Model347OriginalInvoiceRef } from "@/lib/modelo-347/rectification";
import { build347ThresholdContext } from "@/lib/modelo-347/threshold";
import type { Model347Result } from "@/lib/modelo-347/types";
import { prisma } from "@/lib/prisma";

const CASH_PAYMENTS_SCOPE =
  "VEXO registra pistas de posible metálico (paymentMethod) separadas del total declarable. " +
  "No acumula percepciones en metálico por operador para el apartado legal específico.";

const RENTALS_SCOPE =
  "VEXO no gestiona el bloque específico de arrendamientos de inmuebles del 347. Los gastos de alquiler corrientes entran como compras (A) si cumplen criterios generales.";

const invoiceSelect = {
  id: true,
  fullNumber: true,
  issueDate: true,
  total: true,
  status: true,
  fiscalStatus: true,
  vatOperationType: true,
  invoiceFiscalType: true,
  rectificationMethod: true,
  rectifiesInvoiceId: true,
  substitutionCorrectSubtotal: true,
  substitutionCorrectVat: true,
  substitutionCorrectTotal: true,
  cashAccounting: true,
  paymentMethod: true,
  operationKey347: true,
  client: {
    select: { id: true, name: true, nif: true, countryCode: true },
  },
  payments: {
    select: { amount: true, paidAt: true, method: true },
    orderBy: { paidAt: "asc" as const },
  },
} as const;

export async function buildModel347Result(year: number): Promise<Model347Result> {
  const { from, to } = yearRange(year);

  const [invoices, expenses, marketplace] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        status: { not: "ANULADA" },
      },
      select: invoiceSelect,
    }),
    prisma.expense.findMany({
      where: { issueDate: { gte: from, lte: to } },
      select: {
        id: true,
        issueDate: true,
        total: true,
        vatOperationType: true,
        supplierName: true,
        supplierNif: true,
      },
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
      select: {
        id: true,
        issueDate: true,
        total: true,
        channel: true,
        shipToCountry: true,
        invoiceId: true,
      },
    }),
  ]);

  const rectifiesIds = [
    ...new Set(
      invoices
        .map((i) => i.rectifiesInvoiceId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const originalsRows =
    rectifiesIds.length > 0
      ? await prisma.invoice.findMany({
          where: { id: { in: rectifiesIds } },
          select: { id: true, total: true },
        })
      : [];

  const originalsById = new Map<string, Model347OriginalInvoiceRef>(
    originalsRows.map((o) => [o.id, { id: o.id, total: num(o.total) }])
  );

  const invRows: Model347InvoiceRow[] = invoices.map((i) => ({
    ...i,
    total: num(i.total),
    substitutionCorrectSubtotal:
      i.substitutionCorrectSubtotal != null
        ? num(i.substitutionCorrectSubtotal)
        : null,
    substitutionCorrectVat:
      i.substitutionCorrectVat != null ? num(i.substitutionCorrectVat) : null,
    substitutionCorrectTotal:
      i.substitutionCorrectTotal != null ? num(i.substitutionCorrectTotal) : null,
    payments: i.payments.map((p) => ({
      amount: num(p.amount),
      paidAt: p.paidAt,
      method: p.method,
    })),
  }));

  const expRows: Model347ExpenseRow[] = expenses.map((e) => ({
    ...e,
    total: num(e.total),
  }));

  const mktRows: Model347MarketplaceRow[] = marketplace.map((m) => ({
    ...m,
    total: num(m.total),
  }));

  const agg = aggregate347Year({
    invoices: invRows,
    expenses: expRows,
    marketplace: mktRows,
    year,
    originalsById,
  });

  const salesTotal = round2(
    agg.declarableOperators
      .filter((o) => o.operationType === "B")
      .reduce((s, o) => s + effective347OperatorAmount(o), 0)
  );
  const purchasesTotal = round2(
    agg.declarableOperators
      .filter((o) => o.operationType === "A")
      .reduce((s, o) => s + effective347OperatorAmount(o), 0)
  );

  return {
    year,
    thresholdContext: build347ThresholdContext(),
    deadline: resolve347Deadline(year),
    operators: agg.operators,
    declarableOperators: agg.declarableOperators,
    excludedOperations: agg.excludedOperations,
    warnings: agg.warnings,
    salesTotal,
    purchasesTotal,
    declarableCount: agg.declarableOperators.length,
    skippedOperatorReview: agg.skippedOperatorReview,
    requiresReview: agg.requiresReview,
    cashPaymentsScopeNote: CASH_PAYMENTS_SCOPE,
    rentalsScopeNote: RENTALS_SCOPE,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function buildModel347Engine(year: number): Promise<Model347Result> {
  return buildModel347Result(year);
}
