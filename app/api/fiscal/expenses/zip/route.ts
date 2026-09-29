import { NextResponse } from "next/server";
import JSZip from "jszip";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamPrivateBlob } from "@/lib/fiscal-blob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseMonth(raw: string | null): { year: number; month: number } | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}

function sanitizeFilePart(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function extensionFor(doc: {
  sourceFileName: string;
  mimeType: string | null;
}): string {
  const fromName = doc.sourceFileName.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName) && fromName !== doc.sourceFileName) {
    return fromName;
  }
  const mime = (doc.mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("csv")) return "csv";
  return "bin";
}

async function blobToBuffer(pathname: string): Promise<Buffer | null> {
  const result = await streamPrivateBlob(pathname);
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const ab = await new Response(result.stream).arrayBuffer();
  if (!ab.byteLength) return null;
  return Buffer.from(ab);
}

/**
 * ZIP de facturas/adjuntos de gastos de un mes (YYYY-MM).
 * Incluye documento principal y DUA si existe.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = parseMonth(url.searchParams.get("month"));
  if (!parsed) {
    return NextResponse.json(
      { error: "Indica month=YYYY-MM (p. ej. 2026-09)" },
      { status: 400 }
    );
  }

  const { from, to } = monthRange(parsed.year, parsed.month);
  const monthTag = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;

  const expenses = await prisma.expense.findMany({
    where: {
      issueDate: { gte: from, lte: to },
      OR: [{ documentId: { not: null } }, { importDuaDocumentId: { not: null } }],
    },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
    include: {
      document: true,
      importDuaDocument: true,
    },
  });

  if (!expenses.length) {
    return NextResponse.json(
      { error: `No hay facturas adjuntas en ${monthTag}` },
      { status: 404 }
    );
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const missing: string[] = [];
  let added = 0;

  function uniqueName(base: string): string {
    let name = base;
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      const dot = base.lastIndexOf(".");
      name =
        dot > 0
          ? `${base.slice(0, dot)}_${n}${base.slice(dot)}`
          : `${base}_${n}`;
      n += 1;
    }
    usedNames.add(name.toLowerCase());
    return name;
  }

  for (const e of expenses) {
    const day = e.issueDate.toISOString().slice(0, 10);
    const supplier = sanitizeFilePart(e.supplierName) || "proveedor";
    const inv =
      sanitizeFilePart(e.invoiceNumber ?? "") ||
      sanitizeFilePart(e.id.slice(-6));

    const docs: { label: string; doc: NonNullable<typeof e.document> }[] = [];
    if (e.document) docs.push({ label: "factura", doc: e.document });
    if (e.importDuaDocument) {
      docs.push({ label: "dua", doc: e.importDuaDocument });
    }

    if (!docs.length) {
      missing.push(`${day} ${e.supplierName}`);
      continue;
    }

    for (const { label, doc } of docs) {
      try {
        const buf = await blobToBuffer(doc.pathname);
        if (!buf?.length) {
          missing.push(`${day} ${e.supplierName} (${label})`);
          continue;
        }
        const ext = extensionFor(doc);
        const fileName = uniqueName(
          `${day}_${supplier}_${inv}_${label}.${ext}`
        );
        zip.file(fileName, buf);
        added += 1;
      } catch {
        missing.push(`${day} ${e.supplierName} (${label})`);
      }
    }
  }

  if (added === 0) {
    return NextResponse.json(
      { error: `No se pudieron leer los adjuntos de ${monthTag}` },
      { status: 404 }
    );
  }

  if (missing.length) {
    zip.file(
      "_sin_adjunto_o_error.txt",
      [
        `Gastos de ${monthTag} sin archivo legible:`,
        ...missing.map((m) => `- ${m}`),
        "",
        `Archivos incluidos: ${added}`,
      ].join("\n")
    );
  }

  const body = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const fileName = `gastos_${monthTag}.zip`;
  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
