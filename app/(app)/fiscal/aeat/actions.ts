"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { createFiscalDocument, blobConfigured } from "@/lib/fiscal-blob";

function revalidateAeat() {
  revalidatePath("/fiscal/aeat");
  revalidatePath("/fiscal/archive");
}

export async function createAeatCommunication(formData: FormData): Promise<void> {
  await requireAuth();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) throw new Error("El asunto es obligatorio");

  const kind = String(formData.get("kind") ?? "COMUNICACION").trim();
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();

  let documentId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0 && blobConfigured()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await createFiscalDocument({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      category: "AEAT",
      title: subject,
    });
    documentId = doc.id;
  }

  await prisma.aeatCommunication.create({
    data: {
      subject,
      kind,
      summary,
      occurredAt: occurredAtRaw
        ? new Date(`${occurredAtRaw}T12:00:00`)
        : new Date(),
      documentId,
    },
  });

  revalidateAeat();
}

export async function deleteAeatCommunication(id: string) {
  await requireAuth();
  await prisma.aeatCommunication.delete({ where: { id } });
  revalidateAeat();
}
