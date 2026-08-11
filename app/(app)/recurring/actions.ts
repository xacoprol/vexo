"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import type { LineInput } from "@/lib/calculations";
import {
  computeInitialNextRun,
  isZeroVatOperation,
  parseVatOperationType,
  type Frequency,
} from "@/lib/recurring";

export type RecurringFormState = { error?: string };

function parseLines(formData: FormData): LineInput[] {
  const raw = String(formData.get("linesJson") ?? "[]");
  return (JSON.parse(raw) as LineInput[]).filter((l) => l.description?.trim());
}

function parseLocalDate(raw: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
      0
    );
  }
  return new Date(raw);
}

function parseTemplateFields(formData: FormData) {
  const frequency = String(formData.get("frequency") ?? "ANUAL") as Frequency;
  const intervalCount =
    parseInt(String(formData.get("intervalCount") ?? "1"), 10) || 1;
  const dayOfMonth = parseInt(String(formData.get("dayOfMonth") ?? "1"), 10);
  const startDate = parseLocalDate(String(formData.get("startDate") ?? ""));
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const endDate = endRaw ? parseLocalDate(endRaw) : null;
  const vatOperationType = parseVatOperationType(
    formData.get("vatOperationType")
  );

  return {
    name: String(formData.get("name") ?? "").trim(),
    clientId: String(formData.get("clientId") ?? ""),
    seriesId: String(formData.get("seriesId") ?? ""),
    frequency,
    intervalCount,
    dayOfMonth,
    startDate,
    endDate,
    notes: String(formData.get("notes") ?? "").trim() || null,
    paymentMethod: String(formData.get("paymentMethod") ?? "").trim() || null,
    bankIban: String(formData.get("bankIban") ?? "").trim() || null,
    irpfRate: parseFloat(String(formData.get("irpfRate") ?? "0")) || 0,
    vatOperationType,
    cashAccounting: formData.get("cashAccounting") === "on",
    operationKey: String(formData.get("operationKey") ?? "").trim() || null,
    operationKey347:
      String(formData.get("operationKey347") ?? "").trim() || null,
    lines: parseLines(formData),
  };
}

export async function createRecurring(
  _prev: RecurringFormState,
  formData: FormData
): Promise<RecurringFormState> {
  await requireAuth();
  try {
    const data = parseTemplateFields(formData);

    if (!data.name) return { error: "El nombre es obligatorio" };
    if (!data.clientId) return { error: "Selecciona un cliente" };
    if (!data.seriesId) return { error: "Selecciona una serie" };
    if (!data.lines.length) return { error: "Añade al menos una línea" };
    if (Number.isNaN(data.startDate.getTime())) {
      return { error: "Fecha desde no válida" };
    }

    const nextRunDate = computeInitialNextRun(
      data.startDate,
      data.dayOfMonth,
      data.frequency,
      data.intervalCount,
      new Date(),
      data.endDate
    );

    const forceZeroVat = isZeroVatOperation(data.vatOperationType);

    // Neon HTTP: sin nested create (requiere transacción)
    const template = await prisma.recurringInvoiceTemplate.create({
      data: {
        name: data.name,
        clientId: data.clientId,
        seriesId: data.seriesId,
        frequency: data.frequency,
        intervalCount: data.intervalCount,
        dayOfMonth: data.dayOfMonth,
        startDate: data.startDate,
        endDate: data.endDate,
        status: "ACTIVA",
        notes: data.notes,
        paymentMethod: data.paymentMethod,
        bankIban: data.bankIban,
        irpfRate: data.irpfRate,
        vatOperationType: data.vatOperationType,
        cashAccounting: data.cashAccounting,
        operationKey: data.operationKey,
        operationKey347: data.operationKey347,
        nextRunDate,
      },
    });

    for (const [i, l] of data.lines.entries()) {
      await prisma.recurringLine.create({
        data: {
          templateId: template.id,
          sortOrder: i,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatRate: forceZeroVat ? 0 : l.vatRate,
          discountPct: l.discountPct,
        },
      });
    }

    revalidatePath("/recurring");
    redirect(`/recurring/${template.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "No se pudo crear la periódica",
    };
  }
}

export async function updateRecurring(
  id: string,
  _prev: RecurringFormState,
  formData: FormData
): Promise<RecurringFormState> {
  await requireAuth();
  try {
    const data = parseTemplateFields(formData);

    if (!data.name) return { error: "El nombre es obligatorio" };
    if (!data.lines.length) return { error: "Añade al menos una línea" };
    if (Number.isNaN(data.startDate.getTime())) {
      return { error: "Fecha desde no válida" };
    }

    const nextRunDate = computeInitialNextRun(
      data.startDate,
      data.dayOfMonth,
      data.frequency,
      data.intervalCount,
      new Date(),
      data.endDate
    );

    const forceZeroVat = isZeroVatOperation(data.vatOperationType);

    await prisma.recurringLine.deleteMany({ where: { templateId: id } });
    await prisma.recurringInvoiceTemplate.update({
      where: { id },
      data: {
        name: data.name,
        clientId: data.clientId,
        seriesId: data.seriesId,
        frequency: data.frequency,
        intervalCount: data.intervalCount,
        dayOfMonth: data.dayOfMonth,
        startDate: data.startDate,
        endDate: data.endDate,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
        bankIban: data.bankIban,
        irpfRate: data.irpfRate,
        vatOperationType: data.vatOperationType,
        cashAccounting: data.cashAccounting,
        operationKey: data.operationKey,
        operationKey347: data.operationKey347,
        nextRunDate,
      },
    });
    for (const [i, l] of data.lines.entries()) {
      await prisma.recurringLine.create({
        data: {
          templateId: id,
          sortOrder: i,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatRate: forceZeroVat ? 0 : l.vatRate,
          discountPct: l.discountPct,
        },
      });
    }

    revalidatePath("/recurring");
    revalidatePath(`/recurring/${id}`);
    redirect(`/recurring/${id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar la periódica",
    };
  }
}

export async function setRecurringStatus(
  id: string,
  status: "ACTIVA" | "PAUSADA" | "FINALIZADA"
) {
  await requireAuth();
  await prisma.recurringInvoiceTemplate.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/recurring");
  revalidatePath(`/recurring/${id}`);
}

export async function deleteRecurring(id: string) {
  await requireAuth();
  const template = await prisma.recurringInvoiceTemplate.findUnique({
    where: { id },
  });
  if (!template) throw new Error("Plantilla no encontrada");

  // No updateMany (rompe con PrismaNeonHTTP). Los FK de factura/proforma
  // (recurringTemplateId) son ON DELETE SET NULL: los documentos se conservan.
  await prisma.recurringInvoiceTemplate.delete({ where: { id } });

  revalidatePath("/recurring");
  revalidatePath("/invoices");
  revalidatePath("/quotes");
  redirect("/recurring");
}

export async function deleteRecurrings(ids: string[]) {
  await requireAuth();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { deleted: 0 };

  const result = await prisma.recurringInvoiceTemplate.deleteMany({
    where: { id: { in: unique } },
  });

  revalidatePath("/recurring");
  revalidatePath("/invoices");
  revalidatePath("/quotes");
  return { deleted: result.count };
}
