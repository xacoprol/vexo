"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { parseMarketplaceIncomeCsv } from "@/lib/marketplace-income-parse";
import {
  geminiConfigured,
  parseShopifyIvaReportDocument,
} from "@/lib/gemini-shopify-report";
import { resolveUploadMime } from "@/lib/gemini-client";
import { stashSourceDocument } from "@/lib/fiscal-blob";
import { parseShopifyIvaSummaryDraft } from "@/lib/shopify-sales-report";
import type { AmazonTaxReportRow } from "@/lib/amazon-tax-report";
import { Prisma } from "@prisma/client";

export type ParseMarketplaceIncomeResult =
  | {
      ok: true;
      channel: "AMAZON" | "SHOPIFY";
      needsPeriodDate: boolean;
      rows: AmazonTaxReportRow[];
      summary: {
        count: number;
        taxableBase: number;
        taxableVat: number;
        exemptBase: number;
        marketplaceCollectedBase: number;
        marketplaceCollectedVatSkipped: number;
        refundsBase: number;
      };
      sourceFile: string;
      sourceDocumentId: string | null;
    }
  | { ok: false; error: string };

const IMAGE_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return true;
  const t = (file.type || "").toLowerCase();
  return t.includes("csv") || t.includes("text/plain") || t.includes("text/csv");
}

function isImageOrPdf(file: File): boolean {
  const name = file.name.toLowerCase();
  if (/\.(pdf|png|jpe?g|webp|gif)$/i.test(name)) return true;
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  return IMAGE_MIME.has(mime);
}

export async function parseMarketplaceIncomeUpload(
  formData: FormData
): Promise<ParseMarketplaceIncomeResult> {
  await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: "Selecciona un CSV o una captura del Informe IVA de Shopify",
    };
  }

  // Captura / PDF del Informe IVA Shopify
  if (isImageOrPdf(file) && !isCsvFile(file)) {
    if (!geminiConfigured()) {
      return {
        ok: false,
        error:
          "Falta GEMINI_API_KEY para leer capturas. Usa el CSV o configura la clave.",
      };
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = resolveUploadMime(file.type, file.name);
      const draft = await parseShopifyIvaReportDocument({
        buffer,
        mimeType: mime,
        fileName: file.name,
      });
      const parsed = parseShopifyIvaSummaryDraft(draft, file.name);
      const sourceDocumentId = await stashSourceDocument({
        buffer,
        fileName: file.name,
        mimeType: mime,
        category: "INCOME",
        title: `Shopify IVA · ${file.name}`,
      });
      return {
        ok: true,
        channel: "SHOPIFY",
        needsPeriodDate: true,
        rows: parsed.rows,
        summary: parsed.summary,
        sourceFile: file.name,
        sourceDocumentId,
      };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "No se pudo leer el Informe IVA. Prueba con otra captura o el CSV.",
      };
    }
  }

  if (!isCsvFile(file)) {
    return {
      ok: false,
      error:
        "Sube un CSV (Amazon / Shopify por país) o una imagen/PDF del Informe IVA de Shopify.",
    };
  }

  try {
    const text = await file.text();
    const parsed = parseMarketplaceIncomeCsv(text, file.name);
    const sourceDocumentId = await stashSourceDocument({
      buffer: Buffer.from(text, "utf8"),
      fileName: file.name,
      mimeType: file.type || "text/csv",
      category: "INCOME",
      title: `${parsed.channel} · ${file.name}`,
    });
    return {
      ok: true,
      channel: parsed.channel,
      needsPeriodDate: parsed.needsPeriodDate,
      rows: parsed.rows,
      summary: parsed.summary,
      sourceFile: file.name,
      sourceDocumentId,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "No se pudo leer el CSV. Formatos: Amazon tax report o Shopify (Billing country).",
    };
  }
}

export type MarketplaceIncomeInput = {
  channel: string;
  issueDate: string;
  externalKey: string;
  externalRef?: string | null;
  orderId?: string | null;
  sku?: string | null;
  description?: string | null;
  transactionType: string;
  vatStatus: string;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  shipToCountry?: string | null;
  sourceFile?: string | null;
  documentId?: string | null;
  notes?: string | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isUniqueMarketplaceIncomeError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  const target = Array.isArray(err.meta?.target) ? err.meta.target : [];
  return target.includes("channel") && target.includes("externalKey");
}

