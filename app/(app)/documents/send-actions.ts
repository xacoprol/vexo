"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  fillEmailTemplate,
  isSmtpConfigured,
  sendMail,
  smtpConfigHint,
} from "@/lib/mail";
import {
  buildInvoicePdf,
  buildQuotePdf,
} from "@/lib/pdf/build-document-pdf";
import { quoteKindLabel, quotePdfFilename } from "@/lib/quote-kind";
import {
  fillWhatsappPreview,
  isWhatsappConfigured,
  normalizeWhatsappPhone,
  sendWhatsappDocument,
  whatsappConfigHint,
} from "@/lib/whatsapp";
import { recordOutgoingWhatsapp } from "@/lib/whatsapp-inbox";

export type SendDocKind = "quote" | "invoice";

export type SendDocDraft = {
  configured: boolean;
  configHint: string;
  to: string;
  subject: string;
  body: string;
  docLabel: string;
  fullNumber: string;
  attachName: string;
};

/** Borrador de envío de presupuesto/factura: email + canal WhatsApp */
export type SendDocumentDraft = SendDocDraft & {
  whatsapp: {
    configured: boolean;
    configHint: string;
    /** Teléfono del cliente en formato internacional, o tal cual si no se pudo normalizar */
    to: string;
    /** Texto fijo de la plantilla aprobada, ya rellenado */
    preview: string;
  };
};

export type SendDocResult = { ok: true } | { error: string };

export async function getSendDocumentDraft(
  kind: SendDocKind,
  id: string
): Promise<SendDocumentDraft | { error: string }> {
  await requireAuth();
  const settings = await prisma.companySettings.findFirst();
  const company =
    settings?.companyName?.trim() || settings?.name?.trim() || "Empresa";

  if (kind === "quote") {
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!quote) return { error: "Presupuesto no encontrado" };
    const client = quote.client.name;
    const contact = quote.client.contactPerson?.trim() || client;
    const kind = quoteKindLabel(quote.isProforma);
    return {
      configured: isSmtpConfigured(),
      configHint: smtpConfigHint(),
      to: quote.client.email?.trim() || "",
      subject: fillEmailTemplate(
        settings?.emailSubject ?? "Documento {{number}} de {{company}}",
        { number: quote.fullNumber, company, client, contact }
      ),
      body: fillEmailTemplate(
        settings?.emailBody ??
          "Hola {{contact}},\n\nAdjuntamos el documento {{number}}.\n\nUn saludo,\n{{company}}",
        { number: quote.fullNumber, company, client, contact }
      ),
      docLabel: kind,
      fullNumber: quote.fullNumber,
      attachName: quotePdfFilename(quote.fullNumber, quote.isProforma),
      whatsapp: whatsappDraft(quote.client, [
        contact,
        quote.isProforma ? "la proforma" : "el presupuesto",
        quote.fullNumber,
        company,
      ]),
    };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!invoice) return { error: "Factura no encontrada" };
  const client = invoice.client.name;
  const contact = invoice.client.contactPerson?.trim() || client;
  return {
    configured: isSmtpConfigured(),
    configHint: smtpConfigHint(),
    to: invoice.client.email?.trim() || "",
    subject: fillEmailTemplate(
      settings?.emailSubject ?? "Documento {{number}} de {{company}}",
      { number: invoice.fullNumber, company, client, contact }
    ),
    body: fillEmailTemplate(
      settings?.emailBody ??
        "Hola {{contact}},\n\nAdjuntamos el documento {{number}}.\n\nUn saludo,\n{{company}}",
      { number: invoice.fullNumber, company, client, contact }
    ),
    docLabel: "Factura",
    fullNumber: invoice.fullNumber,
    attachName: `Factura_${invoice.fullNumber}.pdf`,
    whatsapp: whatsappDraft(invoice.client, [
      contact,
      "la factura",
      invoice.fullNumber,
      company,
    ]),
  };
}

function whatsappDraft(
  client: { phone: string | null; countryCode: string },
  params: string[]
): SendDocumentDraft["whatsapp"] {
  const raw = client.phone?.trim() || "";
  const normalized = normalizeWhatsappPhone(raw, client.countryCode);
  return {
    configured: isWhatsappConfigured(),
    configHint: whatsappConfigHint(),
    to: normalized ? `+${normalized}` : raw,
    preview: fillWhatsappPreview(params),
  };
}

