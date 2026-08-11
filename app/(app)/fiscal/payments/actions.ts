"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { createFiscalDocument, blobConfigured } from "@/lib/fiscal-blob";

function revalidatePayments() {
  revalidatePath("/fiscal/payments");
  revalidatePath("/fiscal/archive");
  revalidatePath("/fiscal/filings");
  revalidatePath("/fiscal/guide");
}

export async function createTaxPayment(formData: FormData): Promise<void> {
  await requireAuth();
  const amount =
    parseFloat(String(formData.get("amount") ?? "0").replace(",", ".")) || 0;
  const yearRaw = parseInt(String(formData.get("year") ?? ""), 10);
  const quarterRaw = parseInt(String(formData.get("quarter") ?? ""), 10);
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  let modelType = String(formData.get("modelType") ?? "").trim() || null;
  const nrc = String(formData.get("nrc") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const filingIdRaw = String(formData.get("filingId") ?? "").trim();
  let filingId: string | null = filingIdRaw || null;
  let year = Number.isFinite(yearRaw) ? yearRaw : null;
  let quarter = quarterRaw >= 1 && quarterRaw <= 4 ? quarterRaw : null;

  if (filingId) {
    const filing = await prisma.fiscalFiling.findUnique({
      where: { id: filingId },
    });
    if (filing) {
      modelType = filing.modelType;
      year = filing.year;
      quarter = filing.quarter;
    } else {
      filingId = null;
    }
  }

  const statusRaw = String(formData.get("status") ?? "").trim();
  const status = statusRaw || "PAGADO";

  let documentId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0 && blobConfigured()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await createFiscalDocument({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      category: "PAYMENT",
      title: `Pago ${modelType ?? "AEAT"} ${year ?? ""}`.trim(),
      year,
      quarter,
      modelType,
      filingId,
    });
    documentId = doc.id;
  }

  await prisma.taxPayment.create({
    data: {
      modelType,
      year,
      quarter,
      amount: new Prisma.Decimal(amount),
      paidAt: paidAtRaw ? new Date(`${paidAtRaw}T12:00:00`) : null,
      nrc,
      status,
      filingId,
      documentId,
      notes,
    },
  });

  revalidatePayments();
}

export async function deleteTaxPayment(id: string) {
  await requireAuth();
  await prisma.taxPayment.delete({ where: { id } });
  revalidatePayments();
}
