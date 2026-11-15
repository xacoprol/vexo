import { isSmtpConfigured } from "@/lib/mail";
import { blobConfigured } from "@/lib/fiscal-blob";
import { geminiConfigured } from "@/lib/gemini-expense";
import { getWhatsappWebhookConfig, isWhatsappConfigured } from "@/lib/whatsapp";

export type IntegrationHealth = {
  id: "smtp" | "whatsapp" | "whatsapp-inbox" | "blob" | "gemini";
  label: string;
  ok: boolean;
  hint: string;
};

export function getIntegrationHealth(): IntegrationHealth[] {
  const smtp = isSmtpConfigured();
  const blob = blobConfigured();
  const gemini = geminiConfigured();
  const whatsapp = isWhatsappConfigured();
  const whatsappInbox = whatsapp && getWhatsappWebhookConfig() !== null;

  return [
    {
      id: "smtp",
      label: "Email (SMTP)",
      ok: smtp,
      hint: smtp
        ? "Listo para recordatorios fiscales y cobros"
        : "Falta SMTP_HOST / USER / PASS / FROM en Vercel o .env.local",
    },
    {
      id: "whatsapp",
      label: "WhatsApp (Meta Cloud API)",
      ok: whatsapp,
      hint: whatsapp
        ? "Listo para enviar presupuestos y facturas por WhatsApp"
        : "Falta WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID (ver docs/whatsapp.md)",
    },
    {
      id: "whatsapp-inbox",
      label: "WhatsApp: recibir respuestas",
      ok: whatsappInbox,
      hint: whatsappInbox
        ? "Webhook listo: las respuestas llegan a la bandeja WhatsApp"
        : "Falta WHATSAPP_WEBHOOK_VERIFY_TOKEN / WHATSAPP_APP_SECRET y suscribir el webhook en Meta (docs/whatsapp.md)",
    },
    {
      id: "blob",
      label: "Archivo fiscal (Blob)",
      ok: blob,
      hint: blob
        ? "PDFs de presentados y justificantes se pueden guardar"
        : "Falta BLOB_READ_WRITE_TOKEN (Vercel Blob)",
    },
    {
      id: "gemini",
      label: "OCR Gemini",
      ok: gemini,
      hint: gemini
        ? "Lectura de gastos y modelos PDF disponible"
        : "Falta GEMINI_API_KEY (o GOOGLE_API_KEY)",
    },
  ];
}
