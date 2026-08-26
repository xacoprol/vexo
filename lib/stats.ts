import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { computeExpenseDeductibility } from "@/lib/expense-deductibility";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { marketplaceIncomeNotInvoicedWhere } from "@/lib/marketplace-invoice";
import { prisma } from "@/lib/prisma";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type StatsMonthPoint = {
  key: string;
  label: string;
  /** Facturas W3D emitidas (total con IVA) */
  invoicesTotal: number;
  /** Base imponible facturas W3D */
  invoicesBase: number;
  /** Cobros registrados (pagos) */
  collected: number;
  amazonBase: number;
  shopifyBase: number;
  marketplaceBase: number;
  /** Ingresos reconocidos = base W3D + marketplace */
  incomeBase: number;
  expensesBase: number;
  /** incomeBase − expensesBase */
  netBase: number;
};

export type StatsSummary = {
  year: number;
  from: Date;
  to: Date;
  /** Periodo completo del año (o YTD) */
  invoicesTotal: number;
  invoicesBase: number;
  collected: number;
  pendingCollect: number;
  pendingCount: number;
  amazonBase: number;
  shopifyBase: number;
  marketplaceBase: number;
  incomeBase: number;
  expensesBase: number;
  /** incomeBase − expensesBase */
  netBase: number;
  months: StatsMonthPoint[];
  topClients: { clientId: string; name: string; total: number }[];
};

/**
 * Agrega estadísticas del año con pocas queries (sin N+1 por mes).
 * Ingresos “reales” de negocio = bases W3D + marketplace; cobrado = pagos.
 */
