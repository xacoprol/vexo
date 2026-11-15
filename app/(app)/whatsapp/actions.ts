"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/session";
import {
  isWhatsappConfigured,
  sendWhatsappText,
  whatsappConfigHint,
} from "@/lib/whatsapp";
import {
  countUnreadWhatsapp,
  getWhatsappContact,
  markWhatsappConversationRead,
  recordOutgoingWhatsapp,
} from "@/lib/whatsapp-inbox";
import { serviceWindowEndsAt } from "@/lib/whatsapp-webhook";

export type WaActionResult = { ok: true } | { error: string };

const PHONE_RE = /^\d{8,15}$/;

export async function sendWhatsappReply(
  phone: string,
  text: string,
  replyToWaId?: string | null
): Promise<WaActionResult> {
  await requireAuth();
  const body = text.trim();
  if (!PHONE_RE.test(phone)) return { error: "Teléfono no válido" };
  if (!body) return { error: "Escribe un mensaje" };
  if (body.length > 4096) return { error: "Máximo 4096 caracteres por mensaje" };
  if (!isWhatsappConfigured()) return { error: whatsappConfigHint() };

  const contact = await getWhatsappContact(phone);
  const endsAt = serviceWindowEndsAt(contact.lastInboundAt);
  if (!endsAt || endsAt.getTime() <= Date.now()) {
    return {
      error:
        "Han pasado más de 24 h desde su último mensaje: WhatsApp solo deja escribir con una plantilla aprobada. Reenvía el documento desde el presupuesto o la factura.",
    };
  }

  try {
    const sent = await sendWhatsappText({ to: phone, text: body, replyToWaId });
    await recordOutgoingWhatsapp({
      waMessageId: sent.messageId,
      phone,
      type: "text",
      body,
      clientId: contact.client?.id ?? null,
      contextWaId: replyToWaId ?? null,
    });
    await markWhatsappConversationRead(phone);
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo enviar el WhatsApp",
    };
  }
}

export async function markWhatsappRead(phone: string): Promise<number> {
  await requireAuth();
  if (!PHONE_RE.test(phone)) return 0;
  return markWhatsappConversationRead(phone);
}

/** Para el contador del menú lateral (se consulta cada poco). */
export async function getWhatsappUnreadCount(): Promise<number> {
  const session = await auth();
  if (!session?.user) return 0;
  try {
    return await countUnreadWhatsapp();
  } catch {
    return 0;
  }
}
