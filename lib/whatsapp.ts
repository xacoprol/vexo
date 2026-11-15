/**
 * WhatsApp Business Platform (Meta Cloud API).
 *
 * Fuera de la ventana de 24 h desde el último mensaje del cliente, Meta solo
 * permite mensajes de plantilla aprobada. Por eso el envío de documentos usa
 * siempre una plantilla con cabecera DOCUMENT (el PDF) y 4 variables en el
 * cuerpo. Alta y plantilla: docs/whatsapp.md
 */

const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v23.0";
const DEFAULT_TEMPLATE = "envio_documento";
const DEFAULT_LANG = "es";

/** Texto de la plantilla recomendada (docs/whatsapp.md). Solo para la vista previa. */
export const WHATSAPP_TEMPLATE_PREVIEW =
  "Hola {{1}}, te enviamos {{2}} nº {{3}} de {{4}} en el PDF adjunto. Para cualquier duda puedes responder a este mensaje.";

const DIAL_CODES: Record<string, string> = {
  ES: "34",
  PT: "351",
  FR: "33",
  IT: "39",
  DE: "49",
  GB: "44",
  IE: "353",
  NL: "31",
  BE: "32",
  AD: "376",
  US: "1",
  MX: "52",
};

export type WhatsappConfig = {
  token: string;
  phoneNumberId: string;
  templateName: string;
  templateLang: string;
  apiVersion: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getWhatsappConfig(): WhatsappConfig | null {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    templateName: env("WHATSAPP_TEMPLATE_NAME") || DEFAULT_TEMPLATE,
    templateLang: env("WHATSAPP_TEMPLATE_LANG") || DEFAULT_LANG,
    apiVersion: env("WHATSAPP_API_VERSION") || DEFAULT_API_VERSION,
  };
}

export function isWhatsappConfigured(): boolean {
  return getWhatsappConfig() !== null;
}

export function whatsappConfigHint(): string {
  return "Configura en Vercel: WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID (y WHATSAPP_TEMPLATE_NAME si tu plantilla no se llama «envio_documento»). Pasos en docs/whatsapp.md.";
}

/**
 * Devuelve el teléfono en formato internacional solo con dígitos (p. ej.
 * 34612345678), que es lo que espera la API. Si no lleva prefijo, usa el del
 * país del cliente. Devuelve null si no se puede interpretar.
 */
export function normalizeWhatsappPhone(
  raw: string | null | undefined,
  countryCode = "ES"
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (/[^\d\s+().\-/]/.test(trimmed)) return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // ya es internacional
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    const dial = DIAL_CODES[countryCode.toUpperCase()];
    if (!dial) return null;
    // España: 9 dígitos nacionales. Si ya vienen con el 34 delante, se respeta.
    if (dial === "34") {
      if (digits.length === 9) digits = dial + digits;
      else if (!(digits.length === 11 && digits.startsWith("34"))) return null;
    } else if (!digits.startsWith(dial)) {
      digits = dial + digits.replace(/^0+/, "");
    }
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Meta rechaza variables con saltos de línea, tabuladores o 4+ espacios seguidos. */
export function sanitizeTemplateParam(value: string): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return clean || "-";
}

export function fillWhatsappPreview(params: string[]): string {
  return params.reduce(
    (text, value, i) => text.replaceAll(`{{${i + 1}}}`, sanitizeTemplateParam(value)),
    WHATSAPP_TEMPLATE_PREVIEW
  );
}

export function buildDocumentTemplatePayload(opts: {
  to: string;
  templateName: string;
  templateLang: string;
  mediaId: string;
  filename: string;
  bodyParams: string[];
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.templateLang },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: { id: opts.mediaId, filename: opts.filename },
            },
          ],
        },
        {
          type: "body",
          parameters: opts.bodyParams.map((text) => ({
            type: "text",
            text: sanitizeTemplateParam(text),
          })),
        },
      ],
    },
  };
}

type GraphError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
};

export function describeWhatsappError(
  err: GraphError | undefined,
  status: number,
  cfg: Pick<WhatsappConfig, "templateName" | "templateLang">
): string {
  const code = err?.code;
  const detail = err?.error_data?.details || err?.message || `HTTP ${status}`;
  if (code === 190) {
    return "El token de WhatsApp ha caducado o no es válido. Genera un token permanente de usuario del sistema y actualiza WHATSAPP_ACCESS_TOKEN.";
  }
  if (code === 10 || code === 200) {
    return "El token no tiene permiso sobre este número. Necesita whatsapp_business_messaging y acceso a la cuenta de WhatsApp Business.";
  }
  if (code === 132001) {
    return `La plantilla «${cfg.templateName}» (${cfg.templateLang}) no existe o aún no está aprobada en Meta. Revisa nombre e idioma (WHATSAPP_TEMPLATE_NAME / WHATSAPP_TEMPLATE_LANG).`;
  }
  if (code === 132000 || code === 132012) {
    return `La plantilla «${cfg.templateName}» no coincide con lo esperado: cabecera de tipo Documento y 4 variables en el cuerpo. (${detail})`;
  }
  if (code === 131030) {
    return "Ese teléfono no está en la lista de destinatarios permitidos. Con el número de prueba de Meta solo puedes enviar a teléfonos que hayas añadido en el panel.";
  }
  if (code === 131026) {
    return "No se puede entregar: el teléfono no tiene WhatsApp o no acepta mensajes de empresas.";
  }
  if (code === 131042) {
    return "Meta ha bloqueado el envío por un problema con el método de pago de la cuenta de WhatsApp Business.";
  }
  if (code === 131047) {
    return "Han pasado más de 24 h desde el último mensaje del cliente: Meta solo deja contestar con una plantilla aprobada (por ejemplo, reenviando el documento).";
  }
  if (code === 131049) {
    return `Meta no ha entregado el mensaje (límite de mensajes a este usuario o fuera de ventana). (${detail})`;
  }
  return `WhatsApp rechazó el envío${code ? ` (${code})` : ""}: ${detail}`;
}

