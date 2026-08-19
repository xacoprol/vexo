/**
 * Persistencia Veri*Factu al emitir factura (hash + QR, sin remisión AEAT).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { sealVerifactuRecord } from "@/lib/verifactu";

type Db = PrismaClient | Prisma.TransactionClient;

export async function applyVerifactuSeal(
  db: Db,
  invoiceId: string
): Promise<{ hash: string; qrUrl: string } | null> {
  const [invoice, settings] = await Promise.all([
    db.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        fullNumber: true,
        issueDate: true,
        vatAmount: true,
        total: true,
        status: true,
        verifactuHash: true,
      },
    }),
    db.companySettings.findFirst({
      select: { nif: true },
    }),
  ]);

  if (!invoice || invoice.status === "ANULADA") return null;
  if (invoice.verifactuHash) {
    const existing = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { verifactuQrUrl: true },
    });
    return {
      hash: invoice.verifactuHash,
      qrUrl: existing?.verifactuQrUrl ?? "",
    };
  }
  if (!settings?.nif?.trim()) {
    console.warn(
      "[verifactu] Sin NIF en ajustes: no se sella la factura",
      invoice.fullNumber
    );
    return null;
  }

  const prev = await db.invoice.findFirst({
    where: {
      verifactuHash: { not: null },
      id: { not: invoiceId },
      status: { not: "ANULADA" },
    },
    orderBy: [{ verifactuRecordAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, verifactuHash: true },
  });

  const sealed = sealVerifactuRecord({
    issuerNif: settings.nif,
    fullNumber: invoice.fullNumber,
    issueDate: invoice.issueDate,
    vatAmount: Number(invoice.vatAmount),
    total: Number(invoice.total),
    previousHash: prev?.verifactuHash ?? null,
  });

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      verifactuHash: sealed.hash,
      verifactuPreviousHash: sealed.previousHash || null,
      verifactuRecordAt: sealed.recordAt,
      verifactuQrUrl: sealed.qrUrl,
    },
  });

  return { hash: sealed.hash, qrUrl: sealed.qrUrl };
}