export async function checkMarketplaceIncomeDuplicates(
  keys: { channel: string; externalKey: string }[]
): Promise<{
  duplicates: {
    channel: string;
    externalKey: string;
    id: string;
    externalRef: string | null;
    issueDate: string;
  }[];
}> {
  await requireAuth();
  if (!keys.length) return { duplicates: [] };

  const byChannel = new Map<string, string[]>();
  for (const k of keys) {
    const channel = String(k.channel || "").toUpperCase();
    const externalKey = String(k.externalKey || "").trim();
    if (!channel || !externalKey) continue;
    const list = byChannel.get(channel) ?? [];
    list.push(externalKey);
    byChannel.set(channel, list);
  }

  const duplicates: {
    channel: string;
    externalKey: string;
    id: string;
    externalRef: string | null;
    issueDate: string;
  }[] = [];

  for (const [channel, externalKeys] of byChannel) {
    const unique = [...new Set(externalKeys)];
    // Neon HTTP: chunks to avoid huge IN clauses
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const found = await prisma.marketplaceIncome.findMany({
        where: { channel, externalKey: { in: chunk } },
        select: {
          id: true,
          channel: true,
          externalKey: true,
          externalRef: true,
          issueDate: true,
        },
      });
      for (const f of found) {
        duplicates.push({
          channel: f.channel,
          externalKey: f.externalKey,
          id: f.id,
          externalRef: f.externalRef,
          issueDate: f.issueDate.toISOString().slice(0, 10),
        });
      }
    }
  }

  return { duplicates };
}

export async function importMarketplaceIncomeRows(
  rows: MarketplaceIncomeInput[]
): Promise<
  | { ok: true; imported: number; skipped: number; skippedRefs: string[] }
  | { ok: false; error: string }
> {
  await requireAuth();

  if (!rows.length) {
    return { ok: false, error: "No hay filas para importar" };
  }

  let imported = 0;
  let skipped = 0;
  const skippedRefs: string[] = [];

  try {
    for (const row of rows) {
      const channel = String(row.channel || "AMAZON").toUpperCase();
      const externalKey = String(row.externalKey || "").trim();
      if (!externalKey) {
        skipped++;
        skippedRefs.push(row.externalRef || "(sin clave)");
        continue;
      }

      const issueDate = row.issueDate ? new Date(row.issueDate) : new Date();
      const subtotal = round2(Number(row.subtotal) || 0);
      const vatAmount = round2(Number(row.vatAmount) || 0);
      const total =
        row.total != null
          ? round2(Number(row.total) || 0)
          : round2(subtotal + vatAmount);

      try {
        await prisma.marketplaceIncome.create({
          data: {
            channel,
            issueDate,
            externalKey,
            externalRef: row.externalRef?.trim() || null,
            orderId: row.orderId?.trim() || null,
            sku: row.sku?.trim() || null,
            description: row.description?.trim() || null,
            transactionType: row.transactionType || "SHIPMENT",
            vatStatus: row.vatStatus || "TAXABLE",
            vatRate: Number(row.vatRate) || 0,
            subtotal,
            vatAmount,
            total,
            shipToCountry: row.shipToCountry?.trim() || null,
            sourceFile: row.sourceFile?.trim() || null,
            documentId: row.documentId?.trim() || null,
            notes: row.notes?.trim() || null,
          },
        });
        imported++;
      } catch (err) {
        if (!isUniqueMarketplaceIncomeError(err)) throw err;
        skipped++;
        skippedRefs.push(row.externalRef || externalKey);
      }
    }

    revalidatePath("/fiscal");
    revalidatePath("/fiscal/income");
    revalidatePath("/fiscal/303");
    revalidatePath("/fiscal/130");

    if (imported === 0 && skipped > 0) {
      return {
        ok: false,
        error: `Todas las líneas ya estaban registradas (${skipped} duplicadas). No se ha importado nada nuevo.`,
      };
    }

    return { ok: true, imported, skipped, skippedRefs: skippedRefs.slice(0, 8) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al importar",
    };
  }
}

export type MarketplaceIncomeFormState = { error?: string };

const VAT_STATUSES = new Set([
  "TAXABLE",
  "EXEMPT",
  "MARKETPLACE_COLLECTED",
]);

