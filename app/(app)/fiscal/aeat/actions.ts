"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { createFiscalDocument, blobConfigured } from "@/lib/fiscal-blob";

function revalidateAeat() {
  revalidatePath("/fiscal/aeat");
  revalidatePath("/fiscal/archive");
  revalidatePath("/dashboard");
  revalidatePath("/fiscal/guide");
}

export async function createAeatCommunication(formData: FormData): Promise<void> {
  await requireAuth();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) throw new Error("El asunto es obligatorio");

  const kind = String(formData.get("kind") ?? "COMUNICACION").trim();
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const status = String(formData.get("status") ?? "ABIERTA").trim() || "ABIERTA";

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
      status,
      occurredAt: occurredAtRaw
        ? new Date(`${occurredAtRaw}T12:00:00`)
        : new Date(),
      dueAt: dueAtRaw ? new Date(`${dueAtRaw}T23:59:59`) : null,
      respondedAt: status === "RESPONDIDA" || status === "CERRADA" ? new Date() : null,
      documentId,
    },
  });

  revalidateAeat();
}

export async function markAeatResponded(id: string) {
  await requireAuth();
  await prisma.aeatCommunication.update({
    where: { id },
    data: {
      status: "RESPONDIDA",
      respondedAt: new Date(),
    },
  });
  revalidateAeat();
}

export async function markAeatClosed(id: string) {
  await requireAuth();
  await prisma.aeatCommunication.update({
    where: { id },
    data: {
      status: "CERRADA",
      respondedAt: new Date(),
    },
  });
  revalidateAeat();
}

export async function deleteAeatCommunication(id: string) {
  await requireAuth();
  await prisma.aeatCommunication.delete({ where: { id } });
  revalidateAeat();
}