export async function sendDocumentEmail(
  kind: SendDocKind,
  id: string,
  payload: { to: string; subject: string; body: string; attachPdf: boolean }
): Promise<SendDocResult> {
  await requireAuth();

  const to = payload.to.trim();
  if (!to) return { error: "Indica el email del destinatario" };
  if (!payload.subject.trim()) return { error: "El asunto es obligatorio" };
  if (!isSmtpConfigured()) return { error: smtpConfigHint() };

  try {
    const pdf =
      kind === "quote" ? await buildQuotePdf(id) : await buildInvoicePdf(id);

    await sendMail({
      to,
      subject: payload.subject.trim(),
      text: payload.body,
      attachments: payload.attachPdf
        ? [
            {
              filename: pdf.filename,
              content: pdf.buffer,
              contentType: "application/pdf",
            },
          ]
        : undefined,
    });

    if (kind === "quote") {
      await prisma.quote.update({
        where: { id },
        data: { status: "ENVIADO" },
      });
      revalidatePath("/quotes");
      revalidatePath(`/quotes/${id}`);
    } else {
      revalidatePath("/invoices");
      revalidatePath(`/invoices/${id}`);
    }

    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "No se pudo enviar el correo",
    };
  }
}

export async function sendDocumentWhatsapp(
  kind: SendDocKind,
  id: string,
  payload: { to: string }
): Promise<SendDocResult> {
  await requireAuth();

  if (!isWhatsappConfigured()) return { error: whatsappConfigHint() };

  try {
    const settings = await prisma.companySettings.findFirst();
    const company =
      settings?.companyName?.trim() || settings?.name?.trim() || "Empresa";

    const doc =
      kind === "quote"
        ? await prisma.quote.findUnique({
            where: { id },
            select: {
              fullNumber: true,
              isProforma: true,
              client: {
                select: {
                  id: true,
                  name: true,
                  contactPerson: true,
                  countryCode: true,
                },
              },
            },
          })
        : await prisma.invoice.findUnique({
            where: { id },
            select: {
              fullNumber: true,
              client: {
                select: {
                  id: true,
                  name: true,
                  contactPerson: true,
                  countryCode: true,
                },
              },
            },
          });
    if (!doc) {
      return {
        error:
          kind === "quote" ? "Presupuesto no encontrado" : "Factura no encontrada",
      };
    }

    const to = normalizeWhatsappPhone(payload.to, doc.client.countryCode);
    if (!to) {
      return {
        error:
          "Teléfono no válido. Escríbelo con prefijo internacional, p. ej. +34 612 345 678.",
      };
    }

    const docPhrase =
      kind === "invoice"
        ? "la factura"
        : "isProforma" in doc && doc.isProforma
          ? "la proforma"
          : "el presupuesto";

    const pdf =
      kind === "quote" ? await buildQuotePdf(id) : await buildInvoicePdf(id);

    const bodyParams = [
      doc.client.contactPerson?.trim() || doc.client.name,
      docPhrase,
      doc.fullNumber,
      company,
    ];
    const sent = await sendWhatsappDocument({
      to,
      pdf: { buffer: pdf.buffer, filename: pdf.filename },
      bodyParams,
    });

    // Para que la respuesta del cliente aparezca en la bandeja bajo este envío
    const docLabel =
      kind === "invoice"
        ? `Factura ${doc.fullNumber}`
        : `${"isProforma" in doc && doc.isProforma ? "Proforma" : "Presupuesto"} ${doc.fullNumber}`;
    await recordOutgoingWhatsapp({
      waMessageId: sent.messageId,
      phone: to,
      type: "template",
      body: fillWhatsappPreview(bodyParams),
      clientId: doc.client.id,
      quoteId: kind === "quote" ? id : null,
      invoiceId: kind === "invoice" ? id : null,
      docLabel,
    });
    revalidatePath("/whatsapp");

    if (kind === "quote") {
      await prisma.quote.update({
        where: { id },
        data: { status: "ENVIADO" },
      });
      revalidatePath("/quotes");
      revalidatePath(`/quotes/${id}`);
    } else {
      revalidatePath("/invoices");
      revalidatePath(`/invoices/${id}`);
    }

    return { ok: true };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "No se pudo enviar el WhatsApp",
    };
  }
}
