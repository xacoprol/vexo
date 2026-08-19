import type { MarketplaceIncome, Prisma } from "@prisma/client";
import { isEuCountryCode } from "@/lib/invoice-fiscal";
import { resolveOrCreateClient } from "@/lib/invoice-import";
import { countryNameFromCode } from "@/lib/nif";
import { allocateInvoiceNumber } from "@/lib/numbering";
import { isZeroVatOperation } from "@/lib/recurring";
import { applyVerifactuSeal } from "@/lib/verifactu-seal";

type Db = Prisma.TransactionClient;

/** Ingresos marketplace que aún no tienen factura W3D (evita doble cómputo). */
export const marketplaceIncomeNotInvoicedWhere = {
  invoiceId: null,
} satisfies Prisma.MarketplaceIncomeWhereInput;

function channelLabel(channel: string): string {
  if (channel === "AMAZON") return "Amazon";
  if (channel === "SHOPIFY") return "Shopify";
  return channel;
}

export function mapMarketplaceVatOperation(income: {
  vatStatus: string;
  shipToCountry: string | null;
}): string {
  const cc = (income.shipToCountry ?? "ES").trim().toUpperCase() || "ES";
  const status = (income.vatStatus || "TAXABLE").toUpperCase();

  if (status === "MARKETPLACE_COLLECTED") return "EXENTA";
  if (status === "EXEMPT") {
    if (cc !== "ES" && isEuCountryCode(cc)) return "INTRACOMUNITARIA";
    if (cc !== "ES") return "EXPORTACION";
    return "EXENTA";
  }
  if (cc !== "ES" && isEuCountryCode(cc)) return "INTRACOMUNITARIA";
  if (cc !== "ES") return "EXPORTACION";
  return "SUJETA";
}

export function buildMarketplaceLineDescription(
  income: Pick<
    MarketplaceIncome,
    "description" | "sku" | "orderId" | "channel" | "transactionType"
  >
): string {
  const parts = [
    income.description?.trim(),
    income.sku ? `SKU ${income.sku}` : null,
    income.orderId ? `Pedido ${income.orderId}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `${channelLabel(income.channel)} · ${income.transactionType}`;
}

export function canConvertMarketplaceIncome(income: {
  invoiceId: string | null;
  subtotal: Prisma.Decimal | number;
  transactionType: string;
}): { ok: true } | { ok: false; reason: string } {
  if (income.invoiceId) {
    return { ok: false, reason: "Ya convertido en factura" };
  }
  if (Number(income.subtotal) <= 0) {
    return { ok: false, reason: "Solo ingresos positivos (no devoluciones)" };
  }
  const tt = (income.transactionType || "").toUpperCase();
  if (tt === "REFUND" || tt === "RETURN") {
    return { ok: false, reason: "No se pueden facturar devoluciones" };
  }
  return { ok: true };
}

async function resolveMarketplaceClient(
  tx: Db,
  income: Pick<MarketplaceIncome, "channel" | "shipToCountry">
): Promise<{ clientId: string }> {
  const cc = (income.shipToCountry ?? "ES").trim().toUpperCase() || "ES";
  const name = `Consumidor final (${channelLabel(income.channel)}) · ${cc}`;
  const { clientId } = await resolveOrCreateClient(tx, {
    name,
    nif: `PEND-MKT-${cc}`,
    countryCode: cc,
    addressCountry: countryNameFromCode(cc),
  });
  return { clientId };
}

/**
 * Convierte un ingreso marketplace en factura W3D con correlativo y sello VeriFactu.
 * Debe ejecutarse dentro de una transacción atómica.
 */
export async function convertMarketplaceIncomeInTransaction(
  tx: Db,
  incomeId: string
): Promise<string> {
  const income = await tx.marketplaceIncome.findUnique({ where: { id: incomeId } });
  if (!income) throw new Error("Ingreso no encontrado");

  const check = canConvertMarketplaceIncome(income);
  if (!check.ok) throw new Error(check.reason);

  const vatOperationType = mapMarketplaceVatOperation(income);
  const { clientId } = await resolveMarketplaceClient(tx, income);

  const num = await allocateInvoiceNumber(tx);
  const lastInSeries = await tx.invoice.findFirst({
    where: { seriesId: num.seriesId, status: { not: "ANULADA" } },
    orderBy: { number: "desc" },
  });

  const subtotal = Number(income.subtotal);
  const vatAmount = isZeroVatOperation(vatOperationType)
    ? 0
    : Number(income.vatAmount);
  const total = isZeroVatOperation(vatOperationType)
    ? subtotal
    : Number(income.total);
  const lineVatRate = isZeroVatOperation(vatOperationType) ? 0 : income.vatRate;

  const issueDate = new Date(income.issueDate);
  const dueDate = new Date(issueDate);
  const channel = channelLabel(income.channel);
  const noteParts = [
    `Generada desde ingreso ${channel} · ${income.externalRef ?? income.externalKey}`,
    income.notes?.trim(),
  ].filter(Boolean);

  const invoice = await tx.invoice.create({
    data: {
      seriesId: num.seriesId,
      seriesPrefix: num.seriesPrefix,
      number: num.number,
      fullNumber: num.fullNumber,
      clientId,
      issueDate,
      dueDate,
      status: "PAGADA",
      paymentMethod: income.channel === "SHOPIFY" ? "Shopify" : "Marketplace",
      notes: noteParts.join(" · ") || null,
      vatOperationType,
      subtotal,
      vatAmount,
      irpfRate: 0,
      irpfAmount: 0,
      total,
      previousInvoiceId: lastInSeries?.id ?? null,
    },
  });

  await tx.invoiceLine.create({
    data: {
      invoiceId: invoice.id,
      sortOrder: 0,
      description: buildMarketplaceLineDescription(income),
      quantity: 1,
      unitPrice: subtotal,
      vatRate: lineVatRate,
      discountPct: 0,
      lineSubtotal: subtotal,
      lineVat: vatAmount,
      lineTotal: total,
    },
  });

  if (total > 0) {
    await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: total,
        paidAt: issueDate,
        method: income.channel === "SHOPIFY" ? "Shopify" : "Marketplace",
        notes: `Cobro ${channel}`,
      },
    });
  }

  await applyVerifactuSeal(tx, invoice.id);

  await tx.marketplaceIncome.update({
    where: { id: incomeId },
    data: { invoiceId: invoice.id, convertedAt: new Date() },
  });

  return invoice.id;
}
