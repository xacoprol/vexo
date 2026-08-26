"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { calculateDocument, type LineInput } from "@/lib/calculations";
import { allocateInvoiceNumber, syncInvoiceSeriesNextNumber } from "@/lib/numbering";
import {
  findDuplicateIssuedInvoice,
  resolveHistoricalInvoiceNumber,
  resolveOrCreateClient,
} from "@/lib/invoice-import";
import {
  paymentTotals,
  syncInvoicePaymentStatus,
} from "@/lib/invoice-payments";
import {
  isZeroVatOperation,
  parseVatOperationType,
} from "@/lib/recurring";
import {
  invoiceVatCountryWarning,
  parseOperationKey347,
} from "@/lib/invoice-fiscal";
import { applyVerifactuSeal } from "@/lib/verifactu-seal";
import {
  assertInvoiceDeletable,
  assertInvoiceEditable,
  FISCAL_STATUS,
  InvoiceFiscalError,
  isInvoiceDraft,
  isInvoiceIssued,
  ISSUED_DELETE_ERROR,
  ISSUED_IMMUTABLE_ERROR,
  type IssuedMetadataPatch,
} from "@/lib/invoice-fiscal-lifecycle";
import { Prisma } from "@prisma/client";

export type DocFormState = { error?: string };

function parseLines(formData: FormData): LineInput[] {
  const raw = String(formData.get("linesJson") ?? "[]");
  return (JSON.parse(raw) as LineInput[]).filter((l) => l.description?.trim());
}

function applyVatOperationToLines(
  lines: LineInput[],
  vatOperationType: string
): LineInput[] {
  if (!isZeroVatOperation(vatOperationType)) return lines;
  return lines.map((l) => ({ ...l, vatRate: 0 }));
}

