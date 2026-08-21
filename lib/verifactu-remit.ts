/**
 * Procesa la cola PENDING/REJECTED de eventos Veri*Factu.
 */
import { prisma } from "@/lib/prisma";
import {
  buildVerifactuQrUrl,
  formatFechaExpedicion,
  parseVerifactuEnv,
  parseVerifactuMode,
} from "@/lib/verifactu";
import { remitVerifactuEventToAeat } from "@/lib/verifactu-aeat";

const MAX_ATTEMPTS = 8;
const BATCH = 25;

export type RemitQueueResult = {
  mode: string;
  env: string;
  processed: number;
  accepted: number;
  rejected: number;
  skipped: number;
  errors: string[];
};

export async function processVerifactuRemitQueue(): Promise<RemitQueueResult> {
  const settings = await prisma.companySettings.findFirst({
    select: { nif: true, verifactuMode: true, verifactuEnv: true },
  });
  const mode = parseVerifactuMode(settings?.verifactuMode);
  const env = parseVerifactuEnv(settings?.verifactuEnv);
  const errors: string[] = [];
  let processed = 0;
  let accepted = 0;
  let rejected = 0;
  let skipped = 0;

  if (mode !== "VERIFACTU") {
    return {
      mode,
      env,
      processed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      errors: ["Modo NO_VERIFACTU: cola no procesada"],
    };
  }

  if (!settings?.nif?.trim()) {
    return {
      mode,
      env,
      processed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      errors: ["Sin NIF en ajustes"],
    };
  }

  const events = await prisma.verifactuEvent.findMany({
    where: {
      status: { in: ["PENDING", "REJECTED"] },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    include: {
      invoice: {
        select: {
          id: true,
          fullNumber: true,
          issueDate: true,
          total: true,
          vatAmount: true,
        },
      },
    },
  });

  for (const ev of events) {
    processed++;
    const now = new Date();
    await prisma.verifactuEvent.update({
      where: { id: ev.id },
      data: {
        status: "SENT",
        attempts: { increment: 1 },
        lastAttemptAt: now,
      },
    });

    if (!ev.canonical || !ev.hash) {
      skipped++;
      await prisma.verifactuEvent.update({
        where: { id: ev.id },
        data: {
          status: "REJECTED",
          aeatCode: "NO_PAYLOAD",
          aeatMessage: "Evento sin canonical/hash",
        },
      });
      continue;
    }

    const result = await remitVerifactuEventToAeat({
      kind: ev.kind === "ANULACION" ? "ANULACION" : "ALTA",
      env,
      issuerNif: settings.nif,
      fullNumber: ev.invoice.fullNumber,
      issueDate: formatFechaExpedicion(ev.invoice.issueDate),
      canonical: ev.canonical,
      hash: ev.hash,
      previousHash: ev.previousHash,
      qrUrl: ev.qrUrl,
      cuotaTotal: undefined,
      importeTotal: undefined,
    });

    if (result.ok) {
      accepted++;
      const verificableQr = buildVerifactuQrUrl({
        nif: settings.nif,
        numSerie: ev.invoice.fullNumber,
        fechaExpedicion: formatFechaExpedicion(ev.invoice.issueDate),
        importeTotal: Number(ev.invoice.total),
        verificable: true,
      });

      await prisma.verifactuEvent.update({
        where: { id: ev.id },
        data: {
          status: "ACCEPTED",
          aeatCode: result.code,
          aeatMessage: result.message,
          acceptedAt: now,
          qrUrl: verificableQr,
        },
      });

      if (ev.kind === "ALTA") {
        await prisma.invoice.update({
          where: { id: ev.invoiceId },
          data: {
            verifactuSentAt: now,
            verifactuQrUrl: verificableQr,
          },
        });
      }
    } else {
      rejected++;
      errors.push(`${ev.invoice.fullNumber}: ${result.code} ${result.message}`);
      await prisma.verifactuEvent.update({
        where: { id: ev.id },
        data: {
          status: "REJECTED",
          aeatCode: result.code,
          aeatMessage: result.message,
        },
      });
    }
  }

  return { mode, env, processed, accepted, rejected, skipped, errors };
}

/** Reencola un evento rechazado a PENDING. */
export async function retryVerifactuEvent(eventId: string) {
  await prisma.verifactuEvent.update({
    where: { id: eventId },
    data: {
      status: "PENDING",
      aeatCode: null,
      aeatMessage: "Reencolado manualmente",
    },
  });
}
