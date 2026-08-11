"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  parseRegisterBookExcel,
  type RegisterBookType,
} from "@/lib/register-book-import";
import { createFiscalDocument, blobConfigured } from "@/lib/fiscal-blob";
import { buildLinearAmortization } from "@/lib/investment-amortization";

function revalidateBooks() {
  revalidatePath("/fiscal/books");
  revalidatePath("/fiscal/assets");
  revalidatePath("/fiscal/archive");
}

export async function importRegisterBookFromUpload(
  formData: FormData
): Promise<{ ok: true; id: string; lines: number } | { ok: false; error: string }> {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona un Excel de libro registro" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const bookTypeOverride = String(formData.get("bookType") ?? "").toUpperCase();
    const yearOverride = parseInt(String(formData.get("year") ?? ""), 10);
    const parsed = parseRegisterBookExcel(buffer, file.name, {
      bookType: ["INGRESOS", "GASTOS", "BIENES"].includes(bookTypeOverride)
        ? (bookTypeOverride as RegisterBookType)
        : undefined,
      year: Number.isFinite(yearOverride) ? yearOverride : undefined,
    });

    let documentId: string | null = null;
    if (blobConfigured()) {
      try {
        const doc = await createFiscalDocument({
          buffer,
          fileName: file.name,
          mimeType:
            file.type ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          category: "BOOK",
          title: `Libro registro ${parsed.bookType.toLowerCase()} ${parsed.year}`,
          year: parsed.year,
        });
        documentId = doc.id;
      } catch {
        // Continúa sin blob
      }
    }

    const existing = await prisma.registerBook.findUnique({
      where: {
        bookType_year: { bookType: parsed.bookType, year: parsed.year },
      },
    });
    if (existing) {
      await prisma.registerBookLine.deleteMany({ where: { bookId: existing.id } });
      await prisma.registerBook.delete({ where: { id: existing.id } });
    }

    const book = await prisma.registerBook.create({
      data: {
        bookType: parsed.bookType,
        year: parsed.year,
        documentId,
        sourceFile: file.name,
      },
    });

    // Neon HTTP: avoid createMany (transaction)
    for (const l of parsed.lines) {
      await prisma.registerBookLine.create({
        data: {
          bookId: book.id,
          sortOrder: l.sortOrder,
          reference: l.reference,
          invoiceNumber: l.invoiceNumber,
          issueDate: l.issueDate,
          concept: l.concept,
          nif: l.nif,
          counterparty: l.counterparty,
          base: new Prisma.Decimal(l.base),
          vatRate: l.vatRate,
          vatAmount: new Prisma.Decimal(l.vatAmount),
          withholding: new Prisma.Decimal(l.withholding),
          total: new Prisma.Decimal(l.total),
        },
      });
    }

    if (parsed.bookType === "BIENES") {
      for (const l of parsed.lines) {
        const startYear =
          l.issueDate?.getFullYear() ?? parsed.year;
        const amort = buildLinearAmortization({
          base: l.base,
          usefulLifeYears: 4,
          startYear,
        });
        if (l.invoiceNumber) {
          const old = await prisma.investmentAsset.findMany({
            where: { invoiceNumber: l.invoiceNumber },
            select: { id: true },
          });
          for (const o of old) {
            await prisma.investmentAmortization.deleteMany({
              where: { assetId: o.id },
            });
            await prisma.investmentAsset.delete({ where: { id: o.id } });
          }
        }
        const asset = await prisma.investmentAsset.create({
          data: {
            description: l.concept || l.invoiceNumber || "Bien de inversión",
            supplierName: l.counterparty,
            supplierNif: l.nif,
            invoiceNumber: l.invoiceNumber,
            purchaseDate: l.issueDate,
            base: new Prisma.Decimal(l.base),
            vatAmount: new Prisma.Decimal(l.vatAmount),
            usefulLifeYears: 4,
            method: "LINEAL",
            startYear,
            documentId,
          },
        });
        for (const a of amort) {
          await prisma.investmentAmortization.create({
            data: {
              assetId: asset.id,
              year: a.year,
              amount: new Prisma.Decimal(a.amount),
            },
          });
        }
      }
    }

    revalidateBooks();
    return { ok: true, id: book.id, lines: parsed.lines.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al importar el libro",
    };
  }
}

export async function deleteRegisterBook(id: string) {
  await requireAuth();
  await prisma.registerBook.delete({ where: { id } });
  revalidateBooks();
}
