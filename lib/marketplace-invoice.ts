import type { MarketplaceIncome, Prisma, PrismaClient } from "@prisma/client";
import { isEuCountryCode } from "@/lib/invoice-fiscal";
import { resolveOrCreateClient } from "@/lib/invoice-import";
import { countryNameFromCode } from "@/lib/nif";
import { allocateInvoiceNumber } from "@/lib/numbering";
import { isZeroVatOperation } from "@/lib/recurring";
import { applyVerifactuSeal } from "@/lib/verifactu-seal";

/**
 * PrismaNeonHTTP no soporta $transaction interactiva.
 * Usamos el cliente raíz (o un tx si algún día hay driver TCP).
 */
type Db = PrismaClient | Prisma.TransactionClient;

/** Ingresos marketplace que aún no tienen factura W3D (evita doble cómputo). */
export const marketplaceIncomeNotInvoicedWhere = {
  invoiceId: null,
} satisfies Prisma.MarketplaceIncomeWhereInput;

function channelLabel(channel: string): string {
  if (channel === "AMAZON") return "Amazon";
  if (channel === "SHOPIFY") return "Shopify";
  return channel;
}

function isInvoiceNumberConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "P2002") return true;
  return /unique constraint|seriesId_number/i.test(String(e.message ?? ""));
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
  db: Db,
  income: Pick<MarketplaceIncome, "channel" | "shipToCountry">
): Promise<{ clientId: string }> {
  const cc = (income.shipToCountry ?? "ES").trim().toUpperCase() || "ES";
  const name = `Consumidor final (${channelLabel(income.channel)}) · ${cc}`;
  const { clientId } = await resolveOrCreateClient(db, {
    name,
    nif: `PEND-MKT-${cc}`,
    countryCode: cc,
    addressCountry: countryNameFromCode(cc),
  });
  return { clientId };
}

/**
 * Convierte un ingreso marketplace en factura W3D con correlativo y sello VeriFactu.
 *
 * Neon HTTP: secuencia con compensación (sin $transaction interactiva).
 * Si falla tras crear la factura, se intenta borrar el borrador/huérfano.
 */
export async function convertMarketplaceIncomeToInvoiceRecord(
  db: Db,
  incomeId: string
): Promise<string> {
  const income = await db.marketplaceIncome.findUnique({
    where: { id: incomeId },
  });
  if (!income) throw new Error("Ingreso no encontrado");

  const check = canConvertMarketplaceIncome(income);
  if (!check.ok) throw new Error(check.reason);

  const vatOperationType = mapMarketplaceVatOperation(income);
  const { clientId } = await resolveMarketplaceClient(db, income);

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
  const paymentMethod =
    income.channel === "SHOPIFY" ? "Shopify" : "Marketplace";

  let invoice: { id: string; seriesId: string; number: number } | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const num = await allocateInvoiceNumber(db);
    const lastInSeries = await db.invoice.findFirst({
      where: { seriesId: num.seriesId, status: { not: "ANULADA" } },
      orderBy: { number: "desc" },
    });
    try {
      invoice = await db.invoice.create({
        data: {
          seriesId: num.seriesId,
          seriesPrefix: num.seriesPrefix,
          number: num.number,
          fullNumber: num.fullNumber,
          clientId,
          issueDate,
          dueDate,
          status: "PAGADA",
          fiscalStatus: "ISSUED",
          invoiceKind: "SIMPLIFIED",
          paymentMethod,
          notes: noteParts.join(" · ") || null,
          vatOperationType,
          subtotal,
          vatAmount,
          irpfRate: 0,
          irpfAmount: 0,
          total,
          previousInvoiceId: lastInSeries?.id ?? null,
        },
        select: { id: true, seriesId: true, number: true },
      });
      break;
    } catch (err) {
      if (!isInvoiceNumberConflict(err) || attempt === 2) throw err;
    }
  }

  if (!invoice) {
    throw new Error("No se pudo reservar un número de factura válido");
  }

  try {
    await db.invoiceLine.create({
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
      await db.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: total,
          paidAt: issueDate,
          method: paymentMethod,
          notes: `Cobro ${channel}`,
        },
      });
    }

    await applyVerifactuSeal(db, invoice.id, { markIssued: true });

    await db.marketplaceIncome.update({
      where: { id: incomeId },
      data: { invoiceId: invoice.id, convertedAt: new Date() },
    });

    return invoice.id;
  } catch (err) {
    console.error(
      "[convertMarketplaceIncome] Fallo tras crear factura; compensación delete",
      {
        invoiceId: invoice.id,
        incomeId,
        err: err instanceof Error ? err.message : err,
      }
    );
    try {
      await db.invoice.delete({ where: { id: invoice.id } });
    } catch (delErr) {
      console.error(
        "[convertMarketplaceIncome] Rollback delete falló — factura huérfana",
        {
          invoiceId: invoice.id,
          err: delErr instanceof Error ? delErr.message : delErr,
        }
      );
    }
    throw err instanceof Error
      ? err
      : new Error("No se pudo convertir en factura");
  }
}

/** @deprecated Prefer convertMarketplaceIncomeToInvoiceRecord (sin $transaction). */
export async function convertMarketplaceIncomeInTransaction(
  tx: Db,
  incomeId: string
): Promise<string> {
  return convertMarketplaceIncomeToInvoiceRecord(tx, incomeId);
}
