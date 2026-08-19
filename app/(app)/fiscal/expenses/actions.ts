"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  isExpenseIntracom,
  isExpenseReverseCharge,
  parseExpenseVatOperationType,
} from "@/lib/fiscal";
import { buildLinearAmortization } from "@/lib/investment-amortization";

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
  const reverseCharge = isExpenseReverseCharge(vatOperationType);
  let vatRate =
    parseFloat(String(formData.get("vatRate") ?? "21").replace(",", ".")) || 0;
  if (reverseCharge && vatRate <= 0) vatRate = 21;
  const vatAmountRaw = String(formData.get("vatAmount") ?? "").trim();
  const vatAmount = vatAmountRaw
    ? parseFloat(vatAmountRaw.replace(",", ".")) || 0
    : round2(subtotal * (vatRate / 100));
  const resolvedVatAmount =
    reverseCharge && vatAmount <= 0
      ? round2(subtotal * (vatRate / 100))
      : vatAmount;
  const totalRaw = String(formData.get("total") ?? "").trim();
  const total = totalRaw
    ? parseFloat(totalRaw.replace(",", ".")) || 0
    : reverseCharge
      ? round2(subtotal)
      : round2(subtotal + resolvedVatAmount);

  const issueDateRaw = String(formData.get("issueDate") ?? "").trim();
  const usefulLifeRaw = parseInt(
    String(formData.get("usefulLifeYears") ?? "4"),
    10
  );
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
    total: reverseCharge ? round2(subtotal) : total,
    deductible:
      formData.get("deductible") === "on" ||
      formData.get("deductible") === "1",
    isInvestment:
      formData.get("isInvestment") === "on" ||
      formData.get("isInvestment") === "1",
    usefulLifeYears:
      Number.isFinite(usefulLifeRaw) && usefulLifeRaw > 0
        ? Math.min(40, usefulLifeRaw)
        : 4,
    notes: String(formData.get("notes") ?? "").trim() || null,
    documentId: String(formData.get("documentId") ?? "").trim() || null,
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

async function rebuildAssetAmortizations(
  assetId: string,
  base: number,
  usefulLifeYears: number,
  startYear: number
) {
  const amort = buildLinearAmortization({
    base,
    usefulLifeYears,
    startYear,
  });
  await prisma.investmentAmortization.deleteMany({ where: { assetId } });
  for (const a of amort) {
    await prisma.investmentAmortization.create({
      data: {
        assetId,
        year: a.year,
        amount: new Prisma.Decimal(a.amount),
      },
    });
  }
}

/**
 * Crea/actualiza el bien enlazado, o lo borra si se desmarca.
 * Intracom: el IVA del bien va a 0 en 30/31 (la AIB ya está en el gasto).
 */
async function syncInvestmentAsset(
  expenseId: string,
  data: ExpenseWriteData,
  existingAssetId: string | null
): Promise<string | null> {
  if (!data.isInvestment) {
    if (existingAssetId) {
      await prisma.expense.update({
        where: { id: expenseId },
        data: { investmentAssetId: null, isInvestment: false },
      });
      await prisma.investmentAsset.delete({ where: { id: existingAssetId } }).catch(() => null);
    }
    return null;
  }

  const reverseCharge = isExpenseReverseCharge(data.vatOperationType);
  const description =
    data.description?.trim() ||
    `Bien · ${data.supplierName}${data.invoiceNumber ? ` · ${data.invoiceNumber}` : ""}`;
  const startYear = data.issueDate.getFullYear();
  // 30/31 solo interiores; AIB/extracom queda en el gasto (10/11 o 16/17)
  const assetVat = reverseCharge ? 0 : data.vatAmount;
  const payload = {
    description,
    supplierName: data.supplierName,
    supplierNif: data.supplierNif,
    invoiceNumber: data.invoiceNumber,
    purchaseDate: data.issueDate,
    base: new Prisma.Decimal(data.subtotal),
    vatAmount: new Prisma.Decimal(assetVat),
    vatOperationType: data.vatOperationType,
    usefulLifeYears: data.usefulLifeYears,
    startYear,
    documentId: data.documentId || null,
    notes: data.notes,
  };

  if (existingAssetId) {
    await prisma.investmentAsset.update({
      where: { id: existingAssetId },
      data: payload,
    });
    await rebuildAssetAmortizations(
      existingAssetId,
      data.subtotal,
      data.usefulLifeYears,
      startYear
    );
    await prisma.expense.update({
      where: { id: expenseId },
      data: { isInvestment: true, investmentAssetId: existingAssetId },
    });
    return existingAssetId;
  }

  const asset = await prisma.investmentAsset.create({ data: payload });
  await rebuildAssetAmortizations(
    asset.id,
    data.subtotal,
    data.usefulLifeYears,
    startYear
  );
  await prisma.expense.update({
    where: { id: expenseId },
    data: { isInvestment: true, investmentAssetId: asset.id },
  });
  return asset.id;
}

