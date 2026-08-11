import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUploadMime } from "@/lib/gemini-client";
import {
  geminiConfigured,
  parseExpenseDocument,
  type ParsedExpenseDraft,
} from "@/lib/gemini-expense";
import {
  isAmazonFeesInvoice,
  parseAmazonFeesInvoiceCsv,
} from "@/lib/amazon-fees-invoice";
import { parseCsv } from "@/lib/amazon-tax-report";
import { stashSourceDocument } from "@/lib/fiscal-blob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

function isCsvUpload(file: File, mime: string): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    mime === "text/csv" ||
    mime === "application/csv" ||
    mime === "text/plain"
  );
}

function withDocumentId(
  drafts: ParsedExpenseDraft[],
  documentId: string | null
): ParsedExpenseDraft[] {
  if (!documentId) return drafts;
  return drafts.map((d) => ({ ...d, documentId }));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "No autenticado. Recarga e inicia sesión." },
      { status: 401 }
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
      {
        ok: false,
        error: "Selecciona un PDF, imagen o CSV de comisiones Amazon",
      },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "El archivo supera 12 MB" },
      { status: 400 }
    );
  }

  const mime = resolveUploadMime(file.type, file.name);

  try {
    if (isCsvUpload(file, mime)) {
      const text = await file.text();
      const table = parseCsv(text.replace(/^\uFEFF/, ""));
      const headers =
        table[0]?.map((h) => h.trim().replace(/^"|"$/g, "")) ?? [];

      if (!isAmazonFeesInvoice(headers)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "CSV no reconocido. Usa el export de facturas de comisiones Amazon (Fees Invoice: Fees Invoice Number / Fee ID / Total Fees).",
          },
          { status: 422 }
        );
      }

      const drafts = parseAmazonFeesInvoiceCsv(text, file.name);
      const documentId = await stashSourceDocument({
        buffer: Buffer.from(text, "utf8"),
        fileName: file.name,
        mimeType: mime || "text/csv",
        category: "EXPENSE",
        title: `Comisiones Amazon · ${file.name}`,
        notes: "CSV fees invoice (varias líneas de gasto)",
      });
      const withDoc = withDocumentId(drafts, documentId);
      return NextResponse.json({
        ok: true,
        draft: withDoc[0],
        drafts: withDoc,
      });
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const draft: ParsedExpenseDraft = await parseExpenseDocument({
      buffer,
      mimeType: mime,
      fileName: file.name,
    });
    const documentId = await stashSourceDocument({
      buffer,
      fileName: file.name,
      mimeType: mime,
      category: "EXPENSE",
      title: `${draft.supplierName || "Gasto"} · ${file.name}`,
      year: draft.issueDate
        ? Number(draft.issueDate.slice(0, 4)) || null
        : null,
    });
    const withDoc = { ...draft, documentId };
    return NextResponse.json({ ok: true, draft: withDoc, drafts: [withDoc] });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "No se pudo leer la factura";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