async function createInvoiceLines(
  db: typeof prisma,
  invoiceId: string,
  lines: ReturnType<typeof calculateDocument>["lines"]
) {
  if (!lines.length) return;
  await db.invoiceLine.createMany({
    data: lines.map((l) => ({
      invoiceId,
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
}

function isInvoiceNumberConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  const target = Array.isArray(err.meta?.target) ? err.meta.target : [];
  return (
    target.includes("seriesId") ||
    target.includes("number") ||
    target.includes("fullNumber")
  );
}

export async function createInvoice(
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  await requireAuth();
  try {
    const clientId = String(formData.get("clientId") ?? "");
    const seriesId = String(formData.get("seriesId") ?? "") || undefined;
    const vatOperationType = parseVatOperationType(
      formData.get("vatOperationType")
    );
    const operationKey347 = parseOperationKey347(
      formData.get("operationKey347")
    );
    const lines = applyVatOperationToLines(parseLines(formData), vatOperationType);
    const irpfRate = parseFloat(String(formData.get("irpfRate") ?? "0")) || 0;

    if (!clientId) return { error: "Selecciona un cliente" };
    if (!lines.length) return { error: "Añade al menos una línea" };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { countryCode: true },
    });
    const vatWarn = invoiceVatCountryWarning({
      vatOperationType,
      clientCountryCode: client?.countryCode,
    });
    if (vatWarn && formData.get("forceVatMismatch") !== "1") {
      if (vatOperationType === "INTRACOMUNITARIA") {
        return { error: vatWarn };
      }
    }

    const totals = calculateDocument(lines, irpfRate);
    const issueDate = new Date(String(formData.get("issueDate")));
    const dueRaw = String(formData.get("dueDate") ?? "");

    let invoice: { id: string; seriesId: string; number: number } | null = null;
    const paymentMethod =
      String(formData.get("paymentMethod") ?? "").trim() || "Transferencia";
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const { parseInvoiceKind } = await import("@/lib/invoice-issuance");
    const invoiceKind = parseInvoiceKind(formData.get("invoiceKind"));

    /**
     * Numeración al crear (estrategia FASE 1): la arquitectura actual reserva
     * correlativo en create. La factura nace DRAFT (editable/borrable) y solo
     * pasa a ISSUED con issueInvoice() (sello + bloqueo).
     * Neon HTTP no soporta $transaction interactiva → create + lines con
     * compensación si fallan las líneas.
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      const num = await allocateInvoiceNumber(prisma, seriesId);
      const lastInSeries = await prisma.invoice.findFirst({
        where: { seriesId: num.seriesId },
        orderBy: { number: "desc" },
      });
      try {
        invoice = await prisma.invoice.create({
          data: {
            seriesId: num.seriesId,
            seriesPrefix: num.seriesPrefix,
            number: num.number,
            fullNumber: num.fullNumber,
            clientId,
            issueDate,
            dueDate: dueRaw ? new Date(dueRaw) : null,
            status: "PENDIENTE",
            fiscalStatus: FISCAL_STATUS.DRAFT,
            invoiceKind,
            paymentMethod,
            notes,
            vatOperationType,
            operationKey347,
            subtotal: totals.subtotal,
            vatAmount: totals.vatAmount,
            irpfRate: totals.irpfRate,
            irpfAmount: totals.irpfAmount,
            total: totals.total,
            previousInvoiceId: lastInSeries?.id ?? null,
          },
          select: { id: true, seriesId: true, number: true },
        });
        break;
      } catch (err) {
        if (!isInvoiceNumberConflict(err) || attempt === 2) throw err;
      }
    }
    if (!invoice) {
      return { error: "No se pudo reservar un número de factura válido" };
    }
    try {
      await createInvoiceLines(prisma, invoice.id, totals.lines);
    } catch (lineErr) {
      console.error(
        "[createInvoice] Fallo creando líneas; compensación delete+sync",
        {
          invoiceId: invoice.id,
          seriesId: invoice.seriesId,
          number: invoice.number,
          err: lineErr instanceof Error ? lineErr.message : lineErr,
        }
      );
      try {
        await prisma.invoice.delete({ where: { id: invoice.id } });
      } catch (delErr) {
        console.error(
          "[createInvoice] Rollback delete falló — DRAFT huérfano reparable (0 líneas)",
          {
            invoiceId: invoice.id,
            err: delErr instanceof Error ? delErr.message : delErr,
          }
        );
      }
      try {
        await syncInvoiceSeriesNextNumber(
          prisma,
          invoice.seriesId,
          invoice.number
        );
      } catch (syncErr) {
        console.error("[createInvoice] sync correlativo tras rollback falló", {
          seriesId: invoice.seriesId,
          err: syncErr instanceof Error ? syncErr.message : syncErr,
        });
      }
      throw lineErr;
    }

    revalidatePath("/invoices");
    redirect(`/invoices/${invoice.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "No se pudo crear la factura",
    };
  }
}

/**
 * Emisión fiscal: DRAFT → ISSUED + huella Veri*Factu.
 * Validación centralizada previa; nunca ISSUED sin registro fiscal.
 */
export async function issueInvoice(id: string): Promise<DocFormState> {
  await requireAuth();
  try {
    const [existing, settings] = await Promise.all([
      prisma.invoice.findUnique({
        where: { id },
        include: {
          lines: { select: { id: true } },
          client: { select: { name: true, nif: true } },
        },
      }),
      prisma.companySettings.findFirst({
        select: { nif: true, simplifiedInvoiceMaxAmount: true },
      }),
    ]);
    if (!existing) return { error: "Factura no encontrada" };
    if (isInvoiceIssued(existing)) {
      return { error: "La factura ya está emitida" };
    }

    const { validateInvoiceForIssuance } = await import(
      "@/lib/invoice-issuance"
    );
    const validation = validateInvoiceForIssuance({
      status: existing.status,
      fullNumber: existing.fullNumber,
      issueDate: existing.issueDate,
      subtotal: existing.subtotal,
      vatAmount: existing.vatAmount,
      total: existing.total,
      invoiceKind: existing.invoiceKind,
      lineCount: existing.lines.length,
      clientNif: existing.client.nif,
      clientName: existing.client.name,
      issuerNif: settings?.nif,
      simplifiedInvoiceMaxAmount: settings?.simplifiedInvoiceMaxAmount,
    });
    if (!validation.valid) {
      return { error: validation.errors.join(" ") };
    }

    const sealed = await applyVerifactuSeal(prisma, id, {
      markIssued: true,
    });

    if (!sealed) {
      // No marcar ISSUED: fallo de sello tras validación (p. ej. carrera).
      const still = await prisma.invoice.findUnique({
        where: { id },
        select: { fiscalStatus: true, verifactuHash: true },
      });
      if (still && isInvoiceIssued(still)) {
        console.error(
          "[issueInvoice] Estado incoherente tras sello fallido",
          { id, fiscalStatus: still.fiscalStatus, hash: still.verifactuHash }
        );
      }
      return {
        error:
          "No se pudo generar el registro fiscal. La factura sigue en borrador.",
      };
    }

    // Garantía detectable: ISSUED + hash coherentes.
    const after = await prisma.invoice.findUnique({
      where: { id },
      select: { fiscalStatus: true, verifactuHash: true },
    });
    if (
      !after?.verifactuHash ||
      after.fiscalStatus !== FISCAL_STATUS.ISSUED
    ) {
      console.error("[issueInvoice] Emisión incompleta; revirtiendo a DRAFT", {
        id,
        after,
      });
      await prisma.invoice
        .update({
          where: { id },
          data: {
            fiscalStatus: FISCAL_STATUS.DRAFT,
            verifactuHash: null,
            verifactuPreviousHash: null,
            verifactuRecordAt: null,
            verifactuQrUrl: null,
          },
        })
        .catch((err) => {
          console.error("[issueInvoice] Rollback a DRAFT falló", { id, err });
        });
      return {
        error:
          "La emisión no completó el registro fiscal. La factura sigue en borrador.",
      };
    }

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/fiscal");
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo emitir la factura",
    };
  }
}

export async function updateInvoice(
  id: string,
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  await requireAuth();
  try {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return { error: "Factura no encontrada" };
    if (existing.status === "ANULADA") {
      return { error: "No se puede editar una factura anulada" };
    }

    // ISSUED: el formulario completo no puede alterar contenido fiscal.
    // Metadatos de cobro van por setInvoiceStatus / payments / updateInvoiceNotes.
    if (isInvoiceIssued(existing)) {
      return { error: ISSUED_IMMUTABLE_ERROR };
    }

    assertInvoiceEditable(existing);

    const clientId = String(formData.get("clientId") ?? "");
    const vatOperationType = parseVatOperationType(
      formData.get("vatOperationType")
    );
    const operationKey347 = parseOperationKey347(
      formData.get("operationKey347")
    );
    const lines = applyVatOperationToLines(parseLines(formData), vatOperationType);
    const irpfRate = parseFloat(String(formData.get("irpfRate") ?? "0")) || 0;
    if (!clientId) return { error: "Selecciona un cliente" };
    if (!lines.length) return { error: "Añade al menos una línea" };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { countryCode: true },
    });
    const vatWarn = invoiceVatCountryWarning({
      vatOperationType,
      clientCountryCode: client?.countryCode,
    });
    if (
      vatWarn &&
      vatOperationType === "INTRACOMUNITARIA" &&
      formData.get("forceVatMismatch") !== "1"
    ) {
      return { error: vatWarn };
    }

    const totals = calculateDocument(lines, irpfRate);
    const issueDate = new Date(String(formData.get("issueDate")));
    const dueRaw = String(formData.get("dueDate") ?? "");
    const status = String(formData.get("status") ?? existing.status);
    const { parseInvoiceKind } = await import("@/lib/invoice-issuance");
    const invoiceKind = parseInvoiceKind(formData.get("invoiceKind"));

    const previousLines = await prisma.invoiceLine.findMany({
      where: { invoiceId: id },
      orderBy: { sortOrder: "asc" },
    });

    // Cabecera primero; si fallan las líneas, restaurar cabecera + líneas.
    const previousHeader = {
      clientId: existing.clientId,
      issueDate: existing.issueDate,
      dueDate: existing.dueDate,
      status: existing.status,
      paymentMethod: existing.paymentMethod,
      notes: existing.notes,
      vatOperationType: existing.vatOperationType,
      operationKey347: existing.operationKey347,
      invoiceKind: existing.invoiceKind,
      subtotal: existing.subtotal,
      vatAmount: existing.vatAmount,
      irpfRate: existing.irpfRate,
      irpfAmount: existing.irpfAmount,
      total: existing.total,
    };

    await prisma.invoice.update({
      where: { id },
      data: {
        clientId,
        issueDate,
        dueDate: dueRaw ? new Date(dueRaw) : null,
        status,
        paymentMethod:
          String(formData.get("paymentMethod") ?? "").trim() || "Transferencia",
        notes: String(formData.get("notes") ?? "").trim() || null,
        vatOperationType,
        operationKey347,
        invoiceKind,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        irpfRate: totals.irpfRate,
        irpfAmount: totals.irpfAmount,
        total: totals.total,
      },
    });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: id } });
    try {
      await createInvoiceLines(prisma, id, totals.lines);
    } catch (lineErr) {
      console.error(
        "[updateInvoice] Fallo recreando líneas; restaurando cabecera+líneas",
        { invoiceId: id, err: lineErr instanceof Error ? lineErr.message : lineErr }
      );
      try {
        await prisma.invoice.update({ where: { id }, data: previousHeader });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: id } });
        if (previousLines.length) {
          await prisma.invoiceLine.createMany({
            data: previousLines.map((line) => ({
              invoiceId: id,
              sortOrder: line.sortOrder,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              discountPct: line.discountPct,
              lineSubtotal: line.lineSubtotal,
              lineVat: line.lineVat,
              lineTotal: line.lineTotal,
            })),
          });
        }
      } catch (rollbackErr) {
        console.error(
          "[updateInvoice] Rollback falló — revisar factura DRAFT",
          {
            invoiceId: id,
            err:
              rollbackErr instanceof Error
                ? rollbackErr.message
                : rollbackErr,
          }
        );
      }
      throw lineErr;
    }
    await syncInvoicePaymentStatus(id);

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    redirect(`/invoices/${id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof InvoiceFiscalError) {
      return { error: err.message };
    }
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar la factura",
    };
  }
}

/** Actualiza solo metadatos no fiscales de una factura (también ISSUED). */
export async function updateInvoiceMetadata(
  id: string,
  patch: IssuedMetadataPatch
): Promise<DocFormState> {
  await requireAuth();
  try {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return { error: "Factura no encontrada" };
    if (existing.status === "ANULADA") {
      return { error: "No se puede editar una factura anulada" };
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
    if (patch.paymentMethod !== undefined) {
      data.paymentMethod = patch.paymentMethod;
    }
    if (patch.status !== undefined) {
      const allowed = ["PENDIENTE", "PAGADA", "VENCIDA"];
      if (!allowed.includes(patch.status)) {
        return { error: "Estado de cobro no válido" };
      }
      data.status = patch.status;
    }

    await prisma.invoice.update({ where: { id }, data });
    await syncInvoicePaymentStatus(id);
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return {};
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "No se pudieron guardar los metadatos",
    };
  }
}

export async function setInvoiceStatus(id: string, status: string) {
  await requireAuth();
  const allowed = ["PENDIENTE", "PAGADA", "VENCIDA", "ANULADA"];
  if (!allowed.includes(status)) throw new Error("Estado no válido");

  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: true },
  });
  if (!inv) throw new Error("Factura no encontrada");

  if (status === "ANULADA") {
    if (isInvoiceDraft(inv)) {
      throw new Error(
        "Anula solo facturas emitidas. Un borrador puede eliminarse."
      );
    }
    await prisma.invoice.update({
      where: { id },
      data: { status: "ANULADA", annulledAt: new Date() },
    });
    const { recordVerifactuAnulacion } = await import("@/lib/verifactu-events");
    await recordVerifactuAnulacion(prisma, id);
  } else if (status === "PAGADA") {
    const { remaining } = paymentTotals(inv.total, inv.payments);
    if (remaining > 0.001) {
      await prisma.invoicePayment.create({
        data: {
          invoiceId: id,
          amount: remaining,
          paidAt: new Date(),
          method: inv.paymentMethod || "Transferencia",
          notes: "Marcada como pagada",
        },
      });
    }
    await prisma.invoice.update({ where: { id }, data: { status: "PAGADA" } });
  } else if (status === "PENDIENTE") {
    // Clear payments so status stays consistent with paid amount
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: id } });
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const overdue = inv.dueDate != null && inv.dueDate < startOfToday;
    await prisma.invoice.update({
      where: { id },
      data: { status: overdue ? "VENCIDA" : "PENDIENTE" },
    });
  } else {
    await prisma.invoice.update({ where: { id }, data: { status } });
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
}

export async function addInvoicePayment(invoiceId: string, formData: FormData) {
  await requireAuth();
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!inv) throw new Error("Factura no encontrada");
  if (inv.status === "ANULADA") throw new Error("Factura anulada");

  const amount = parseFloat(String(formData.get("amount") ?? ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Importe no válido");
  }

  const { remaining } = paymentTotals(inv.total, inv.payments);
  if (amount > remaining + 0.01) {
    throw new Error(`El cobro supera lo pendiente (${remaining.toFixed(2)} €)`);
  }

  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();

  await prisma.invoicePayment.create({
    data: {
      invoiceId,
      amount,
      paidAt,
      method: String(formData.get("method") ?? "").trim() || inv.paymentMethod || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });

  await syncInvoicePaymentStatus(invoiceId);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/dashboard");
}

export async function deleteInvoicePayment(paymentId: string) {
  await requireAuth();
  const payment = await prisma.invoicePayment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) throw new Error("Cobro no encontrado");

  await prisma.invoicePayment.delete({ where: { id: paymentId } });
  await syncInvoicePaymentStatus(payment.invoiceId);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${payment.invoiceId}`);
  revalidatePath("/dashboard");
}

