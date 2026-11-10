"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  parseVerifactuEnv,
  parseVerifactuMode,
} from "@/lib/verifactu";
import { processVerifactuRemitQueue, retryVerifactuEvent } from "@/lib/verifactu-remit";
import { applyVerifactuSeal } from "@/lib/verifactu-seal";

export type VerifactuSettingsState = { error?: string; success?: boolean };

export async function updateVerifactuSettings(
  _prev: VerifactuSettingsState,
  formData: FormData
): Promise<VerifactuSettingsState> {
  await requireAuth();
  try {
    // Checkbox: presente = activado; ausente = desactivado.
    // Compat: si llega verifactuMode (API/legacy) se respeta.
    const resolvedMode = formData.has("verifactuMode")
      ? parseVerifactuMode(formData.get("verifactuMode"))
      : formData.get("verifactuEnabled")
        ? "VERIFACTU"
        : "NO_VERIFACTU";
    const env = parseVerifactuEnv(formData.get("verifactuEnv"));

    const settings = await prisma.companySettings.findFirst({
      select: { id: true },
    });
    if (!settings) return { error: "Sin configuración de empresa" };

    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { verifactuMode: resolvedMode, verifactuEnv: env },
    });

    // Al desactivar: quitar huellas locales no remitidas para poder corregir.
    if (resolvedMode === "NO_VERIFACTU") {
      const unsent = await prisma.invoice.findMany({
        where: {
          verifactuHash: { not: null },
          verifactuSentAt: null,
        },
        select: { id: true },
      });
      for (const inv of unsent) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            verifactuHash: null,
            verifactuPreviousHash: null,
            verifactuRecordAt: null,
            verifactuQrUrl: null,
          },
        });
        const pending = await prisma.verifactuEvent.findMany({
          where: {
            invoiceId: inv.id,
            status: { in: ["PENDING", "SKIPPED", "REJECTED"] },
          },
          select: { id: true },
        });
        for (const ev of pending) {
          await prisma.verifactuEvent.delete({ where: { id: ev.id } });
        }
      }
    }

    // Reencolar SKIPPED → PENDING (no updateMany: PrismaNeonHTTP lo rompe)
    if (resolvedMode === "VERIFACTU") {
      const skipped = await prisma.verifactuEvent.findMany({
        where: { status: "SKIPPED" },
        select: { id: true },
      });
      for (const ev of skipped) {
        await prisma.verifactuEvent.update({
          where: { id: ev.id },
          data: {
            status: "PENDING",
            aeatMessage: "Activado modo VERIFACTU",
          },
        });
      }
    }

    revalidatePath("/fiscal/verifactu");
    revalidatePath("/settings");
    revalidatePath("/invoices");
    return { success: true };
  } catch (e) {
    console.error("[verifactu] updateVerifactuSettings", e);
    return {
      error: e instanceof Error ? e.message : "No se pudo guardar",
    };
  }
}

export async function runVerifactuRemitNow() {
  await requireAuth();
  const result = await processVerifactuRemitQueue();
  revalidatePath("/fiscal/verifactu");
  revalidatePath("/invoices");
  return result;
}

export async function retryVerifactuEventAction(eventId: string) {
  await requireAuth();
  await retryVerifactuEvent(eventId);
  revalidatePath("/fiscal/verifactu");
}

export async function sealMissingInvoice(invoiceId: string) {
  await requireAuth();
  await applyVerifactuSeal(prisma, invoiceId, { markIssued: true });
  revalidatePath("/fiscal/verifactu");
  revalidatePath(`/invoices/${invoiceId}`);
}