async function graphFetch(
  cfg: WhatsappConfig,
  path: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_HOST}/${cfg.apiVersion}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, ...init.headers },
    signal: AbortSignal.timeout(25_000),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // respuesta no JSON
  }
  if (!res.ok || json.error) {
    throw new Error(
      describeWhatsappError(json.error as GraphError | undefined, res.status, cfg)
    );
  }
  return json;
}

async function uploadPdf(
  cfg: WhatsappConfig,
  pdf: { buffer: Buffer; filename: string }
): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append(
    "file",
    new Blob([new Uint8Array(pdf.buffer)], { type: "application/pdf" }),
    pdf.filename
  );
  const json = await graphFetch(cfg, `${cfg.phoneNumberId}/media`, {
    method: "POST",
    body: form,
  });
  const id = typeof json.id === "string" ? json.id : "";
  if (!id) throw new Error("WhatsApp no devolvió el identificador del PDF subido");
  return id;
}

/**
 * Sube el PDF y envía la plantilla con el documento en la cabecera.
 * Que Meta acepte el mensaje no garantiza la entrega: el estado final
 * (entregado/leído/fallido) llega por webhook (/api/whatsapp/webhook).
 */
export async function sendWhatsappDocument(opts: {
  to: string;
  pdf: { buffer: Buffer; filename: string };
  bodyParams: string[];
}): Promise<{ messageId: string }> {
  const cfg = getWhatsappConfig();
  if (!cfg) throw new Error(whatsappConfigHint());

  const mediaId = await uploadPdf(cfg, opts.pdf);
  const json = await graphFetch(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildDocumentTemplatePayload({
        to: opts.to,
        templateName: cfg.templateName,
        templateLang: cfg.templateLang,
        mediaId,
        filename: opts.pdf.filename,
        bodyParams: opts.bodyParams,
      })
    ),
  });
  const messages = json.messages as { id?: string }[] | undefined;
  return { messageId: messages?.[0]?.id ?? "" };
}

// ─── Bandeja: webhook, respuestas y adjuntos ────────────────────────────────

export function getWhatsappWebhookConfig(): {
  verifyToken: string;
  appSecret: string;
} | null {
  const verifyToken = env("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!verifyToken || !appSecret) return null;
  return { verifyToken, appSecret };
}

export function isWhatsappInboxConfigured(): boolean {
  return isWhatsappConfigured() && getWhatsappWebhookConfig() !== null;
}

export function buildTextPayload(opts: {
  to: string;
  text: string;
  replyToWaId?: string | null;
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.to,
    type: "text",
    text: { body: opts.text, preview_url: true },
    ...(opts.replyToWaId ? { context: { message_id: opts.replyToWaId } } : {}),
  };
}

/**
 * Texto libre. Meta solo lo entrega dentro de las 24 h desde el último
 * mensaje del cliente; fuera de esa ventana devuelve el error 131047.
 */
export async function sendWhatsappText(opts: {
  to: string;
  text: string;
  replyToWaId?: string | null;
}): Promise<{ messageId: string }> {
  const cfg = getWhatsappConfig();
  if (!cfg) throw new Error(whatsappConfigHint());
  const json = await graphFetch(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildTextPayload(opts)),
  });
  const messages = json.messages as { id?: string }[] | undefined;
  return { messageId: messages?.[0]?.id ?? "" };
}

/**
 * Descarga un adjunto recibido. Meta da primero una URL temporal y luego hay
 * que pedirla con el mismo token.
 */
export async function downloadWhatsappMedia(
  mediaId: string
): Promise<{ body: ArrayBuffer; mime: string }> {
  const cfg = getWhatsappConfig();
  if (!cfg) throw new Error(whatsappConfigHint());
  const meta = await graphFetch(cfg, encodeURIComponent(mediaId), { method: "GET" });
  const url = typeof meta.url === "string" ? meta.url : "";
  if (!url) throw new Error("Meta no devolvió la URL del adjunto");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`No se pudo descargar el adjunto (HTTP ${res.status})`);
  const mime =
    (typeof meta.mime_type === "string" && meta.mime_type) ||
    res.headers.get("content-type") ||
    "application/octet-stream";
  return { body: await res.arrayBuffer(), mime };
}
