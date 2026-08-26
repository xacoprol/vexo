"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { calculateDocument, type LineInput } from "@/lib/calculations";
import {
  allocateRectifyingInvoiceNumber,
  syncInvoiceSeriesNextNumber,
} from "@/lib/numbering";
import {
  INVOICE_FISCAL_TYPE,
  RECTIFICATION_CAUSE,
  computeRectificationTotals,
  parseRectificationMethod,
  parseRectificationType,
  resolveRectifyingInvoiceType,
  canRectifyInvoice,
  type RectificationCause,
} from "@/lib/invoice-rectification";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { applyVerifactuSeal } from "@/lib/verifactu-seal";
import type { DocFormState } from "@/app/(app)/invoices/actions";

function parseCorrectionLines(raw: unknown): LineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => l as LineInput)
    .filter((l) => String(l.description ?? "").trim());
}

export async function createRectificationDraft(input: {
  originalInvoiceId: string;
  cause: RectificationCause;
  legalType: string;
  method: string;
  correctionLines?: LineInput[];
  substitutionCorrect?: {
    subtotal: number;
    vatAmount: number;
    total: number;
  };
  issueDate?: string;
  notes?: string;
}): Promise<DocFormState & { id?: string }> {
  await requireAuth();
  try {
    const original = await prisma.invoice.findUnique({
      where: { id: input.originalInvoiceId },
      include: { client: true, lines: true },
    });
    if (!original) return { error: "Factura original no encontrada" };

    const check = canRectifyInvoice(original);
    if (!check.ok) return { error: check.reason };

    const legalType = parseRectificationType(input.legalType);
    const method = parseRectificationMethod(input.method);
    if (!legalType || !method) {
      return { error: "Tipo legal o método de rectificación no válido" };
    }

    const typeCheck = resolveRectifyingInvoiceType({
      legalType,
      originalInvoiceKind: original.invoiceKind,
    });
    if (typeCheck.errors.length) {
      return { error: typeCheck.errors.join(" ") };
    }

    const originalRef = {
      id: original.id,
      fullNumber: original.fullNumber,
      issueDate: original.issueDate,
      invoiceKind: original.invoiceKind,
      subtotal: Number(original.subtotal),
      vatAmount: Number(original.vatAmount),
      total: Number(original.total),
      vatOperationType: original.vatOperationType,
      irpfRate: Number(original.irpfRate),
    };

    const { totals, errors } = computeRectificationTotals(originalRef, {
      cause: input.cause,
      legalType: typeCheck.type,
      method,
      correctionLines: input.correctionLines,
      substitutionCorrect: input.substitutionCorrect,
    });
    if (errors.length) return { error: errors.join(" ") };

    const calc = calculateDocument(totals.lines, originalRef.irpfRate);
    const num = await allocateRectifyingInvoiceNumber(prisma);
    const issueDate = input.issueDate
      ? new Date(input.issueDate)
      : new Date();

    const draft = await prisma.invoice.create({
      data: {
        seriesId: num.seriesId,
        seriesPrefix: num.seriesPrefix,
        number: num.number,
        fullNumber: num.fullNumber,
        clientId: original.clientId,
        issueDate,
        dueDate: null,
        status: "PENDIENTE",
        fiscalStatus: FISCAL_STATUS.DRAFT,
        invoiceKind: original.invoiceKind,
        invoiceFiscalType: INVOICE_FISCAL_TYPE.RECTIFYING,
        rectificationType: typeCheck.type,
        rectificationMethod: method,
        rectifiesInvoiceId: original.id,
        rectificationCause: input.cause,
        rectificationNotes: input.notes?.trim() || null,
        substitutionCorrectSubtotal: totals.substitutionCorrect?.subtotal,
        substitutionCorrectVat: totals.substitutionCorrect?.vatAmount,
        substitutionCorrectTotal: totals.substitutionCorrect?.total,
        paymentMethod: original.paymentMethod,
        notes: input.notes?.trim() || null,
        vatOperationType: original.vatOperationType,
        operationKey347: original.operationKey347,
        subtotal: calc.subtotal,
        vatAmount: calc.vatAmount,
        irpfRate: calc.irpfRate,
        irpfAmount: calc.irpfAmount,
        total: calc.total,
      },
    });

    await prisma.invoiceLine.createMany({
      data: calc.lines.map((l) => ({
        invoiceId: draft.id,
        sortOrder: l.sortOrder,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        discountPct: l.discountPct,
        lineSubtotal: l.lineSubtotal,
        lineVat: l.lineVat,
        lineTotal: l.lineTotal,
      })),
    });

    revalidatePath(`/invoices/${original.id}`);
    revalidatePath("/invoices");
    redirect(`/invoices/${draft.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error:
        err instanceof Error
          ? err.message
          : "No se pudo crear el borrador rectificativo",
    };
  }
}

export async function issueRectification(id: string): Promise<DocFormState> {
  await requireAuth();
  try {
    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: { select: { id: true } },
        client: { select: { name: true, nif: true } },
        rectifiesInvoice: {
          select: { id: true, fullNumber: true, issueDate: true, fiscalStatus: true },
        },
      },
    });
    if (!existing) return { error: "Factura no encontrada" };
    if (existing.invoiceFiscalType !== INVOICE_FISCAL_TYPE.RECTIFYING) {
      return { error: "No es una factura rectificativa" };
    }
    if (existing.fiscalStatus === FISCAL_STATUS.ISSUED) {
      return { error: "La rectificativa ya está emitida" };
    }
    if (!existing.rectifiesInvoiceId || !existing.rectifiesInvoice) {
      return { error: "Falta vínculo con la factura original" };
    }
    if (existing.rectifiesInvoice.fiscalStatus !== FISCAL_STATUS.ISSUED) {
      return { error: "La factura original debe estar emitida" };
    }
    if (!existing.rectificationType || !existing.rectificationMethod) {
      return { error: "Faltan datos de rectificación (tipo R o método)" };
    }
    if (!existing.lines.length) {
      return { error: "La rectificativa debe tener líneas" };
    }

    const settings = await prisma.companySettings.findFirst({
      select: { nif: true },
    });
    if (!settings?.nif?.trim()) {
      return {
        error:
          "Configura el NIF de la empresa antes de emitir la rectificativa.",
      };
    }

    const sealed = await applyVerifactuSeal(prisma, id, { markIssued: true });
    if (!sealed) {
      return {
        error:
          "No se pudo generar el registro fiscal. La rectificativa sigue en borrador.",
      };
    }

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    revalidatePath(`/invoices/${existing.rectifiesInvoiceId}`);
    revalidatePath("/fiscal");
    return {};
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No se pudo emitir la rectificativa",
    };
  }
}

export async function deleteRectificationDraft(id: string): Promise<DocFormState> {
  await requireAuth();
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return { error: "Factura no encontrada" };
    if (invoice.invoiceFiscalType !== INVOICE_FISCAL_TYPE.RECTIFYING) {
      return { error: "No es una rectificativa" };
    }
    if (invoice.fiscalStatus !== FISCAL_STATUS.DRAFT) {
      return { error: "Solo se pueden borrar rectificativas en borrador" };
    }

    await prisma.invoice.delete({ where: { id } });
    await syncInvoiceSeriesNextNumber(prisma, invoice.seriesId, invoice.number);

    revalidatePath("/invoices");
    if (invoice.rectifiesInvoiceId) {
      revalidatePath(`/invoices/${invoice.rectifiesInvoiceId}`);
    }
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo borrar",
    };
  }
}

export async function buildTotalReturnPreview(originalInvoiceId: string) {
  await requireAuth();
  const original = await prisma.invoice.findUnique({
    where: { id: originalInvoiceId },
  });
  if (!original) return null;
  const originalRef = {
    id: original.id,
    fullNumber: original.fullNumber,
    issueDate: original.issueDate,
    invoiceKind: original.invoiceKind,
    subtotal: Number(original.subtotal),
    vatAmount: Number(original.vatAmount),
    total: Number(original.total),
    vatOperationType: original.vatOperationType,
    irpfRate: Number(original.irpfRate),
  };
  return computeRectificationTotals(originalRef, {
    cause: RECTIFICATION_CAUSE.TOTAL_RETURN,
    legalType:
      original.invoiceKind === "SIMPLIFIED"
        ? ("R5" as const)
        : ("R1" as const),
    method: "DIFFERENCES" as const,
    correctionLines: [
      {
        description: `Devolución total — ${original.fullNumber}`,
        quantity: 1,
        unitPrice: Number(original.subtotal),
        vatRate:
          Number(original.subtotal) > 0
            ? Math.round(
                (Number(original.vatAmount) / Number(original.subtotal)) * 10000
              ) / 100
            : 21,
        discountPct: 0,
      },
    ],
  });
}
