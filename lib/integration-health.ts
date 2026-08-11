import { isSmtpConfigured } from "@/lib/mail";
import { blobConfigured } from "@/lib/fiscal-blob";
import { geminiConfigured } from "@/lib/gemini-expense";

export type IntegrationHealth = {
  id: "smtp" | "blob" | "gemini";
  label: string;
  ok: boolean;
  hint: string;
};

export function getIntegrationHealth(): IntegrationHealth[] {
  const smtp = isSmtpConfigured();
  const blob = blobConfigured();
  const gemini = geminiConfigured();

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
