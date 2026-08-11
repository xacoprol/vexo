import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamPrivateBlob } from "@/lib/fiscal-blob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  try {
    const result = await streamPrivateBlob(doc.pathname);
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json(
        { error: "No se pudo leer el archivo" },
        { status: 404 }
      );
    }

    const contentType =
      result.blob.contentType || doc.mimeType || "application/octet-stream";
    const disposition = `inline; filename="${encodeURIComponent(doc.sourceFileName)}"`;

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Error al servir el documento",
      },
      { status: 500 }
    );
  }
}
