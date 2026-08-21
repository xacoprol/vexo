import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildInvoicePdf } from "@/lib/pdf/build-document-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { buffer, filename } = await buildInvoicePdf(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Not found";
    const status = /no encontrad/i.test(message) ? 404 : 500;
    console.error("[invoice-pdf]", id, e);
    return NextResponse.json({ error: message }, { status });
  }
}
