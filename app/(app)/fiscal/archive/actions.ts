"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  createFiscalDocument,
  deleteFiscalDocument,
  blobConfigured,
  type FiscalDocCategory,
} from "@/lib/fiscal-blob";
import {
  classifyGestoriaFileName,
  titleForGestoriaFile,
} from "@/lib/gestoria-classify";

const CATEGORIES: FiscalDocCategory[] = [
  "FILING",
  "BOOK",
  "CENSUS",
  "PAYMENT",
  "AEAT",
  "IRPF",
  "OTHER",
];

export async function uploadFiscalArchiveDocument(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAuth();
  if (!blobConfigured()) {
    return {
      ok: false,
      error: "Falta BLOB_READ_WRITE_TOKEN en el entorno (Vercel Blob).",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona un archivo" };
  }

  const classified = classifyGestoriaFileName(file.name);
  const categoryRaw = String(formData.get("category") ?? classified.category);
  const category = CATEGORIES.includes(categoryRaw as FiscalDocCategory)
    ? (categoryRaw as FiscalDocCategory)
    : classified.category;

  let year: number | null =
    classified.kind === "filing" || classified.kind === "book"
      ? classified.year
      : classified.kind === "irpf" || classified.kind === "census"
        ? classified.year
        : null;
  const yearForm = parseInt(String(formData.get("year") ?? ""), 10);
  if (Number.isFinite(yearForm) && yearForm >= 2000) year = yearForm;

  let quarter: number | null =
    classified.kind === "filing" ? classified.quarter : null;
  const qForm = parseInt(String(formData.get("quarter") ?? ""), 10);
  if (qForm >= 1 && qForm <= 4) quarter = qForm;

  const modelType =
    classified.kind === "filing"
      ? classified.modelType
      : String(formData.get("modelType") ?? "") || null;

  const title =
    String(formData.get("title") ?? "").trim() ||
    titleForGestoriaFile(file.name, classified);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await createFiscalDocument({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      category,
      title,
      year,
      quarter,
      modelType,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    revalidatePath("/fiscal/archive");
    return { ok: true, id: doc.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo subir",
    };
  }
}

export async function removeFiscalArchiveDocument(id: string) {
  await requireAuth();
  await deleteFiscalDocument(id);
  revalidatePath("/fiscal/archive");
}

export async function listFiscalDocuments(category?: string) {
  await requireAuth();
  return prisma.fiscalDocument.findMany({
    where: category ? { category } : undefined,
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
}
