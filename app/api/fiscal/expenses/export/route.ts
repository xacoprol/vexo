import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quarterRange } from "@/lib/fiscal";
import {
  buildExpenseGestoriaExcelBuffer,
  type ExpenseExportRow,
} from "@/lib/expense-gestoria-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

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
    return {
      from,
      to,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      fileTag: tag,
    };
  }

  const year = parseInt(url.searchParams.get("year") ?? "", 10);
  const month = parseInt(url.searchParams.get("month") ?? "", 10);
  const quarter = parseInt(url.searchParams.get("quarter") ?? "", 10);

  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;

  if (Number.isFinite(month) && month >= 1 && month <= 12) {
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    const tag = `${year}-${String(month).padStart(2, "0")}`;
    return {
      from,
      to,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      fileTag: tag,
    };
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
  return { from, to, label: `año ${year}`, fileTag: String(year) };
}

/**
 * Informe gastos para gestoría (Excel).
 * ?year=2026&month=8  |  ?month=2026-08  |  ?year=2026
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

  const raw = await prisma.expense.findMany({
    where: { issueDate: { gte: from, lte: to } },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
    select: {
      issueDate: true,
      supplierName: true,
      supplierNif: true,
      invoiceNumber: true,
      description: true,
      category: true,
      vatOperationType: true,
      subtotal: true,
      vatRate: true,
      vatAmount: true,
      total: true,
      vatDeductiblePct: true,
      irpfDeductiblePct: true,
      isInvestment: true,
      documentId: true,
    },
  });

  if (!raw.length) {
    return NextResponse.json(
      { error: `No hay gastos en ${label}` },
      { status: 404 }
    );
  }

  const expenses: ExpenseExportRow[] = raw.map((e) => ({
    issueDate: e.issueDate,
    supplierName: e.supplierName,
    supplierNif: e.supplierNif,
    invoiceNumber: e.invoiceNumber,
    description: e.description,
    category: e.category,
    vatOperationType: e.vatOperationType,
    subtotal: Number(e.subtotal),
    vatRate: e.vatRate,
    vatAmount: Number(e.vatAmount),
    total: Number(e.total),
    vatDeductiblePct: e.vatDeductiblePct,
    irpfDeductiblePct: e.irpfDeductiblePct,
    isInvestment: e.isInvestment,
    hasDocument: Boolean(e.documentId),
  }));

  const buffer = buildExpenseGestoriaExcelBuffer({
    periodLabel: label,
    expenses,
  });

  const fileName = `gastos_${fileTag}.xlsx`;
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
