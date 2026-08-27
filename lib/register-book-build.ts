import { Prisma } from "@prisma/client";
import { yearRange } from "@/lib/fiscal";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { marketplaceIncomeNotInvoicedWhere } from "@/lib/marketplace-invoice";
import { prisma } from "@/lib/prisma";
import type {
  ParsedRegisterBookLine,
  RegisterBookType,
} from "@/lib/register-book-import";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/**
 * Construye líneas de libro registro a partir de datos vivos de Vexo
 * (facturas emitidas, marketplace, gastos, bienes).
 */
export async function buildRegisterBookLines(
  bookType: RegisterBookType,
  year: number
): Promise<ParsedRegisterBookLine[]> {
  const { from, to } = yearRange(year);

  if (bookType === "INGRESOS") {
    return buildIncomeLines(from, to);
  }
  if (bookType === "GASTOS") {
    return buildExpenseLines(from, to);
  }
  return buildAssetLines(year);
}

async function buildIncomeLines(
  from: Date,
  to: Date
): Promise<ParsedRegisterBookLine[]> {
  const [invoices, marketplace] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: from, lte: to },
      },
      include: {
        client: { select: { name: true, nif: true } },
        lines: {
          select: {
            description: true,
            vatRate: true,
            lineSubtotal: true,
            lineVat: true,
            lineTotal: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { issueDate: "asc" },
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
      orderBy: { issueDate: "asc" },
    }),
  ]);

  const lines: ParsedRegisterBookLine[] = [];

  for (const inv of invoices) {
    const byRate = new Map<
      number,
      { base: number; vat: number; total: number; concept: string }
    >();
    for (const l of inv.lines) {
      const rate = l.vatRate;
      const cur = byRate.get(rate) ?? {
        base: 0,
        vat: 0,
        total: 0,
        concept: l.description,
      };
      cur.base = round2(cur.base + num(l.lineSubtotal));
      cur.vat = round2(cur.vat + num(l.lineVat));
      cur.total = round2(cur.total + num(l.lineTotal));
      if (!cur.concept) cur.concept = l.description;
      byRate.set(rate, cur);
    }

    if (byRate.size === 0) {
      byRate.set(0, {
        base: num(inv.subtotal),
        vat: num(inv.vatAmount),
        total: num(inv.total),
        concept: `Factura ${inv.fullNumber}`,
      });
    }

    let withholdingLeft = num(inv.irpfAmount);
    const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
    for (const [vatRate, agg] of rates) {
      const withholding = withholdingLeft;
      withholdingLeft = 0;
      lines.push({
        sortOrder: 0,
        reference: null,
        invoiceNumber: inv.fullNumber,
        issueDate: inv.issueDate,
        concept: agg.concept || `Factura ${inv.fullNumber}`,
        nif: inv.client.nif,
        counterparty: inv.client.name,
        base: agg.base,
        vatRate,
        vatAmount: agg.vat,
        withholding,
        total: round2(agg.total - withholding),
      });
    }
  }

  for (const m of marketplace) {
    const channel =
      m.channel === "AMAZON"
        ? "Amazon"
        : m.channel === "SHOPIFY"
          ? "Shopify"
          : m.channel;
    lines.push({
      sortOrder: 0,
      reference: m.orderId,
      invoiceNumber: m.externalRef ?? m.externalKey,
      issueDate: m.issueDate,
      concept:
        m.description?.trim() ||
        `${channel} · ${m.transactionType}${m.sku ? ` · ${m.sku}` : ""}`,
      nif: null,
      counterparty: channel,
      base: round2(num(m.subtotal)),
      vatRate: m.vatRate,
      vatAmount: round2(num(m.vatAmount)),
      withholding: 0,
      total: round2(num(m.total)),
    });
  }

  lines.sort((a, b) => {
    const ta = a.issueDate?.getTime() ?? 0;
    const tb = b.issueDate?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.invoiceNumber ?? "").localeCompare(
      String(b.invoiceNumber ?? "")
    );
  });

  return lines.map((l, i) => ({ ...l, sortOrder: i + 1 }));
}