/** Anular mantiene el número reservado */
export async function annulInvoice(id: string) {
  await setInvoiceStatus(id, "ANULADA");
}

/**
 * Elimina solo DRAFT. ISSUED está prohibido en backend.
 * Si era el máximo de la serie, sync recupera el correlativo de forma segura.
 * ISSUED nunca se borra → su número jamás se reutiliza.
 */
export async function deleteInvoice(id: string) {
  await requireAuth();
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Factura no encontrada");
  assertInvoiceDeletable(invoice);

  await prisma.invoice.delete({ where: { id } });
  await syncInvoiceSeriesNextNumber(prisma, invoice.seriesId, invoice.number);

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect("/invoices");
}

export async function deleteInvoices(ids: string[]) {
  await requireAuth();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { deleted: 0 };

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      seriesId: true,
      number: true,
      fullNumber: true,
      fiscalStatus: true,
      verifactuHash: true,
    },
  });
  if (!invoices.length) return { deleted: 0 };

  const blocked = invoices.filter((i) => isInvoiceIssued(i));
  if (blocked.length) {
    const nums = blocked.map((b) => b.fullNumber).join(", ");
    throw new InvoiceFiscalError(
      `${ISSUED_DELETE_ERROR} Bloqueadas: ${nums}`,
      409
    );
  }

  const idList = invoices.map((i) => i.id);
  await prisma.invoice.deleteMany({ where: { id: { in: idList } } });

  const seriesIds = [...new Set(invoices.map((i) => i.seriesId))];
  for (const seriesId of seriesIds) {
    await syncInvoiceSeriesNextNumber(prisma, seriesId);
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { deleted: idList.length };
}