export async function buildYearStats(year: number): Promise<StatsSummary> {
  const from = startOfYear(new Date(year, 0, 1));
  const to = endOfYear(new Date(year, 0, 1));

  const [invoices, payments, marketplace, expenses, pendingInvoices] =
    await Promise.all([
      prisma.invoice.findMany({
        where: {
          status: { not: "ANULADA" },
          fiscalStatus: FISCAL_STATUS.ISSUED,
          issueDate: { gte: from, lte: to },
        },
        select: {
          issueDate: true,
          total: true,
          subtotal: true,
          clientId: true,
          client: { select: { name: true } },
        },
      }),
      prisma.invoicePayment.findMany({
        where: { paidAt: { gte: from, lte: to } },
        select: { paidAt: true, amount: true },
      }),
      prisma.marketplaceIncome.findMany({
        where: {
          issueDate: { gte: from, lte: to },
          ...marketplaceIncomeNotInvoicedWhere,
        },
        select: {
          issueDate: true,
          channel: true,
          subtotal: true,
        },
      }),
      prisma.expense.findMany({
        where: {
          issueDate: { gte: from, lte: to },
          irpfDeductiblePct: { gt: 0 },
        },
        select: {
          issueDate: true,
          subtotal: true,
          vatAmount: true,
          vatDeductiblePct: true,
          irpfDeductiblePct: true,
          isInvestment: true,
        },
      }),
      prisma.invoice.findMany({
        where: { status: { in: ["PENDIENTE", "VENCIDA"] } },
        select: {
          total: true,
          payments: { select: { amount: true } },
        },
      }),
    ]);

  const monthMap = new Map<string, StatsMonthPoint>();
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1);
    const key = monthKey(d);
    monthMap.set(key, {
      key,
      label: format(d, "MMM", { locale: es }),
      invoicesTotal: 0,
      invoicesBase: 0,
      collected: 0,
      amazonBase: 0,
      shopifyBase: 0,
      marketplaceBase: 0,
      incomeBase: 0,
      expensesBase: 0,
      netBase: 0,
    });
  }

  const clientTotals = new Map<string, { name: string; total: number }>();

  let invoicesTotal = 0;
  let invoicesBase = 0;
  for (const inv of invoices) {
    const total = Number(inv.total);
    const base = Number(inv.subtotal);
    invoicesTotal = round2(invoicesTotal + total);
    invoicesBase = round2(invoicesBase + base);
    const bucket = monthMap.get(monthKey(inv.issueDate));
    if (bucket) {
      bucket.invoicesTotal = round2(bucket.invoicesTotal + total);
      bucket.invoicesBase = round2(bucket.invoicesBase + base);
    }
    const cur = clientTotals.get(inv.clientId) ?? {
      name: inv.client.name,
      total: 0,
    };
    cur.total = round2(cur.total + total);
    clientTotals.set(inv.clientId, cur);
  }

  let collected = 0;
  for (const p of payments) {
    const amount = Number(p.amount);
    collected = round2(collected + amount);
    const bucket = monthMap.get(monthKey(p.paidAt));
    if (bucket) bucket.collected = round2(bucket.collected + amount);
  }

  let amazonBase = 0;
  let shopifyBase = 0;
  for (const row of marketplace) {
    const base = Number(row.subtotal);
    const ch = row.channel.toUpperCase();
    if (ch === "SHOPIFY") shopifyBase = round2(shopifyBase + base);
    else amazonBase = round2(amazonBase + base);
    const bucket = monthMap.get(monthKey(row.issueDate));
    if (bucket) {
      if (ch === "SHOPIFY") {
        bucket.shopifyBase = round2(bucket.shopifyBase + base);
      } else {
        bucket.amazonBase = round2(bucket.amazonBase + base);
      }
    }
  }
  const marketplaceBase = round2(amazonBase + shopifyBase);

  let expensesBase = 0;
  for (const e of expenses) {
    const base = computeExpenseDeductibility({
      subtotal: Number(e.subtotal),
      vatAmount: Number(e.vatAmount),
      vatDeductiblePct: e.vatDeductiblePct,
      irpfDeductiblePct: e.irpfDeductiblePct,
      isInvestment: e.isInvestment,
    }).irpfComputable;
    expensesBase = round2(expensesBase + base);
    const bucket = monthMap.get(monthKey(e.issueDate));
    if (bucket) bucket.expensesBase = round2(bucket.expensesBase + base);
  }

  const months = [...monthMap.values()].map((m) => {
    const marketplace = round2(m.amazonBase + m.shopifyBase);
    const incomeBase = round2(m.invoicesBase + marketplace);
    return {
      ...m,
      marketplaceBase: marketplace,
      incomeBase,
      netBase: round2(incomeBase - m.expensesBase),
    };
  });

  const incomeBase = round2(invoicesBase + marketplaceBase);

  let pendingCollect = 0;
  for (const inv of pendingInvoices) {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    pendingCollect = round2(
      pendingCollect + Math.max(0, Number(inv.total) - paid)
    );
  }

  const topClients = [...clientTotals.entries()]
    .map(([clientId, v]) => ({
      clientId,
      name: v.name,
      total: v.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return {
    year,
    from,
    to,
    invoicesTotal,
    invoicesBase,
    collected,
    pendingCollect,
    pendingCount: pendingInvoices.length,
    amazonBase,
    shopifyBase,
    marketplaceBase,
    incomeBase,
    expensesBase,
    netBase: round2(incomeBase - expensesBase),
    months,
    topClients,
  };
}

/** Serie compacta para el dashboard (últimos N meses) reutilizando lógica ligera. */
export async function buildRecentMonthTotals(monthsBack = 6): Promise<
  { label: string; total: number; incomeBase: number; collected: number }[]
> {
  const now = new Date();
  const from = startOfMonth(subMonths(now, monthsBack - 1));
  const to = endOfMonth(now);

  const [invoices, payments, marketplace] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: from, lte: to },
      },
      select: { issueDate: true, total: true, subtotal: true },
    }),
    prisma.invoicePayment.findMany({
      where: { paidAt: { gte: from, lte: to } },
      select: { paidAt: true, amount: true },
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
      select: { issueDate: true, subtotal: true },
    }),
  ]);

  const map = new Map<
    string,
    { label: string; total: number; incomeBase: number; collected: number }
  >();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = subMonths(now, i);
    const key = monthKey(d);
    map.set(key, {
      label: format(d, "MMM yy", { locale: es }),
      total: 0,
      incomeBase: 0,
      collected: 0,
    });
  }

  for (const inv of invoices) {
    const b = map.get(monthKey(inv.issueDate));
    if (!b) continue;
    b.total = round2(b.total + Number(inv.total));
    b.incomeBase = round2(b.incomeBase + Number(inv.subtotal));
  }
  for (const row of marketplace) {
    const b = map.get(monthKey(row.issueDate));
    if (!b) continue;
    const base = Number(row.subtotal);
    b.incomeBase = round2(b.incomeBase + base);
    b.total = round2(b.total + base);
  }
  for (const p of payments) {
    const b = map.get(monthKey(p.paidAt));
    if (!b) continue;
    b.collected = round2(b.collected + Number(p.amount));
  }

  return [...map.values()];
}
