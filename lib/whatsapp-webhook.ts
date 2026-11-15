/**
 * Webhook de la WhatsApp Cloud API: verificación de firma y traducción del
 * payload de Meta a eventos simples que Vexo guarda en WhatsappMessage.
 * Funciones puras (sin BD) para poder testearlas. Ver docs/whatsapp.md.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type WaDirection = "IN" | "OUT";

export type WaMessageEvent = {
  kind: "message";
  direction: WaDirection;
  /** VEXO no aparece aquí: los envíos de Vexo se guardan al enviar. APP = eco del móvil */
  origin: "APP" | null;
  waMessageId: string;
  /** Teléfono del cliente (no el nuestro), solo dígitos */
  phone: string;
  type: string;
  body: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  mediaFilename: string | null;
  contextWaId: string | null;
  contactName: string | null;
  sentAt: Date;
};

export type WaStatusEvent = {
  kind: "status";
  waMessageId: string;
  phone: string | null;
  status: string;
  at: Date;
  errorText: string | null;
};

export type WaWebhookEvent = WaMessageEvent | WaStatusEvent;

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v : null;
  if (typeof v === "number") return String(v);
  return null;
}

function digits(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}

/** Meta manda `timestamp` en segundos Unix como string. */
export function parseWaTimestamp(v: unknown): Date {
  const n = Number(str(v));
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

/** Comprueba la cabecera X-Hub-Signature-256 (HMAC-SHA256 del cuerpo con el App Secret). */
export function verifyWaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string
): boolean {
  if (!header || !appSecret) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(m[1], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const MEDIA_TYPES = ["image", "document", "audio", "video", "sticker"] as const;

/** Texto, adjunto y tipo de un objeto `message` (o `message_echo`) de Meta. */
export function extractWaContent(m: Json): Pick<
  WaMessageEvent,
  "type" | "body" | "mediaId" | "mediaMime" | "mediaFilename" | "contextWaId"
> {
  const type = str(m.type) ?? "unsupported";
  let body: string | null = null;
  let mediaId: string | null = null;
  let mediaMime: string | null = null;
  let mediaFilename: string | null = null;
  let contextWaId = str(obj(m.context)?.id);

  if (type === "text") {
    body = str(obj(m.text)?.body);
  } else if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const media = obj(m[type]);
    mediaId = str(media?.id);
    mediaMime = str(media?.mime_type);
    mediaFilename = str(media?.filename);
    body = str(media?.caption);
  } else if (type === "location") {
    const loc = obj(m.location);
    const lat = str(loc?.latitude);
    const lng = str(loc?.longitude);
    const label = [str(loc?.name), str(loc?.address)].filter(Boolean).join(" · ");
    body = [label, lat && lng ? `${lat},${lng}` : null].filter(Boolean).join("\n") || null;
  } else if (type === "button") {
    body = str(obj(m.button)?.text) ?? str(obj(m.button)?.payload);
  } else if (type === "interactive") {
    const it = obj(m.interactive);
    const reply = obj(it?.button_reply) ?? obj(it?.list_reply);
    body = str(reply?.title);
  } else if (type === "reaction") {
    const r = obj(m.reaction);
    body = str(r?.emoji) ?? "(reacción eliminada)";
    contextWaId = str(r?.message_id) ?? contextWaId;
  } else if (type === "contacts") {
    const names = arr(m.contacts)
      .map((c) => str(obj(obj(c)?.name)?.formatted_name))
      .filter(Boolean);
    body = names.length ? `Contacto: ${names.join(", ")}` : "Contacto compartido";
  } else if (type === "template") {
    body = "(plantilla)";
  }

  if (type === "unsupported" || (!body && !mediaId && type !== "reaction")) {
    const errTitle = str(obj(arr(m.errors)[0])?.title);
    body = body ?? (errTitle ? `Mensaje no compatible: ${errTitle}` : null);
  }

  return { type, body, mediaId, mediaMime, mediaFilename, contextWaId };
}

function statusError(s: Json): string | null {
  const e = obj(arr(s.errors)[0]);
  if (!e) return null;
  const code = str(e.code);
  const detail =
    str(obj(e.error_data)?.details) ?? str(e.message) ?? str(e.title) ?? "Error";
  return code ? `${detail} (${code})` : detail;
}

/**
 * Convierte el cuerpo del webhook en eventos. Ignora cambios de otros números
 * si se pasa `phoneNumberId` (una misma app puede tener varios números).
 */
export function parseWaWebhook(
  payload: unknown,
  opts: { phoneNumberId?: string | null } = {}
): WaWebhookEvent[] {
  const events: WaWebhookEvent[] = [];
  const root = obj(payload);
  if (!root) return events;

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const c = obj(change);
      const field = str(c?.field);
      const value = obj(c?.value);
      if (!value) continue;

      const pnid = str(obj(value.metadata)?.phone_number_id);
      if (opts.phoneNumberId && pnid && pnid !== opts.phoneNumberId) continue;

      const names = new Map<string, string>();
      for (const ct of arr(value.contacts)) {
        const waId = digits(obj(ct)?.wa_id);
        const name = str(obj(obj(ct)?.profile)?.name);
        if (waId && name) names.set(waId, name);
      }

      if (field === "messages") {
        for (const raw of arr(value.messages)) {
          const m = obj(raw);
          const id = str(m?.id);
          const from = digits(m?.from);
          if (!m || !id || !from) continue;
          events.push({
            kind: "message",
            direction: "IN",
            origin: null,
            waMessageId: id,
            phone: from,
            contactName: names.get(from) ?? null,
            sentAt: parseWaTimestamp(m.timestamp),
            ...extractWaContent(m),
          });
        }

        for (const raw of arr(value.statuses)) {
          const s = obj(raw);
          const id = str(s?.id);
          const status = str(s?.status);
          if (!s || !id || !status) continue;
          events.push({
            kind: "status",
            waMessageId: id,
            phone: digits(s.recipient_id),
            status,
            at: parseWaTimestamp(s.timestamp),
            errorText: statusError(s),
          });
        }
      }

      // Coexistencia: lo que escribes desde la app WhatsApp Business del móvil
      if (field === "smb_message_echoes") {
        for (const raw of arr(value.message_echoes)) {
          const m = obj(raw);
          const id = str(m?.id);
          const to = digits(m?.to);
          if (!m || !id || !to) continue;
          events.push({
            kind: "message",
            direction: "OUT",
            origin: "APP",
            waMessageId: id,
            phone: to,
            contactName: names.get(to) ?? null,
            sentAt: parseWaTimestamp(m.timestamp),
            ...extractWaContent(m),
          });
        }
      }
    }
  }

  return events;
}

const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/** Los webhooks pueden llegar desordenados: no bajar de «leído» a «entregado». */
export function shouldApplyStatus(current: string | null, next: string): boolean {
  if (!current) return true;
  if (next === "failed") return current !== "read";
  if (current === "failed") return (STATUS_RANK[next] ?? -1) >= STATUS_RANK.delivered;
  return (STATUS_RANK[next] ?? -1) > (STATUS_RANK[current] ?? -1);
}

/** Meta solo deja texto libre durante 24 h desde el último mensaje del cliente. */
export const WA_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function serviceWindowEndsAt(lastInboundAt: Date | null): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + WA_SERVICE_WINDOW_MS) : null;
}
