/**
 * Persistencia Veri*Factu al emitir factura (hash + QR + evento cola).
 * TipoFactura se deriva de Invoice.invoiceKind persistido (no de paymentMethod).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { resolveInvoiceTipoFactura } from "@/lib/invoice-issuance";
import { sealVerifactuRecord } from "@/lib/verifactu";
import { enqueueVerifactuAlta } from "@/lib/verifactu-events";

type Db = PrismaClient | Prisma.TransactionClient;

export type ApplyVerifactuSealOptions = {
  /** Al sellar con éxito, marca fiscalStatus = ISSUED en el mismo UPDATE. */
  markIssued?: boolean;
};

export async function applyVerifactuSeal(
  db: Db,
  invoiceId: string,
  options: ApplyVerifactuSealOptions = {}
): Promise<{ hash: string; qrUrl: string; tipoFactura: string } | null> {
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
        fiscalStatus: true,
        verifactuHash: true,
        invoiceKind: true,
      },
    }),
    db.companySettings.findFirst({
      select: { nif: true },
    }),
  ]);

  if (!invoice || invoice.status === "ANULADA") return null;

  const tipoFactura = resolveInvoiceTipoFactura({
    invoiceKind: invoice.invoiceKind,
  });

  if (invoice.verifactuHash) {
    if (
      options.markIssued &&
      invoice.fiscalStatus !== FISCAL_STATUS.ISSUED
    ) {
      await db.invoice.update({
        where: { id: invoiceId },
        data: { fiscalStatus: FISCAL_STATUS.ISSUED },
      });
    }
    const existing = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { verifactuQrUrl: true },
    });
    return {
      hash: invoice.verifactuHash,
      qrUrl: existing?.verifactuQrUrl ?? "",
      tipoFactura,
    };
  }
  if (!settings?.nif?.trim()) {
    console.warn(
      "[verifactu] Sin NIF emisor en ajustes: no se sella",
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
    tipoFactura,
  });

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      verifactuHash: sealed.hash,
      verifactuPreviousHash: sealed.previousHash || null,
      verifactuRecordAt: sealed.recordAt,
      verifactuQrUrl: sealed.qrUrl,
      ...(options.markIssued
        ? { fiscalStatus: FISCAL_STATUS.ISSUED }
        : {}),
    },
  });

  try {
    await enqueueVerifactuAlta(db, {
      invoiceId,
      hash: sealed.hash,
      previousHash: sealed.previousHash || null,
      canonical: sealed.canonical,
      qrUrl: sealed.qrUrl,
    });
  } catch (err) {
    console.error(
      "[verifactu] enqueue ALTA falló tras sello; factura sellada reparable",
      {
        invoiceId,
        fullNumber: invoice.fullNumber,
        invoiceKind: invoice.invoiceKind,
        tipoFactura,
        err: err instanceof Error ? err.message : err,
      }
    );
  }

  return { hash: sealed.hash, qrUrl: sealed.qrUrl, tipoFactura };
}
