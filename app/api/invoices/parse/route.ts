import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUploadMime } from "@/lib/gemini-client";
import {
  geminiConfigured,
  parseIssuedInvoiceDocument,
} from "@/lib/gemini-invoice";
import { stashSourceDocument } from "@/lib/fiscal-blob";

export const dynamic = "force-dynamic";
/** OCR de PDF puede necesitar más de 10s (plan Pro). */
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "No autenticado. Recarga e inicia sesión." },
      { status: 401 }
    );
  }

  if (!geminiConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Falta la variable GEMINI_API_KEY en el entorno (Vercel / .env local).",
      },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo leer el archivo subido" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Selecciona un PDF o imagen de la factura" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "El archivo supera 12 MB" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = resolveUploadMime(file.type, file.name);
    const draft = await parseIssuedInvoiceDocument({
      buffer,
      mimeType: mime,
      fileName: file.name,
    });
    const documentId = await stashSourceDocument({
      buffer,
      fileName: file.name,
      mimeType: mime,
      category: "INVOICE_SOURCE",
      title: `${draft.fullNumber || draft.clientName || "Factura"} · ${file.name}`,
      year: draft.issueDate
        ? Number(draft.issueDate.slice(0, 4)) || null
        : null,
    });
    return NextResponse.json({
      ok: true,
      draft: { ...draft, documentId },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "No se pudo leer la factura";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
