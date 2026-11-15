import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  parseWaWebhook,
  serviceWindowEndsAt,
  shouldApplyStatus,
  verifyWaSignature,
} from "../whatsapp-webhook";
import { formatWaPhone, waSnippet } from "../whatsapp-format";
import { buildTextPayload } from "../whatsapp";

const PNID = "111222333";

function change(field: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field,
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "34986000000", phone_number_id: PNID },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

describe("whatsapp webhook", () => {
  it("verifica la firma HMAC del cuerpo", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = "sha256=" + createHmac("sha256", "secreto").update(body).digest("hex");
    assert.equal(verifyWaSignature(body, sig, "secreto"), true);
    assert.equal(verifyWaSignature(body + " ", sig, "secreto"), false);
    assert.equal(verifyWaSignature(body, sig, "otro"), false);
    assert.equal(verifyWaSignature(body, null, "secreto"), false);
    assert.equal(verifyWaSignature(body, "sha256=zz", "secreto"), false);
  });

  it("lee un texto entrante con nombre de perfil y cita", () => {
    const events = parseWaWebhook(
      change("messages", {
        contacts: [{ profile: { name: "Ana" }, wa_id: "34612345678" }],
        messages: [
          {
            from: "34612345678",
            id: "wamid.IN1",
            timestamp: "1763200000",
            type: "text",
            text: { body: "¿Incluye el envío?" },
            context: { from: "34986000000", id: "wamid.OUT1" },
          },
        ],
      }),
      { phoneNumberId: PNID }
    );
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.kind, "message");
    if (ev.kind !== "message") return;
    assert.equal(ev.direction, "IN");
    assert.equal(ev.phone, "34612345678");
    assert.equal(ev.contactName, "Ana");
    assert.equal(ev.body, "¿Incluye el envío?");
    assert.equal(ev.contextWaId, "wamid.OUT1");
    assert.equal(ev.sentAt.getTime(), 1763200000 * 1000);
  });

  it("lee adjuntos, ubicación, botones y reacciones", () => {
    const events = parseWaWebhook(
      change("messages", {
        messages: [
          { from: "34600000001", id: "m1", timestamp: "1", type: "document", document: { id: "MEDIA1", mime_type: "application/pdf", filename: "firmado.pdf", caption: "Firmado" } },
          { from: "34600000001", id: "m2", timestamp: "2", type: "image", image: { id: "MEDIA2", mime_type: "image/jpeg" } },
          { from: "34600000001", id: "m3", timestamp: "3", type: "location", location: { latitude: 42.2, longitude: -8.7, name: "Taller" } },
          { from: "34600000001", id: "m4", timestamp: "4", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "ok", title: "Acepto" } } },
          { from: "34600000001", id: "m5", timestamp: "5", type: "reaction", reaction: { message_id: "wamid.OUT1", emoji: "👍" } },
          { from: "34600000001", id: "m6", timestamp: "6", type: "unsupported", errors: [{ code: 131051, title: "Message type unknown" }] },
        ],
      })
    );
    const msgs = events.filter((e) => e.kind === "message");
    assert.equal(msgs.length, 6);
    const [doc, img, loc, btn, react, unsup] = msgs;
    if (doc.kind !== "message" || img.kind !== "message" || loc.kind !== "message" || btn.kind !== "message" || react.kind !== "message" || unsup.kind !== "message") return;
    assert.deepEqual([doc.mediaId, doc.mediaFilename, doc.body], ["MEDIA1", "firmado.pdf", "Firmado"]);
    assert.equal(img.mediaId, "MEDIA2");
    assert.equal(img.body, null);
    assert.equal(loc.body, "Taller\n42.2,-8.7");
    assert.equal(btn.body, "Acepto");
    assert.equal(react.body, "👍");
    assert.equal(react.contextWaId, "wamid.OUT1");
    assert.equal(unsup.body, "Mensaje no compatible: Message type unknown");
  });

  it("lee estados con error", () => {
    const events = parseWaWebhook(
      change("messages", {
        statuses: [
          { id: "wamid.OUT1", status: "delivered", timestamp: "10", recipient_id: "34612345678" },
          {
            id: "wamid.OUT2",
            status: "failed",
            timestamp: "11",
            recipient_id: "34612345678",
            errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "No WhatsApp" } }],
          },
        ],
      })
    );
    assert.equal(events.length, 2);
    const failed = events[1];
    assert.equal(failed.kind, "status");
    if (failed.kind !== "status") return;
    assert.equal(failed.status, "failed");
    assert.equal(failed.errorText, "No WhatsApp (131026)");
  });

  it("guarda los ecos de la app del móvil como salientes", () => {
    const events = parseWaWebhook(
      change("smb_message_echoes", {
        message_echoes: [
          { from: "34986000000", to: "34612345678", id: "wamid.ECHO", timestamp: "20", type: "text", text: { body: "Sí, incluido" } },
        ],
      })
    );
    assert.equal(events.length, 1);
    const ev = events[0];
    if (ev.kind !== "message") return assert.fail("esperaba mensaje");
    assert.equal(ev.direction, "OUT");
    assert.equal(ev.origin, "APP");
    assert.equal(ev.phone, "34612345678");
  });

  it("ignora otros números de la misma app y payloads raros", () => {
    const other = change("messages", {
      messages: [{ from: "34600000001", id: "x", timestamp: "1", type: "text", text: { body: "hola" } }],
    });
    (other.entry[0].changes[0].value.metadata as { phone_number_id: string }).phone_number_id = "999";
    assert.equal(parseWaWebhook(other, { phoneNumberId: PNID }).length, 0);
    assert.deepEqual(parseWaWebhook(null), []);
    assert.deepEqual(parseWaWebhook({ entry: "nope" }), []);
  });

  it("no retrocede estados que llegan desordenados", () => {
    assert.equal(shouldApplyStatus("accepted", "sent"), true);
    assert.equal(shouldApplyStatus("read", "delivered"), false);
    assert.equal(shouldApplyStatus("delivered", "read"), true);
    assert.equal(shouldApplyStatus("sent", "failed"), true);
    assert.equal(shouldApplyStatus("read", "failed"), false);
  });

  it("calcula la ventana de 24 h", () => {
    const at = new Date("2026-11-15T10:00:00Z");
    assert.equal(serviceWindowEndsAt(at)?.toISOString(), "2026-11-16T10:00:00.000Z");
    assert.equal(serviceWindowEndsAt(null), null);
  });

  it("formatea teléfono, resumen y respuesta citada", () => {
    assert.equal(formatWaPhone("34612345678"), "+34 612 345 678");
    assert.equal(formatWaPhone("447700900123"), "+447700900123");
    assert.equal(waSnippet({ type: "template", body: "x", docLabel: "Presupuesto PRE-1" }), "📄 Presupuesto PRE-1");
    assert.equal(waSnippet({ type: "document", body: null, mediaFilename: "a.pdf" }), "📄 Documento · a.pdf");
    assert.deepEqual(buildTextPayload({ to: "34612345678", text: "hola", replyToWaId: "w1" }).context, { message_id: "w1" });
    assert.equal("context" in buildTextPayload({ to: "1", text: "x" }), false);
  });
});
