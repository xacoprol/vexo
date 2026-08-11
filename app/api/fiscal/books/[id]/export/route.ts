import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildRegisterBookExcelBuffer,
  registerBookExportFileName,
} from "@/lib/register-book-export";
import type { RegisterBookType } from "@/lib/register-book-import";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const book = await prisma.registerBook.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!book) {
    return NextResponse.json({ error: "Libro no encontrado" }, { status: 404 });
  }

  const bookType = book.bookType as RegisterBookType;
  const buffer = buildRegisterBookExcelBuffer({
    bookType,
    year: book.year,
    lines: book.lines.map((l) => ({
      sortOrder: l.sortOrder,
      reference: l.reference,
      invoiceNumber: l.invoiceNumber,
      issueDate: l.issueDate,
      concept: l.concept,
      nif: l.nif,
      counterparty: l.counterparty,
      base: Number(l.base),
      vatRate: l.vatRate,
      vatAmount: Number(l.vatAmount),
      withholding: Number(l.withholding),
      total: Number(l.total),
    })),
  });

  const fileName = registerBookExportFileName(bookType, book.year);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
