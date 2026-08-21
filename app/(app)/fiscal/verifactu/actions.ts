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
  const mode = parseVerifactuMode(formData.get("verifactuMode"));
  const env = parseVerifactuEnv(formData.get("verifactuEnv"));

  const settings = await prisma.companySettings.findFirst({ select: { id: true } });
  if (!settings) return { error: "Sin configuración de empresa" };

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { verifactuMode: mode, verifactuEnv: env },
  });

  // Si activamos VERIFACTU, reencolar SKIPPED → PENDING
  if (mode === "VERIFACTU") {
    await prisma.verifactuEvent.updateMany({
      where: { status: "SKIPPED" },
      data: {
        status: "PENDING",
        aeatMessage: "Activado modo VERIFACTU",
      },
    });
  }

  revalidatePath("/fiscal/verifactu");
  revalidatePath("/settings");
  return { success: true };
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
  await applyVerifactuSeal(prisma, invoiceId);
  revalidatePath("/fiscal/verifactu");
  revalidatePath(`/invoices/${invoiceId}`);
}
