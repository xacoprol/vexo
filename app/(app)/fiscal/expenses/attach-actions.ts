"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { stashSourceDocument } from "@/lib/fiscal-blob";
import type { ExpenseAttachCandidate } from "@/lib/expense-document-match";

export async function listExpensesMissingDocument(): Promise<
  ExpenseAttachCandidate[]
> {
  await requireAuth();
  const rows = await prisma.expense.findMany({
    where: { documentId: null },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      issueDate: true,
      supplierName: true,
      invoiceNumber: true,
      total: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    issueDate: r.issueDate.toISOString().slice(0, 10),
    supplierName: r.supplierName,
    invoiceNumber: r.invoiceNumber,
    total: Number(r.total),
  }));
}

export type AttachExpenseDocumentsResult =
  | {
      ok: true;
      attached: number;
      skipped: number;
      errors: { fileName: string; error: string }[];
    }
  | { ok: false; error: string };

/**
 * Adjunta archivos a gastos existentes (solo si aún no tienen documentId).
 * FormData: files[] + assignments JSON [{ fileName, expenseId }]
 */
export async function attachExpenseDocuments(
  formData: FormData
): Promise<AttachExpenseDocumentsResult> {
  await requireAuth();

  let assignments: { fileName: string; expenseId: string }[] = [];
  try {
    const raw = String(formData.get("assignments") ?? "[]");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("bad");
    assignments = parsed
      .map((a) => ({
        fileName: String((a as { fileName?: string }).fileName ?? "").trim(),
        expenseId: String((a as { expenseId?: string }).expenseId ?? "").trim(),
      }))
      .filter((a) => a.fileName && a.expenseId);
  } catch {
    return { ok: false, error: "Asignaciones inválidas" };
  }

  if (!assignments.length) {
    return { ok: false, error: "No hay archivos asignados a gastos" };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const byName = new Map<string, File>();
  for (const f of files) {
    byName.set(f.name, f);
  }

  let attached = 0;
  let skipped = 0;
  const errors: { fileName: string; error: string }[] = [];
  const usedExpenses = new Set<string>();

  for (const a of assignments) {
    if (usedExpenses.has(a.expenseId)) {
      errors.push({
        fileName: a.fileName,
        error: "Gasto ya usado en este lote",
      });
      skipped += 1;
      continue;
    }
    const file = byName.get(a.fileName);
    if (!file || file.size <= 0) {
      errors.push({ fileName: a.fileName, error: "Archivo no recibido" });
      skipped += 1;
      continue;
    }

    const expense = await prisma.expense.findUnique({
      where: { id: a.expenseId },
      select: {
        id: true,
        documentId: true,
        issueDate: true,
        supplierName: true,
        invoiceNumber: true,
      },
    });
    if (!expense) {
      errors.push({ fileName: a.fileName, error: "Gasto no encontrado" });
      skipped += 1;
      continue;
    }
    if (expense.documentId) {
      errors.push({
        fileName: a.fileName,
        error: "El gasto ya tiene PDF adjunto",
      });
      skipped += 1;
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const documentId = await stashSourceDocument({
        buffer,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        category: "EXPENSE",
        title: `${expense.supplierName} · ${expense.invoiceNumber ?? file.name}`,
        year: expense.issueDate.getFullYear(),
        notes: `Adjunto retrospectivo · ${file.name}`,
      });
      if (!documentId) {
        errors.push({
          fileName: a.fileName,
          error: "Blob no configurado: no se pudo guardar el archivo",
        });
        skipped += 1;
        continue;
      }
      await prisma.expense.update({
        where: { id: expense.id },
        data: { documentId },
      });
      usedExpenses.add(expense.id);
      attached += 1;
    } catch (e) {
      errors.push({
        fileName: a.fileName,
        error: e instanceof Error ? e.message : "Error al subir",
      });
      skipped += 1;
    }
  }

  revalidatePath("/fiscal/expenses");
  revalidatePath("/fiscal/expenses/attach");

  return { ok: true, attached, skipped, errors: errors.slice(0, 30) };
}

/** Adjunta un único archivo a un gasto (desde edición). */
export async function attachDocumentToExpense(
  expenseId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: "Selecciona un archivo" };
  }

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      documentId: true,
      issueDate: true,
      supplierName: true,
      invoiceNumber: true,
    },
  });
  if (!expense) return { ok: false, error: "Gasto no encontrado" };
  if (expense.documentId) {
    return { ok: false, error: "Este gasto ya tiene documento" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const documentId = await stashSourceDocument({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      category: "EXPENSE",
      title: `${expense.supplierName} · ${expense.invoiceNumber ?? file.name}`,
      year: expense.issueDate.getFullYear(),
      notes: `Adjunto retrospectivo · ${file.name}`,
    });
    if (!documentId) {
      return {
        ok: false,
        error: "No se pudo guardar el archivo (Blob no configurado)",
      };
    }
    await prisma.expense.update({
      where: { id: expense.id },
      data: { documentId },
    });
    revalidatePath("/fiscal/expenses");
    revalidatePath(`/fiscal/expenses/${expense.id}/edit`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al adjuntar",
    };
  }
}
