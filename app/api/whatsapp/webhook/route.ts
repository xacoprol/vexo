import { NextRequest, NextResponse } from "next/server";
import {
  getWhatsappConfig,
  getWhatsappWebhookConfig,
} from "@/lib/whatsapp";
import { parseWaWebhook, verifyWaSignature } from "@/lib/whatsapp-webhook";
import { storeWebhookEvents } from "@/lib/whatsapp-inbox";

export const dynamic = "force-dynamic";

/**
 * Meta llama a esta URL (pública, sin sesión) para:
 * - GET: verificar el webhook al darlo de alta (hub.challenge).
 * - POST: mensajes entrantes, estados de entrega y ecos de la app del móvil.
 * Cada POST va firmado con el App Secret (X-Hub-Signature-256). docs/whatsapp.md
 */
export async function GET(req: NextRequest) {
  const cfg = getWhatsappWebhookConfig();
  const sp = req.nextUrl.searchParams;
  if (
    cfg &&
    sp.get("hub.mode") === "subscribe" &&
    sp.get("hub.verify_token") === cfg.verifyToken
  ) {
    return new Response(sp.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const cfg = getWhatsappWebhookConfig();
  if (!cfg) {
    console.error(
      "[whatsapp-webhook] faltan WHATSAPP_WEBHOOK_VERIFY_TOKEN / WHATSAPP_APP_SECRET"
    );
    return new Response("Not configured", { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWaSignature(raw, signature, cfg.appSecret)) {
    console.error(
      "[whatsapp-webhook] firma inválida — revisa WHATSAPP_APP_SECRET (debe ser la Clave secreta de la app Vexo en Meta → Configuración → Básica)",
      {
        hasSignatureHeader: Boolean(signature),
        bodyBytes: Buffer.byteLength(raw, "utf8"),
      }
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const events = parseWaWebhook(payload, {
    phoneNumberId: getWhatsappConfig()?.phoneNumberId ?? null,
  });

  try {
    const stored = await storeWebhookEvents(events);
    return NextResponse.json({ ok: true, ...stored });
  } catch (err) {
    // 500 → Meta reintenta; guardar es idempotente por waMessageId
    console.error("[whatsapp-webhook] error guardando eventos", err);
    return new Response("Error", { status: 500 });
  }
}