function parseMarketplaceForm(formData: FormData) {
  const channelRaw = String(formData.get("channel") ?? "SHOPIFY")
    .toUpperCase()
    .trim();
  const channel =
    channelRaw === "AMAZON" || channelRaw === "SHOPIFY"
      ? channelRaw
      : "SHOPIFY";
  const issueRaw = String(formData.get("issueDate") ?? "").trim();
  const issueDate = issueRaw
    ? new Date(`${issueRaw}T12:00:00`)
    : new Date();
  const vatStatusRaw = String(formData.get("vatStatus") ?? "TAXABLE")
    .toUpperCase()
    .trim();
  const vatStatus = VAT_STATUSES.has(vatStatusRaw)
    ? vatStatusRaw
    : "TAXABLE";
  const subtotal = round2(
    Number(String(formData.get("subtotal") ?? "0").replace(",", ".")) || 0
  );
  const vatAmount = round2(
    Number(String(formData.get("vatAmount") ?? "0").replace(",", ".")) || 0
  );
  const totalRaw = String(formData.get("total") ?? "").trim();
  const total =
    totalRaw === ""
      ? round2(subtotal + vatAmount)
      : round2(Number(totalRaw.replace(",", ".")) || 0);
  const externalKeyRaw = String(formData.get("externalKey") ?? "").trim();
  const externalRef =
    String(formData.get("externalRef") ?? "").trim() || null;

  return {
    channel,
    issueDate,
    externalKey: externalKeyRaw,
    externalRef,
    orderId: String(formData.get("orderId") ?? "").trim() || null,
    sku: String(formData.get("sku") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    transactionType:
      String(formData.get("transactionType") ?? "SHIPMENT").trim() ||
      "SHIPMENT",
    vatStatus,
    vatRate: Number(String(formData.get("vatRate") ?? "0")) || 0,
    subtotal,
    vatAmount,
    total,
    shipToCountry:
      String(formData.get("shipToCountry") ?? "").trim().toUpperCase() ||
      null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function revalidateMarketplaceIncome() {
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/income");
  revalidatePath("/fiscal/303");
  revalidatePath("/fiscal/130");
  revalidatePath("/fiscal/349");
}

export async function createMarketplaceIncome(
  _prev: MarketplaceIncomeFormState,
  formData: FormData
): Promise<MarketplaceIncomeFormState> {
  await requireAuth();
  const data = parseMarketplaceForm(formData);
  if (Number.isNaN(data.issueDate.getTime())) {
    return { error: "Fecha no válida" };
  }
  const externalKey =
    data.externalKey ||
    `MANUAL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await prisma.marketplaceIncome.create({
      data: {
        ...data,
        externalKey,
        sourceFile: "manual",
      },
    });
  } catch (err) {
    if (isUniqueMarketplaceIncomeError(err)) {
      return { error: "Ya existe un ingreso con esa clave externa en el canal" };
    }
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar",
    };
  }

  revalidateMarketplaceIncome();
  redirect("/fiscal/income");
}

export async function updateMarketplaceIncome(
  id: string,
  _prev: MarketplaceIncomeFormState,
  formData: FormData
): Promise<MarketplaceIncomeFormState> {
  await requireAuth();
  const existing = await prisma.marketplaceIncome.findUnique({ where: { id } });
  if (!existing) return { error: "Ingreso no encontrado" };

  const data = parseMarketplaceForm(formData);
  if (Number.isNaN(data.issueDate.getTime())) {
    return { error: "Fecha no válida" };
  }
  const externalKey = data.externalKey || existing.externalKey;

  try {
    await prisma.marketplaceIncome.update({
      where: { id },
      data: {
        ...data,
        externalKey,
      },
    });
  } catch (err) {
    if (isUniqueMarketplaceIncomeError(err)) {
      return { error: "Ya existe un ingreso con esa clave externa en el canal" };
    }
    return {
      error: err instanceof Error ? err.message : "No se pudo guardar",
    };
  }

  revalidateMarketplaceIncome();
  redirect("/fiscal/income");
}

export async function deleteMarketplaceIncome(id: string) {
  await requireAuth();
  await prisma.marketplaceIncome.delete({ where: { id } });
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/income");
  redirect("/fiscal/income");
}

/** Borrado múltiple — deleteMany es seguro con PrismaNeonHTTP. */
export async function deleteMarketplaceIncomes(ids: string[]) {
  await requireAuth();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { deleted: 0 };

  // Chunks por si hay muchas filas
  let deleted = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const result = await prisma.marketplaceIncome.deleteMany({
      where: { id: { in: chunk } },
    });
    deleted += result.count;
  }

  revalidatePath("/fiscal");
  revalidatePath("/fiscal/income");
  revalidatePath("/fiscal/303");
  revalidatePath("/fiscal/130");
  return { deleted };
}
