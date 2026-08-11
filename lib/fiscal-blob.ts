import { put, del, get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export type FiscalDocCategory =
  | "FILING"
  | "BOOK"
  | "CENSUS"
  | "PAYMENT"
  | "AEAT"
  | "IRPF"
  | "OTHER";

export function blobConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token && token !== "[SENSITIVE]" && token !== "Hidden") return true;
  return Boolean(process.env.BLOB_STORE_ID?.trim());
}

/** Enlace interno (requiere sesión) para servir blobs privados. */
export function fiscalDocumentHref(id: string): string {
  return `/api/fiscal/documents/${id}`;
}

function sanitizePathSegment(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export async function uploadFiscalBlob(opts: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder?: string;
}): Promise<{ url: string; pathname: string }> {
  if (!blobConfigured()) {
    throw new Error(
      "Falta BLOB_READ_WRITE_TOKEN (o BLOB_STORE_ID) en el entorno (Vercel Blob privado)."
    );
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || token === "[SENSITIVE]" || token === "Hidden") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN no válido. Usa `vercel env run -e production -- npm run import:gestoria` (el pull deja [SENSITIVE])."
    );
  }
  const folder = opts.folder ?? "fiscal";
  const safe = sanitizePathSegment(opts.fileName) || "documento";
  const pathname = `${folder}/${Date.now()}-${safe}`;
  const blob = await put(pathname, opts.buffer, {
    access: "private",
    contentType: opts.mimeType || "application/octet-stream",
    token,
  });
  return { url: blob.url, pathname: blob.pathname };
}

export async function streamPrivateBlob(pathnameOrUrl: string) {
  const result = await get(pathnameOrUrl, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return result;
}

export async function createFiscalDocument(opts: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  category: FiscalDocCategory;
  title: string;
  year?: number | null;
  quarter?: number | null;
  modelType?: string | null;
  notes?: string | null;
  filingId?: string | null;
  folder?: string;
}) {
  const uploaded = await uploadFiscalBlob({
    buffer: opts.buffer,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    folder: opts.folder,
  });

  return prisma.fiscalDocument.create({
    data: {
      category: opts.category,
      title: opts.title,
      year: opts.year ?? null,
      quarter: opts.quarter ?? null,
      modelType: opts.modelType ?? null,
      blobUrl: uploaded.url,
      pathname: uploaded.pathname,
      mimeType: opts.mimeType || "application/octet-stream",
      size: opts.buffer.byteLength,
      sourceFileName: opts.fileName,
      notes: opts.notes ?? null,
      filingId: opts.filingId ?? null,
    },
  });
}

export async function deleteFiscalDocument(id: string) {
  const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (!doc) return;
  try {
    if (blobConfigured()) {
      await del(doc.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
  } catch {
    // El registro se borra igual si el blob ya no existe
  }
  await prisma.fiscalDocument.delete({ where: { id } });
}
