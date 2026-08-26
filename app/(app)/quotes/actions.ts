"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { calculateDocument, type LineInput } from "@/lib/calculations";
import { allocateQuoteNumber, allocateInvoiceNumber } from "@/lib/numbering";
import { applyVerifactuSeal } from "@/lib/verifactu-seal";

export type DocFormState = { error?: string };

function parseLines(formData: FormData): LineInput[] {
  const raw = String(formData.get("linesJson") ?? "[]");
  const lines = JSON.parse(raw) as LineInput[];
  return lines.filter((l) => l.description?.trim());
}

function toDate(value: FormDataEntryValue | null): Date {
  return new Date(String(value));
}

async function createQuoteLines(
  quoteId: string,
  lines: ReturnType<typeof calculateDocument>["lines"]
) {
  for (const l of lines) {
    await prisma.quoteLine.create({
      data: {
        quoteId,
        sortOrder: l.sortOrder,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        discountPct: l.discountPct,
        lineSubtotal: l.lineSubtotal,
        lineVat: l.lineVat,
        lineTotal: l.lineTotal,
      },
    });
  }
}

export async function createQuote(
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  await requireAuth();
  try {
    const clientId = String(formData.get("clientId") ?? "");
    const lines = parseLines(formData);
    if (!clientId) return { error: "Selecciona un cliente" };
    if (!lines.length) return { error: "Añade al menos una línea" };

    const discountPct = Math.min(
      100,
      Math.max(0, parseFloat(String(formData.get("discountPct") ?? "0")) || 0)
    );
    const totals = calculateDocument(lines, 0, discountPct);
    const issueDate = toDate(formData.get("issueDate"));
    const validUntilRaw = String(formData.get("validUntil") ?? "");
    const status = String(formData.get("status") ?? "BORRADOR");

    const num = await allocateQuoteNumber(prisma);
    const quote = await prisma.quote.create({
      data: {
        seriesId: num.seriesId,
        seriesPrefix: num.seriesPrefix,
        number: num.number,
        fullNumber: num.fullNumber,
        clientId,
        issueDate,
        validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
        status,
        isProforma:
          formData.get("isProforma") === "on" ||
          formData.get("isProforma") === "1",
        notes: String(formData.get("notes") ?? "").trim() || null,
        conditions: String(formData.get("conditions") ?? "").trim() || null,
        discountPct,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
      },
    });
    await createQuoteLines(quote.id, totals.lines);

    revalidatePath("/quotes");
    redirect(`/quotes/${quote.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "No se pudo crear el presupuesto",
    };
  }
}

export async function updateQuote(
  id: string,
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  await requireAuth();
  try {
    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) return { error: "Presupuesto no encontrado" };
    if (existing.status === "ACEPTADO") {
      const inv = await prisma.invoice.findUnique({ where: { quoteId: id } });
      if (inv) return { error: "Ya convertido en factura; no se puede editar" };
    }

    const clientId = String(formData.get("clientId") ?? "");
    const lines = parseLines(formData);
    if (!clientId) return { error: "Selecciona un cliente" };
    if (!lines.length) return { error: "Añade al menos una línea" };

    const discountPct = Math.min(
      100,
      Math.max(0, parseFloat(String(formData.get("discountPct") ?? "0")) || 0)
    );
    const totals = calculateDocument(lines, 0, discountPct);
    const issueDate = toDate(formData.get("issueDate"));
    const validUntilRaw = String(formData.get("validUntil") ?? "");
    const status = String(formData.get("status") ?? existing.status);

    await prisma.quoteLine.deleteMany({ where: { quoteId: id } });
    await prisma.quote.update({
      where: { id },
      data: {
        clientId,
        issueDate,
        validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
        status,
        isProforma:
          formData.get("isProforma") === "on" ||
          formData.get("isProforma") === "1",
        notes: String(formData.get("notes") ?? "").trim() || null,
        conditions: String(formData.get("conditions") ?? "").trim() || null,
        discountPct,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
      },
    });
    await createQuoteLines(id, totals.lines);

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${id}`);
    redirect(`/quotes/${id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar el presupuesto",
    };
  }
}

export async function convertQuoteToInvoice(quoteId: string) {
  await requireAuth();
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      recurringTemplate: true,
    },
  });
  if (!quote) throw new Error("Presupuesto no encontrado");

  const existing = await prisma.invoice.findUnique({
    where: { quoteId },
  });
  if (existing) redirect(`/invoices/${existing.id}`);

  const settings = await prisma.companySettings.findFirst();
  const tpl = quote.recurringTemplate;
  const irpfRate = tpl?.irpfRate ?? settings?.defaultIrpfRate ?? 0;
  const lineInputs = quote.lines.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    vatRate: l.vatRate,
    discountPct: l.discountPct,
  }));
  const totals = calculateDocument(lineInputs, irpfRate, quote.discountPct);

  const due = new Date(quote.issueDate);
  due.setDate(due.getDate() + 30);

  const num = await allocateInvoiceNumber(prisma, tpl?.seriesId);
  const lastInSeries = await prisma.invoice.findFirst({
    where: { seriesId: num.seriesId, status: { not: "ANULADA" } },
    orderBy: { number: "desc" },
  });

  const invoice = await prisma.invoice.create({
    data: {
      seriesId: num.seriesId,
      seriesPrefix: num.seriesPrefix,
      number: num.number,
      fullNumber: num.fullNumber,
      clientId: quote.clientId,
      issueDate: new Date(),
      dueDate: due,
      status: "PENDIENTE",
      fiscalStatus: "ISSUED",
      invoiceKind: "FULL",
      paymentMethod:
        tpl?.paymentMethod?.trim() || "Transferencia",
      notes: quote.notes,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      irpfRate: totals.irpfRate,
      irpfAmount: totals.irpfAmount,
      total: totals.total,
      quoteId: quote.id,
      recurringTemplateId: tpl?.id ?? quote.recurringTemplateId ?? null,
      vatOperationType: tpl?.vatOperationType ?? "SUJETA",
      cashAccounting: tpl?.cashAccounting ?? false,
      operationKey: tpl?.operationKey ?? null,
      operationKey347: tpl?.operationKey347 ?? null,
      previousInvoiceId: lastInSeries?.id ?? null,
    },
  });

  for (const l of totals.lines) {
    await prisma.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        sortOrder: l.sortOrder,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        discountPct: l.discountPct,
        lineSubtotal: l.lineSubtotal,
        lineVat: l.lineVat,
        lineTotal: l.lineTotal,
      },
    });
  }

  await applyVerifactuSeal(prisma, invoice.id, { markIssued: true });

  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: "ACEPTADO" },
  });

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

export async function setQuoteStatus(id: string, status: string) {
  await requireAuth();
  const allowed = ["BORRADOR", "ENVIADO", "ACEPTADO", "RECHAZADO", "EXPIRADO"];
  if (!allowed.includes(status)) throw new Error("Estado no válido");

  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) throw new Error("Presupuesto no encontrado");

  const inv = await prisma.invoice.findUnique({ where: { quoteId: id } });
  if (inv && status !== "ACEPTADO") {
    throw new Error("Ya convertido en factura");
  }

  await prisma.quote.update({ where: { id }, data: { status } });
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

export async function duplicateQuote(id: string) {
  await requireAuth();
  const source = await prisma.quote.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new Error("Presupuesto no encontrado");

  const lineInputs = source.lines.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    vatRate: l.vatRate,
    discountPct: l.discountPct,
  }));
  const totals = calculateDocument(lineInputs, 0, source.discountPct);
  const num = await allocateQuoteNumber(prisma);

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const validUntil = source.validUntil
    ? new Date(source.validUntil)
    : (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + 30);
        return d;
      })();

  const quote = await prisma.quote.create({
    data: {
      seriesId: num.seriesId,
      seriesPrefix: num.seriesPrefix,
      number: num.number,
      fullNumber: num.fullNumber,
      clientId: source.clientId,
      issueDate: today,
      validUntil,
      status: "BORRADOR",
      isProforma: source.isProforma,
      notes: source.notes,
      conditions: source.conditions,
      discountPct: source.discountPct,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      total: totals.total,
    },
  });
  await createQuoteLines(quote.id, totals.lines);

  revalidatePath("/quotes");
  redirect(`/quotes/${quote.id}/edit`);
}

export async function deleteQuote(id: string) {
  await requireAuth();
  const inv = await prisma.invoice.findUnique({ where: { quoteId: id } });
  if (inv) {
    throw new Error("No se puede eliminar: ya convertido en factura");
  }
  await prisma.quote.delete({ where: { id } });
  revalidatePath("/quotes");
  redirect("/quotes");
}

export async function deleteQuotes(ids: string[]) {
  await requireAuth();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { deleted: 0, skipped: 0 };

  const blocked = await prisma.invoice.findMany({
    where: { quoteId: { in: unique } },
    select: { quoteId: true },
  });
  const blockedIds = new Set(
    blocked.flatMap((b) => (b.quoteId ? [b.quoteId] : []))
  );
  const deletable = unique.filter((id) => !blockedIds.has(id));

  if (deletable.length) {
    await prisma.quote.deleteMany({ where: { id: { in: deletable } } });
  }

  revalidatePath("/quotes");
  return { deleted: deletable.length, skipped: blockedIds.size };
}