async function buildExpenseLines(
  from: Date,
  to: Date
): Promise<ParsedRegisterBookLine[]> {
  const expenses = await prisma.expense.findMany({
    where: { issueDate: { gte: from, lte: to } },
    orderBy: { issueDate: "asc" },
  });

  const expenseIds = expenses.map((e) => e.id);
  const withholdings =
    expenseIds.length === 0
      ? []
      : await prisma.fiscalWithholding.findMany({
          where: {
            sourceType: "EXPENSE",
            sourceId: { in: expenseIds },
            direction: "PRACTICED",
            status: "ACTIVE",
          },
          select: {
            sourceId: true,
            kind: true,
            withholdingAmount: true,
          },
        });
  const practicedByExpense = new Map<string, number>();
  for (const w of withholdings) {
    practicedByExpense.set(
      w.sourceId,
      round2(
        (practicedByExpense.get(w.sourceId) ?? 0) + num(w.withholdingAmount)
      )
    );
  }

  return expenses.map((e, i) => {
    const gross = round2(num(e.total));
    // GASTOS: columna «Retención» = retención PRACTICED (profesional o alquiler).
    const practiced = practicedByExpense.get(e.id) ?? 0;
    const leaseHint = e.leaseId ? " · Local arrendado" : "";
    return {
      sortOrder: i + 1,
      reference: null,
      invoiceNumber: e.invoiceNumber,
      issueDate: e.issueDate,
      concept:
        e.description?.trim() ||
        `${e.category}${e.vatOperationType === "INTRACOMUNITARIA" ? " · Intracom" : e.vatOperationType === "SERVICIO_EXTRACOMUNITARIO" ? " · Extracom" : ""}${practiced > 0 ? " · Ret. practicada" : ""}${leaseHint}`,
      nif: e.supplierNif,
      counterparty: e.supplierName,
      base: round2(num(e.subtotal)),
      vatRate: e.vatRate,
      vatAmount: round2(num(e.vatAmount)),
      withholding: practiced,
      // Total Fra. = importe neto pagadero cuando hay retención practicada
      total: round2(gross - practiced),
    };
  });
}

async function buildAssetLines(year: number): Promise<ParsedRegisterBookLine[]> {
  const assets = await prisma.investmentAsset.findMany({
    where: {
      OR: [
        {
          purchaseDate: {
            gte: new Date(year, 0, 1),
            lte: new Date(year, 11, 31, 23, 59, 59, 999),
          },
        },
        {
          purchaseDate: null,
          startYear: year,
        },
      ],
    },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
  });

  return assets.map((a, i) => ({
    sortOrder: i + 1,
    reference: null,
    invoiceNumber: a.invoiceNumber,
    issueDate: a.purchaseDate,
    concept: a.description,
    nif: a.supplierNif,
    counterparty: a.supplierName,
    base: round2(num(a.base)),
    vatRate:
      num(a.base) > 0
        ? round2((num(a.vatAmount) / num(a.base)) * 100)
        : 0,
    vatAmount: round2(num(a.vatAmount)),
    withholding: 0,
    total: round2(num(a.base) + num(a.vatAmount)),
  }));
}

/** Sustituye el libro bookType+year (Neon HTTP: sin createMany). */
export async function persistGeneratedRegisterBook(opts: {
  bookType: RegisterBookType;
  year: number;
  lines: ParsedRegisterBookLine[];
  sourceFile: string;
  documentId?: string | null;
}): Promise<{ id: string; lines: number }> {
  const existing = await prisma.registerBook.findUnique({
    where: {
      bookType_year: { bookType: opts.bookType, year: opts.year },
    },
  });
  if (existing) {
    await prisma.registerBookLine.deleteMany({ where: { bookId: existing.id } });
    await prisma.registerBook.delete({ where: { id: existing.id } });
  }

  const book = await prisma.registerBook.create({
    data: {
      bookType: opts.bookType,
      year: opts.year,
      documentId: opts.documentId ?? null,
      sourceFile: opts.sourceFile,
    },
  });

  for (const l of opts.lines) {
    await prisma.registerBookLine.create({
      data: {
        bookId: book.id,
        sortOrder: l.sortOrder,
        reference: l.reference,
        invoiceNumber: l.invoiceNumber,
        issueDate: l.issueDate,
        concept: l.concept,
        nif: l.nif,
        counterparty: l.counterparty,
        base: new Prisma.Decimal(l.base),
        vatRate: l.vatRate,
        vatAmount: new Prisma.Decimal(l.vatAmount),
        withholding: new Prisma.Decimal(l.withholding),
        total: new Prisma.Decimal(l.total),
      },
    });
  }

  return { id: book.id, lines: opts.lines.length };
}

export async function regenerateRegisterBooksForYear(year: number): Promise<{
  books: { bookType: RegisterBookType; id: string; lines: number }[];
}> {
  const stamp = new Date().toISOString().slice(0, 10);
  const sourceFile = `Vexo generada ${stamp}`;
  const types: RegisterBookType[] = ["INGRESOS", "GASTOS", "BIENES"];
  const books: { bookType: RegisterBookType; id: string; lines: number }[] = [];

  for (const bookType of types) {
    const lines = await buildRegisterBookLines(bookType, year);
    const saved = await persistGeneratedRegisterBook({
      bookType,
      year,
      lines,
      sourceFile,
    });
    books.push({ bookType, id: saved.id, lines: saved.lines });
  }

  return { books };
}
