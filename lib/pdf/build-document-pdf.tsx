import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { calculateDocument, formatDate } from "@/lib/calculations";
import { InvoicePdfDocument } from "@/lib/pdf/InvoiceDocument";
import {
  quotePdfFilename,
  quotePdfTitle,
} from "@/lib/quote-kind";
import { buildVerifactuQrUrl, formatFechaExpedicion } from "@/lib/verifactu";

export async function buildQuotePdf(
  quoteId: string
): Promise<{ buffer: Buffer; fullNumber: string; filename: string }> {
  const [quote, settings] = await Promise.all([
    prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        client: true,
        lines: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.companySettings.findFirst(),
  ]);
  if (!quote || !settings) throw new Error("Presupuesto no encontrado");

  const totals = calculateDocument(
    quote.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      vatRate: l.vatRate,
      discountPct: l.discountPct,
    })),
    0,
    quote.discountPct
  );

  const doc = (
    <InvoicePdfDocument
      title={quotePdfTitle(quote.isProforma)}
      number={quote.fullNumber}
      issueDate={formatDate(quote.issueDate)}
      dueDate={formatDate(quote.validUntil)}
      brandName={settings.companyName?.trim() || settings.name || "Empresa"}
      logoUrl={settings.logoUrl}
      issuer={{
        name: settings.name,
        nif: settings.nif,
        addressStreet: settings.addressStreet,
        addressCity: settings.addressCity,
        addressProvince: settings.addressProvince,
        addressZip: settings.addressZip,
        addressCountry: settings.addressCountry,
        email: settings.email,
        phone: settings.phone,
      }}
      client={{
        name: quote.client.name,
        nif: quote.client.nif,
        countryCode: quote.client.countryCode,
        addressStreet: quote.client.addressStreet,
        addressCity: quote.client.addressCity,
        addressProvince: quote.client.addressProvince,
        addressZip: quote.client.addressZip,
        addressCountry: quote.client.addressCountry,
        email: quote.client.email,
        phone: quote.client.phone,
      }}
      lines={quote.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        vatRate: l.vatRate,
        discountPct: l.discountPct,
        lineSubtotal: Number(l.lineSubtotal),
      }))}
      subtotal={Number(quote.subtotal)}
      vatAmount={Number(quote.vatAmount)}
      total={Number(quote.total)}
      specialDiscountPct={totals.discountPct}
      specialDiscountAmount={totals.discountAmount}
      showPayment={false}
      notes={
        [quote.notes, quote.conditions]
          .filter(Boolean)
          .join("\n")
          .replace(/Forma de cobro:\s*.+/i, "")
          .trim() || null
      }
    />
  );

  const buffer = Buffer.from(await renderToBuffer(doc));
  return {
    buffer,
    fullNumber: quote.fullNumber,
    filename: quotePdfFilename(quote.fullNumber, quote.isProforma),
  };
}

export async function buildInvoicePdf(
  invoiceId: string
): Promise<{ buffer: Buffer; fullNumber: string; filename: string }> {
  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        lines: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.companySettings.findFirst(),
  ]);
  if (!invoice || !settings) throw new Error("Factura no encontrada");

  let verifactuQrDataUrl: string | null = null;
  const qrUrl =
    invoice.verifactuQrUrl ||
    (settings.nif && invoice.verifactuHash
      ? buildVerifactuQrUrl({
          nif: settings.nif,
          numSerie: invoice.fullNumber,
          fechaExpedicion: formatFechaExpedicion(invoice.issueDate),
          importeTotal: Number(invoice.total),
        })
      : null);
  if (qrUrl) {
    verifactuQrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#1A1528", light: "#FFFFFF" },
    });
  }

  const doc = (
    <InvoicePdfDocument
      title="FACTURA"
      number={invoice.fullNumber}
      issueDate={formatDate(invoice.issueDate)}
      dueDate={formatDate(invoice.dueDate)}
      status={invoice.status}
      brandName={settings.companyName?.trim() || settings.name || "Empresa"}
      logoUrl={settings.logoUrl}
      issuer={{
        name: settings.name,
        nif: settings.nif,
        addressStreet: settings.addressStreet,
        addressCity: settings.addressCity,
        addressProvince: settings.addressProvince,
        addressZip: settings.addressZip,
        addressCountry: settings.addressCountry,
        email: settings.email,
        phone: settings.phone,
      }}
      client={{
        name: invoice.client.name,
        nif: invoice.client.nif,
        countryCode: invoice.client.countryCode,
        addressStreet: invoice.client.addressStreet,
        addressCity: invoice.client.addressCity,
        addressProvince: invoice.client.addressProvince,
        addressZip: invoice.client.addressZip,
        addressCountry: invoice.client.addressCountry,
        email: invoice.client.email,
        phone: invoice.client.phone,
      }}
      lines={invoice.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        vatRate: l.vatRate,
        discountPct: l.discountPct,
        lineSubtotal: Number(l.lineSubtotal),
      }))}
      subtotal={Number(invoice.subtotal)}
      vatAmount={Number(invoice.vatAmount)}
      irpfRate={invoice.irpfRate}
      irpfAmount={Number(invoice.irpfAmount)}
      total={Number(invoice.total)}
      paymentMethod={invoice.paymentMethod || "Transferencia"}
      notes={invoice.notes}
      bankIban={settings.bankIban}
      bankName={settings.bankName}
      bizumPhone={settings.bizumPhone}
      showPayment
      verifactuQrDataUrl={verifactuQrDataUrl}
      verifactuHash={invoice.verifactuHash}
    />
  );

  const buffer = Buffer.from(await renderToBuffer(doc));
  return {
    buffer,
    fullNumber: invoice.fullNumber,
    filename: `Factura_${invoice.fullNumber}.pdf`,
  };
}
