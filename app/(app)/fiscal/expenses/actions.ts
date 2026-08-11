"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  isExpenseIntracom,
  parseExpenseVatOperationType,
} from "@/lib/fiscal";

export type ExpenseFormState = {
  error?: string;
  duplicateId?: string;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeInvoiceNumber(raw: string | null | undefined): string | null {
  const v = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  return v || null;
}

function normalizeNif(raw: string | null | undefined): string | null {
  const v = String(raw ?? "")
    .trim()
    .replace(/[\s.-]/g, "")
    .toUpperCase();
  return v || null;
}

function parseExpenseForm(formData: FormData) {
  const subtotal =
    parseFloat(String(formData.get("subtotal") ?? "0").replace(",", ".")) || 0;
  const vatOperationType = parseExpenseVatOperationType(
    formData.get("vatOperationType")
  );
  const intracom = isExpenseIntracom(vatOperationType);
  let vatRate =
    parseFloat(String(formData.get("vatRate") ?? "21").replace(",", ".")) || 0;
  // Intracom nunca a 0 %: hace falta tipo español para casillas 10/11 y 36/37
  if (intracom && vatRate <= 0) vatRate = 21;
  const vatAmountRaw = String(formData.get("vatAmount") ?? "").trim();
  const vatAmount = vatAmountRaw
    ? parseFloat(vatAmountRaw.replace(",", ".")) || 0
    : round2(subtotal * (vatRate / 100));
  const resolvedVatAmount =
    intracom && vatAmount <= 0
      ? round2(subtotal * (vatRate / 100))
      : vatAmount;
  const totalRaw = String(formData.get("total") ?? "").trim();
  // Intracom: lo pagado al proveedor suele ser la base (ISP); la cuota 11/37 es autorrepercutida
  const total = totalRaw
    ? parseFloat(totalRaw.replace(",", ".")) || 0
    : intracom
      ? round2(subtotal)
      : round2(subtotal + resolvedVatAmount);

  const issueDateRaw = String(formData.get("issueDate") ?? "").trim();
  return {
    issueDate: issueDateRaw ? new Date(issueDateRaw) : new Date(),
    supplierName: String(formData.get("supplierName") ?? "").trim(),
    supplierNif: String(formData.get("supplierNif") ?? "").trim() || null,
    invoiceNumber: normalizeInvoiceNumber(
      String(formData.get("invoiceNumber") ?? "")
    ),
    description: String(formData.get("description") ?? "").trim() || null,
    category: String(formData.get("category") ?? "OTROS").trim() || "OTROS",
    vatOperationType,
    subtotal,
    vatRate,
    vatAmount: resolvedVatAmount,
    total: intracom ? round2(subtotal) : total,
    deductible:
      formData.get("deductible") === "on" ||
      formData.get("deductible") === "1",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function validate(data: ReturnType<typeof parseExpenseForm>) {
  if (!data.supplierName) return "El proveedor es obligatorio";
  if (!(data.issueDate instanceof Date) || Number.isNaN(data.issueDate.getTime())) {
    return "Fecha no válida";
  }
  if (data.subtotal < 0) return "La base no puede ser negativa";
  if (data.vatAmount < 0) return "El IVA no puede ser negativo";
  const nif = String(data.supplierNif ?? "").trim();
  if (data.vatOperationType === "INTRACOMUNITARIA" && !nif) {
    return "En compras intracomunitarias el NIF-IVA del proveedor es obligatorio (modelo 349)";
  }
  return null;
}

/** Misma factura del mismo proveedor (por NIF o nombre). */
async function findDuplicateExpense(
  data: ReturnType<typeof parseExpenseForm>,
  excludeId?: string
) {
  if (!data.invoiceNumber) return null;

  const candidates = await prisma.expense.findMany({
    where: {
      invoiceNumber: { equals: data.invoiceNumber, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      supplierName: true,
      supplierNif: true,
      invoiceNumber: true,
      issueDate: true,
    },
    take: 20,
  });

  const nif = normalizeNif(data.supplierNif);
  const name = data.supplierName.trim().toLowerCase();

  return (
    candidates.find((c) => {
      const cNif = normalizeNif(c.supplierNif);
      if (nif && cNif && nif === cNif) return true;
      return c.supplierName.trim().toLowerCase() === name;
    }) ?? null
  );
}

function duplicateMessage(invoiceNumber: string | null) {
  return `Ya existe un gasto con la factura ${invoiceNumber ?? "indicada"} del mismo proveedor.`;
}

type ExpenseWriteData = ReturnType<typeof parseExpenseForm>;

async function insertExpense(data: ExpenseWriteData): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string; duplicateId?: string }
> {
  const err = validate(data);
  if (err) return { ok: false, error: err };

  const dup = await findDuplicateExpense(data);
  if (dup) {
    return {
      ok: false,
      error: duplicateMessage(dup.invoiceNumber),
      duplicateId: dup.id,
    };
  }

  const created = await prisma.expense.create({ data });
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/expenses");
  return { ok: true, id: created.id };
}

export type ExpenseDraftInput = {
  issueDate: string;
  supplierName: string;
  supplierNif?: string | null;
  invoiceNumber?: string | null;
  description?: string | null;
  category?: string;
  vatOperationType?: string;
  subtotal: number;
  vatRate: number;
  vatAmount?: number;
  total?: number;
  deductible?: boolean;
  notes?: string | null;
};

function fromDraftInput(input: ExpenseDraftInput): ExpenseWriteData {
  const subtotal = round2(Math.max(0, Number(input.subtotal) || 0));
  const vatOperationType = parseExpenseVatOperationType(input.vatOperationType);
  const intracom = isExpenseIntracom(vatOperationType);
  let vatRate = Number(input.vatRate) || 0;
  if (intracom && vatRate <= 0) vatRate = 21;
  let vatAmount =
    input.vatAmount != null
      ? round2(Math.max(0, Number(input.vatAmount) || 0))
      : round2(subtotal * (vatRate / 100));
  if (intracom && vatAmount <= 0) {
    vatAmount = round2(subtotal * (vatRate / 100));
  }
  const total = intracom
    ? subtotal
    : input.total != null
      ? round2(Math.max(0, Number(input.total) || 0))
      : round2(subtotal + vatAmount);
  const issueDateRaw = String(input.issueDate ?? "").trim();

  return {
    issueDate: issueDateRaw ? new Date(issueDateRaw) : new Date(),
    supplierName: String(input.supplierName ?? "").trim(),
    supplierNif: String(input.supplierNif ?? "").trim() || null,
    invoiceNumber: normalizeInvoiceNumber(input.invoiceNumber),
    description: String(input.description ?? "").trim() || null,
    category: String(input.category ?? "OTROS").trim() || "OTROS",
    vatOperationType,
    subtotal,
    vatRate,
    vatAmount,
    total,
    deductible: input.deductible !== false,
    notes: String(input.notes ?? "").trim() || null,
  };
}

/** Alta sin redirect — para cola de varias facturas. */
export async function createExpenseFromDraft(
  input: ExpenseDraftInput
): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string; duplicateId?: string }
> {
  await requireAuth();
  try {
    return await insertExpense(fromDraftInput(input));
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear",
    };
  }
}

export async function createExpense(
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  await requireAuth();
  try {
    const data = parseExpenseForm(formData);
    data.deductible = formData.has("deductible");
    const result = await insertExpense(data);
    if (!result.ok) {
      return { error: result.error, duplicateId: result.duplicateId };
    }
    redirect("/fiscal/expenses");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Error al crear" };
  }
}

export async function updateExpense(
  id: string,
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  await requireAuth();
  try {
    const data = parseExpenseForm(formData);
    const err = validate(data);
    if (err) return { error: err };

    const dup = await findDuplicateExpense(data, id);
    if (dup) {
      return {
        error: duplicateMessage(dup.invoiceNumber),
        duplicateId: dup.id,
      };
    }

    await prisma.expense.update({
      where: { id },
      data: {
        ...data,
        deductible: formData.has("deductible"),
      },
    });
    revalidatePath("/fiscal");
    revalidatePath("/fiscal/expenses");
    revalidatePath(`/fiscal/expenses/${id}/edit`);
    redirect("/fiscal/expenses");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Error al guardar" };
  }
}

export async function deleteExpense(id: string) {
  await requireAuth();
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/expenses");
  redirect("/fiscal/expenses");
}