export type HistoricalInvoiceDraftInput = {
  fullNumber: string;
  seriesId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  clientName: string;
  clientNif?: string | null;
  clientCountryCode?: string | null;
  clientAddressStreet?: string | null;
  clientAddressCity?: string | null;
  clientAddressProvince?: string | null;
  clientAddressZip?: string | null;
  clientAddressCountry?: string | null;
  clientEmail?: string | null;
  description?: string | null;
  lines: LineInput[];
  irpfRate?: number;
  vatOperationType?: string;
  operationKey347?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  /** Marcar como cobrada e insertar cobro por el total */
  markAsPaid?: boolean;
  /** Forzar guardado pese a aviso país/IVA */
  forceVatMismatch?: boolean;
  /** PDF original guardado en Blob al parsear */
  documentId?: string | null;
};

export type HistoricalInvoiceResult =
  | { ok: true; id: string; fullNumber: string; clientCreated: boolean }
  | { ok: false; error: string; duplicateId?: string };

/**
 * Alta de factura emitida histórica: conserva el nº original,
 * no usa allocateInvoiceNumber, y sincroniza nextNumber de la serie.
 */
export async function createHistoricalInvoice(
  data: HistoricalInvoiceDraftInput
): Promise<HistoricalInvoiceResult> {
  await requireAuth();

  try {
    const fullNumber = String(data.fullNumber ?? "").trim();
    if (!fullNumber) {
      return { ok: false, error: "El número de factura es obligatorio" };
    }
    if (!data.clientName?.trim()) {
      return { ok: false, error: "El cliente es obligatorio" };
    }

    const vatOperationType = parseVatOperationType(data.vatOperationType);
    const operationKey347 =
      parseOperationKey347(data.operationKey347) ?? "B";
    const lines = applyVatOperationToLines(
      (data.lines ?? []).filter((l) => l.description?.trim()),
      vatOperationType
    );
    if (!lines.length) {
      return { ok: false, error: "Añade al menos una línea" };
    }

    const vatWarn = invoiceVatCountryWarning({
      vatOperationType,
      clientCountryCode: data.clientCountryCode,
    });
    if (vatWarn && !data.forceVatMismatch) {
      if (vatOperationType === "INTRACOMUNITARIA") {
        return { ok: false, error: vatWarn };
      }
    }

    const irpfRate = Number(data.irpfRate) || 0;
    const totals = calculateDocument(lines, irpfRate);
    const issueDate = new Date(data.issueDate);
    if (Number.isNaN(issueDate.getTime())) {
      return { ok: false, error: "Fecha no válida" };
    }
    const dueRaw = data.dueDate?.trim();
    const dueDate = dueRaw ? new Date(dueRaw) : null;

    const num = await resolveHistoricalInvoiceNumber(
      prisma,
      fullNumber,
      data.seriesId
    );

    const dup = await findDuplicateIssuedInvoice(prisma, {
      fullNumber: num.fullNumber,
      seriesId: num.seriesId,
      number: num.number,
    });
    if (dup) {
      return {
        ok: false,
        error: `Ya existe la factura ${dup.fullNumber}`,
        duplicateId: dup.id,
      };
    }

    const { clientId, created: clientCreated } = await resolveOrCreateClient(
      prisma,
      {
        name: data.clientName,
        nif: data.clientNif,
        countryCode: data.clientCountryCode,
        addressStreet: data.clientAddressStreet,
        addressCity: data.clientAddressCity,
        addressProvince: data.clientAddressProvince,
        addressZip: data.clientAddressZip,
        addressCountry: data.clientAddressCountry,
        email: data.clientEmail,
      }
    );

    const lastInSeries = await prisma.invoice.findFirst({
      where: { seriesId: num.seriesId },
      orderBy: { number: "desc" },
    });

    const noteParts = [
      data.notes?.trim() || null,
      data.description?.trim()
        ? `Import histórico: ${data.description.trim()}`
        : "Import histórico OCR",
    ].filter(Boolean);

    const markAsPaid = Boolean(data.markAsPaid);
    const invoice = await prisma.invoice.create({
      data: {
        seriesId: num.seriesId,
        seriesPrefix: num.seriesPrefix,
        number: num.number,
        fullNumber: num.fullNumber,
        clientId,
        issueDate,
        dueDate,
        status: markAsPaid ? "PAGADA" : "PENDIENTE",
        fiscalStatus: FISCAL_STATUS.ISSUED,
        invoiceKind: "FULL",
        paymentMethod:
          data.paymentMethod?.trim() || "Transferencia",
        notes: noteParts.join(" · ") || null,
        vatOperationType,
        operationKey347,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        irpfRate: totals.irpfRate,
        irpfAmount: totals.irpfAmount,
        total: totals.total,
        previousInvoiceId: lastInSeries?.id ?? null,
        sourceDocumentId: data.documentId?.trim() || null,
      },
    });
    await createInvoiceLines(prisma, invoice.id, totals.lines);

    if (markAsPaid && totals.total > 0) {
      await prisma.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: totals.total,
          paidAt: issueDate,
          method: data.paymentMethod?.trim() || "Transferencia",
          notes: "Cobro al importar histórico",
        },
      });
    }

    await applyVerifactuSeal(prisma, invoice.id, { markIssued: true });
    await syncInvoiceSeriesNextNumber(prisma, num.seriesId);

    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/stats");
    revalidatePath("/clients");

    return {
      ok: true,
      id: invoice.id,
      fullNumber: invoice.fullNumber,
      clientCreated,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "No se pudo importar la factura",
    };
  }
}
