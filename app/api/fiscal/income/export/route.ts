import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quarterRange } from "@/lib/fiscal";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import {
  buildIncomeGestoriaExcelBuffer,
  type IncomeExportInvoiceRow,
  type IncomeExportMarketplaceRow,
} from "@/lib/income-gestoria-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseMonthParam(
  raw: string | null
): { year: number; month: number } | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function resolvePeriod(url: URL): {
  from: Date;
  to: Date;
  label: string;
  fileTag: string;
} | null {
  const monthCombo = parseMonthParam(url.searchParams.get("month"));
  if (monthCombo) {
    const { year, month } = monthCombo;
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    const tag = `${year}-${String(month).padStart(2, "0")}`;
    return { from, to, label: tag, fileTag: tag };
  }

  const year = parseInt(url.searchParams.get("year") ?? "", 10);
  const month = parseInt(url.searchParams.get("month") ?? "", 10);
  const quarter = parseInt(url.searchParams.get("quarter") ?? "", 10);

  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;

  if (Number.isFinite(month) && month >= 1 && month <= 12) {
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    const tag = `${year}-${String(month).padStart(2, "0")}`;
    return { from, to, label: tag, fileTag: tag };
  }

  if (quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4) {
    const { from, to } = quarterRange(year, quarter);
    return {
      from,
      to,
      label: `${year} T${quarter}`,
      fileTag: `${year}-T${quarter}`,
    };
  }

  const from = new Date(year, 0, 1, 0, 0, 0, 0);
  const to = new Date(year, 11, 31, 23, 59, 59, 999);
  return { from, to, label: String(year), fileTag: String(year) };
}

function mapMarketplace(
  rows: {
    issueDate: Date;
    channel: string;
    transactionType: string;
    externalRef: string | null;
    orderId: string | null;
    sku: string | null;
    description: string | null;
    shipToCountry: string | null;
    vatStatus: string;
    vatRate: number;
    subtotal: unknown;
    vatAmount: unknown;
    total: unknown;
    sourceFile: string | null;
    invoice: { fullNumber: string } | null;
  }[]
): IncomeExportMarketplaceRow[] {
  return rows.map((r) => ({
    issueDate: r.issueDate,
    channel: r.channel,
    transactionType: r.transactionType,
    externalRef: r.externalRef,
    orderId: r.orderId,
    sku: r.sku,
    description: r.description,
    shipToCountry: r.shipToCountry,
    vatStatus: r.vatStatus,
    vatRate: r.vatRate,
    subtotal: Number(r.subtotal),
    vatAmount: Number(r.vatAmount),
    total: Number(r.total),
    invoiceFullNumber: r.invoice?.fullNumber ?? null,
    sourceFile: r.sourceFile,
  }));
}

/**
 * Informe ingresos para gestoría (Excel):
 * Resumen + Amazon + Shopify + Facturas Vexo.
 *
 * ?month=YYYY-MM
 * ?year=2026&month=9
 * ?year=2026&quarter=2
 * ?year=2026
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = resolvePeriod(url);
  if (!period) {
    return NextResponse.json(
      {
        error:
          "Indica periodo: month=YYYY-MM, o year=YYYY [&month=M | &quarter=1-4]",
      },
      { status: 400 }
    );
  }

  const { from, to, label, fileTag } = period;

  const [amazonRaw, shopifyRaw, invoicesRaw, amazonLastMonth] =
    await Promise.all([
      prisma.marketplaceIncome.findMany({
        where: {
          channel: { equals: "AMAZON", mode: "insensitive" },
          issueDate: { gte: from, lte: to },
        },
        orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
        include: { invoice: { select: { fullNumber: true } } },
      }),
      prisma.marketplaceIncome.findMany({
        where: {
          channel: { equals: "SHOPIFY", mode: "insensitive" },
          issueDate: { gte: from, lte: to },
        },
        orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
        include: { invoice: { select: { fullNumber: true } } },
      }),
      prisma.invoice.findMany({
        where: {
          issueDate: { gte: from, lte: to },
          fiscalStatus: FISCAL_STATUS.ISSUED,
          status: { not: "ANULADA" },
        },
        orderBy: [{ issueDate: "asc" }, { number: "asc" }],
        include: {
          client: { select: { name: true, nif: true } },
          lines: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { description: true, vatRate: true },
          },
          marketplaceIncome: { select: { channel: true } },
        },
      }),
      prisma.marketplaceIncome.findFirst({
        where: { channel: { equals: "AMAZON", mode: "insensitive" } },
        orderBy: { issueDate: "desc" },
        select: { issueDate: true },
      }),
    ]);

  const amazon = mapMarketplace(amazonRaw);
  const shopify = mapMarketplace(shopifyRaw);

  const invoices: IncomeExportInvoiceRow[] = invoicesRaw.map((inv) => {
    const channel = inv.marketplaceIncome?.channel?.toUpperCase();
    const origin: IncomeExportInvoiceRow["origin"] =
      channel === "AMAZON"
        ? "Amazon"
        : channel === "SHOPIFY"
          ? "Shopify"
          : "Vexo";
    return {
      fullNumber: inv.fullNumber,
      issueDate: inv.issueDate,
      clientName: inv.client.name,
      clientNif: inv.client.nif,
      concept: inv.lines[0]?.description ?? inv.notes ?? inv.fullNumber,
      subtotal: Number(inv.subtotal),
      vatRate: inv.lines[0]?.vatRate ?? 0,
      vatAmount: Number(inv.vatAmount),
      irpfAmount: Number(inv.irpfAmount),
      total: Number(inv.total),
      vatOperationType: inv.vatOperationType,
      fiscalStatus: inv.fiscalStatus,
      status: inv.status,
      origin,
    };
  });

  if (!amazon.length && !shopify.length && !invoices.length) {
    return NextResponse.json(
      { error: `No hay ingresos en ${label}` },
      { status: 404 }
    );
  }

  const amazonLastMonthWithData = amazonLastMonth
    ? `${amazonLastMonth.issueDate.getUTCFullYear()}-${String(
        amazonLastMonth.issueDate.getUTCMonth() + 1
      ).padStart(2, "0")}`
    : null;

  const buffer = buildIncomeGestoriaExcelBuffer({
    periodLabel: label,
    amazon,
    shopify,
    invoices,
    amazonLastMonthWithData: amazon.length ? null : amazonLastMonthWithData,
  });

  const fileName = `ingresos_gestoria_${fileTag}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
