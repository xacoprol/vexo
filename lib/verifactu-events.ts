/**
 * Cola de eventos Veri*Factu (alta / anulación).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildVerifactuQrUrl,
  computeHuellaAnulacion,
  formatFechaExpedicion,
  formatFechaHoraHusoGenRegistro,
  normalizeIssuerNif,
  parseVerifactuMode,
} from "@/lib/verifactu";

type Db = PrismaClient | Prisma.TransactionClient;

export async function enqueueVerifactuAlta(
  db: Db,
  opts: {
    invoiceId: string;
    hash: string;
    previousHash: string | null;
    canonical: string;
    qrUrl: string;
  }
) {
  const existing = await db.verifactuEvent.findFirst({
    where: {
      invoiceId: opts.invoiceId,
      kind: "ALTA",
      status: { in: ["PENDING", "SENT", "ACCEPTED"] },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const settings = await db.companySettings.findFirst({
    select: { verifactuMode: true },
  });
  const mode = parseVerifactuMode(settings?.verifactuMode);
  const status = mode === "VERIFACTU" ? "PENDING" : "SKIPPED";

  const ev = await db.verifactuEvent.create({
    data: {
      invoiceId: opts.invoiceId,
      kind: "ALTA",
      status,
      hash: opts.hash,
      previousHash: opts.previousHash,
      canonical: opts.canonical,
      qrUrl: opts.qrUrl,
      aeatMessage:
        status === "SKIPPED"
          ? "Modo NO_VERIFACTU: remisión diferida"
          : null,
    },
  });
  return ev.id;
}

export async function recordVerifactuAnulacion(
  db: Db,
  invoiceId: string
): Promise<{ eventId: string } | null> {
  const [invoice, settings] = await Promise.all([
    db.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        fullNumber: true,
        issueDate: true,
        total: true,
        verifactuHash: true,
        status: true,
      },
    }),
    db.companySettings.findFirst({
      select: { nif: true, verifactuMode: true },
    }),
  ]);

  if (!invoice?.verifactuHash || !settings?.nif?.trim()) return null;

  const already = await db.verifactuEvent.findFirst({
    where: { invoiceId, kind: "ANULACION" },
    select: { id: true },
  });
  if (already) return { eventId: already.id };

  const recordAt = new Date();
  const recordAtIso = formatFechaHoraHusoGenRegistro(recordAt);
  const fechaExp = formatFechaExpedicion(invoice.issueDate);
  const { canonical, huella } = computeHuellaAnulacion({
    idEmisorFactura: normalizeIssuerNif(settings.nif),
    numSerieFactura: invoice.fullNumber.trim(),
    fechaExpedicionFactura: fechaExp,
    huellaAnterior: invoice.verifactuHash,
    fechaHoraHusoGenRegistro: recordAtIso,
  });
  const qrUrl = buildVerifactuQrUrl({
    nif: settings.nif,
    numSerie: invoice.fullNumber,
    fechaExpedicion: fechaExp,
    importeTotal: Number(invoice.total),
    verificable: false,
  });

  const mode = parseVerifactuMode(settings.verifactuMode);
  const status = mode === "VERIFACTU" ? "PENDING" : "SKIPPED";

  const ev = await db.verifactuEvent.create({
    data: {
      invoiceId,
      kind: "ANULACION",
      status,
      hash: huella,
      previousHash: invoice.verifactuHash,
      canonical,
      qrUrl,
      aeatMessage:
        status === "SKIPPED"
          ? "Modo NO_VERIFACTU: anulación local registrada"
          : null,
    },
  });

  return { eventId: ev.id };
}
