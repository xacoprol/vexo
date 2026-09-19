/**
 * Parser del CSV de facturas de comisiones Amazon (Fees Invoice / ES-AEU-…).
 * Columnas: Transaction Date, Fees Invoice Number, Fee ID, Total Fees (VAT-Inclusive).
 *
 * Amazon EU S.à r.l. (LU) → ISP / intracomunitaria para vendedor español con NIF-IVA.
 * El importe del CSV es lo cobrado (sin IVA añadido por Amazon en reverse charge).
 */

import { parseCsv } from "@/lib/amazon-tax-report";
import type { ParsedExpenseDraft } from "@/lib/gemini-expense";

const REQUIRED_HEADERS = [
  "Fees Invoice Number",
  "Fee ID",
  "Total Fees (VAT-Inclusive)",
] as const;

const AMAZON_EU_SUPPLIER = "Amazon EU S.à r.l.";
const AMAZON_EU_VAT = "LU20260743";
const VAT_RATE = 21;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseNum(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Amazon fees CSV dates: MM/DD/YYYY */
export function parseAmazonFeesDate(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdy) {
    const mo = mdy[1].padStart(2, "0");
    const d = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${mo}-${d}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function normalizeHeader(h: string): string {
  return h.trim().replace(/^"|"$/g, "");
}

export function isAmazonFeesInvoice(headers: string[]): boolean {
  const set = new Set(headers.map(normalizeHeader));
  return REQUIRED_HEADERS.every((h) => set.has(h));
}

function feeLabelEs(feeId: string): string {
  const map: Record<string, string> = {
    "Referral Fee": "comisión venta",
    "Digital Service Fee": "tasa servicio digital",
    "Shipping Fee": "envío",
    "Refund Administration Fee": "gestión devoluciones",
    "FBA Per Unit Fulfillment Fee": "FBA preparación",
    "FBA Weight Based Fee": "FBA peso",
    "FBA Storage Fee": "FBA almacenamiento",
    "Advertising Cost": "publicidad",
  };
  return map[feeId] ?? feeId;
}

type InvoiceAgg = {
  invoiceNumber: string;
  marketplace: string | null;
  maxDate: string;
  total: number;
  lineCount: number;
  byFee: Map<string, number>;
};

/**
 * Agrupa líneas del CSV por nº de factura de comisiones → borradores de gasto.
 */
export function parseAmazonFeesInvoiceCsv(
  text: string,
  sourceFile?: string
): ParsedExpenseDraft[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) {
    throw new Error("El CSV de comisiones Amazon está vacío");
  }

  const headers = table[0].map(normalizeHeader);
  if (!isAmazonFeesInvoice(headers)) {
    throw new Error(
      "No parece el CSV de facturas de comisiones Amazon (Fees Invoice Number / Fee ID / Total Fees)."
    );
  }

  const idx = (name: string) => headers.indexOf(name);
  const iDate = idx("Transaction Date");
  const iInvoice = idx("Fees Invoice Number");
  const iMarketplace = idx("Marketplace");
  const iFee = idx("Fee ID");
  const iTotal = idx("Total Fees (VAT-Inclusive)");

  const byInvoice = new Map<string, InvoiceAgg>();

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (!row || row.every((c) => !String(c ?? "").trim())) continue;

    const invoiceNumber = String(row[iInvoice] ?? "")
      .trim()
      .toUpperCase();
    if (!invoiceNumber) continue;

    const amount = parseNum(row[iTotal]);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const feeId = String(row[iFee] ?? "").trim() || "Fee";
    const date = parseAmazonFeesDate(
      iDate >= 0 ? row[iDate] : undefined
    );
    const marketplace =
      iMarketplace >= 0
        ? String(row[iMarketplace] ?? "").trim() || null
        : null;

    let agg = byInvoice.get(invoiceNumber);
    if (!agg) {
      agg = {
        invoiceNumber,
        marketplace,
        maxDate: date,
        total: 0,
        lineCount: 0,
        byFee: new Map(),
      };
      byInvoice.set(invoiceNumber, agg);
    }

    agg.total = round2(agg.total + amount);
    agg.lineCount += 1;
    agg.byFee.set(feeId, round2((agg.byFee.get(feeId) ?? 0) + amount));
    if (date > agg.maxDate) agg.maxDate = date;
    if (!agg.marketplace && marketplace) agg.marketplace = marketplace;
  }

  if (byInvoice.size === 0) {
    throw new Error("No se encontraron líneas de comisiones en el CSV");
  }

  const drafts: ParsedExpenseDraft[] = [];

  for (const agg of byInvoice.values()) {
    const subtotal = round2(agg.total);
    const vatAmount = round2(subtotal * (VAT_RATE / 100));
    const feeParts = [...agg.byFee.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, amt]) => `${feeLabelEs(id)} ${amt.toFixed(2)}€`)
      .slice(0, 6);

    const market = agg.marketplace ? ` · ${agg.marketplace}` : "";
    const description = `Comisiones Amazon ${agg.invoiceNumber}${market} (${agg.lineCount} líneas)`;
    const notes = [
      feeParts.join("; "),
      sourceFile ? `Origen: ${sourceFile}` : null,
      "IVA con inversión del sujeto pasivo (Amazon EU / Luxemburgo).",
    ]
      .filter(Boolean)
      .join("\n");

    drafts.push({
      issueDate: agg.maxDate,
      supplierName: AMAZON_EU_SUPPLIER,
      supplierNif: AMAZON_EU_VAT,
      invoiceNumber: agg.invoiceNumber,
      description,
      category: "SOFTWARE",
      vatOperationType: "SERVICIO_INTRACOMUNITARIO",
      subtotal,
      vatRate: VAT_RATE,
      vatAmount,
      total: subtotal,
      notes,
      confidence: "high",
      activityFit: "ok",
      activityFitReason: null,
      homeOfficeTip: null,
    });
  }

  drafts.sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  return drafts;
}