function revalidateExpensePaths(id?: string) {
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/expenses");
  revalidatePath("/fiscal/assets");
  revalidatePath("/fiscal/303");
  revalidatePath("/fiscal/130");
  if (id) revalidatePath(`/fiscal/expenses/${id}/edit`);
}

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

  const created = await prisma.expense.create({
    data: {
      issueDate: data.issueDate,
      supplierName: data.supplierName,
      supplierNif: data.supplierNif,
      invoiceNumber: data.invoiceNumber,
      description: data.description,
      category: data.category,
      vatOperationType: data.vatOperationType,
      subtotal: data.subtotal,
      vatRate: data.vatRate,
      vatAmount: data.vatAmount,
      total: data.total,
      deductible: data.deductible,
      isInvestment: data.isInvestment,
      notes: data.notes,
      documentId: data.documentId || null,
    },
  });
  await syncInvestmentAsset(created.id, data, null);
  revalidateExpensePaths();
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
  isInvestment?: boolean;
  usefulLifeYears?: number;
  notes?: string | null;
  documentId?: string | null;
};

function fromDraftInput(input: ExpenseDraftInput): ExpenseWriteData {
  const subtotal = round2(Math.max(0, Number(input.subtotal) || 0));
  const vatOperationType = parseExpenseVatOperationType(input.vatOperationType);
  const reverseCharge = isExpenseReverseCharge(vatOperationType);
  let vatRate = Number(input.vatRate) || 0;
  if (reverseCharge && vatRate <= 0) vatRate = 21;
  let vatAmount =
    input.vatAmount != null
      ? round2(Math.max(0, Number(input.vatAmount) || 0))
      : round2(subtotal * (vatRate / 100));
  if (reverseCharge && vatAmount <= 0) {
    vatAmount = round2(subtotal * (vatRate / 100));
  }
  const total = reverseCharge
    ? subtotal
    : input.total != null
      ? round2(Math.max(0, Number(input.total) || 0))
      : round2(subtotal + vatAmount);
  const issueDateRaw = String(input.issueDate ?? "").trim();
  const usefulLifeRaw = Number(input.usefulLifeYears) || 4;

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
    isInvestment: Boolean(input.isInvestment),
    usefulLifeYears:
      Number.isFinite(usefulLifeRaw) && usefulLifeRaw > 0
        ? Math.min(40, Math.floor(usefulLifeRaw))
        : 4,
    notes: String(input.notes ?? "").trim() || null,
    documentId: String(input.documentId ?? "").trim() || null,
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
    data.isInvestment = formData.has("isInvestment");
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
    data.deductible = formData.has("deductible");
    data.isInvestment = formData.has("isInvestment");
    const err = validate(data);
    if (err) return { error: err };

    const dup = await findDuplicateExpense(data, id);
    if (dup) {
      return {
        error: duplicateMessage(dup.invoiceNumber),
        duplicateId: dup.id,
      };
    }

    const existing = await prisma.expense.findUnique({
      where: { id },
      select: { investmentAssetId: true },
    });
    if (!existing) return { error: "Gasto no encontrado" };

    await prisma.expense.update({
      where: { id },
      data: {
        issueDate: data.issueDate,
        supplierName: data.supplierName,
        supplierNif: data.supplierNif,
        invoiceNumber: data.invoiceNumber,
        description: data.description,
        category: data.category,
        vatOperationType: data.vatOperationType,
        subtotal: data.subtotal,
        vatRate: data.vatRate,
        vatAmount: data.vatAmount,
        total: data.total,
        notes: data.notes,
        deductible: data.deductible,
        isInvestment: data.isInvestment,
        ...(data.documentId ? { documentId: data.documentId } : {}),
      },
    });
    await syncInvestmentAsset(id, data, existing.investmentAssetId);
    revalidateExpensePaths(id);
    redirect("/fiscal/expenses");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Error al guardar" };
  }
}

export async function deleteExpense(id: string) {
  await requireAuth();
  const existing = await prisma.expense.findUnique({
    where: { id },
    select: { investmentAssetId: true },
  });
  await prisma.expense.delete({ where: { id } });
  if (existing?.investmentAssetId) {
    await prisma.investmentAsset
      .delete({ where: { id: existing.investmentAssetId } })
      .catch(() => null);
  }
  revalidateExpensePaths();
  redirect("/fiscal/expenses");
}
