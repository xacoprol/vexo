/** Parser del Amazon VAT Transaction Report (taxReport_*.csv). */

export type MarketplaceVatStatus =
  | "TAXABLE"
  | "EXEMPT"
  | "MARKETPLACE_COLLECTED";

export type MarketplaceChannel = "AMAZON" | "SHOPIFY";

export type AmazonTaxReportRow = {
  channel: MarketplaceChannel;
  issueDate: string; // YYYY-MM-DD
  externalKey: string;
  externalRef: string | null;
  orderId: string | null;
  sku: string | null;
  description: string | null;
  transactionType: string;
  vatStatus: MarketplaceVatStatus;
  vatRate: number; // percent e.g. 21
  subtotal: number;
  vatAmount: number;
  total: number;
  shipToCountry: string | null;
  notes: string | null;
  /** Flags de calidad de import (p. ej. país imposible). No liquidar como op. válida. */
  importFlags?: Array<"IMPORT_DATA_INVALID" | "NEEDS_REVIEW">;
};

export type AmazonTaxReportParseResult = {
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
};

const REQUIRED_HEADERS = [
  "Transaction Type",
  "Tax Calculation Reason Code",
  "Tax Collection Responsibility",
  "Tax Rate",
  "OUR_PRICE Tax Exclusive Selling Price",
  "OUR_PRICE Tax Amount",
] as const;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseNum(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Amazon dates like "11-Jul-2026 UTC" → YYYY-MM-DD */
export function parseAmazonDate(raw: string | undefined): string {
  const s = String(raw ?? "")
    .replace(/\s+UTC$/i, "")
    .trim();
  if (!s) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s);
  if (m) {
    const months: Record<string, string> = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };
    const mo = months[m[2]];
    if (mo) {
      return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`;
    }
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** CSV split that respects quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    // skip fully empty trailing lines
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    pushCell();
    pushRow();
  }
  return rows;
}

export function isAmazonTaxReport(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return REQUIRED_HEADERS.every((h) => set.has(h));
}

function col(
  map: Record<string, string>,
  ...names: string[]
): string {
  for (const n of names) {
    if (map[n] != null && map[n] !== "") return map[n];
  }
  return "";
}

function moneySum(map: Record<string, string>, keys: string[]): number {
  return round2(keys.reduce((s, k) => s + parseNum(map[k]), 0));
}

function buildExternalKey(parts: {
  transactionId: string;
  asin: string;
  transactionType: string;
  vatInvoice: string;
  sku: string;
  shipmentId: string;
}): string {
  return [
    parts.transactionId || parts.shipmentId || "no-tx",
    parts.asin || parts.sku || "no-asin",
    parts.transactionType || "UNKNOWN",
    parts.vatInvoice || "no-inv",
  ].join("|");
}

export function parseAmazonTaxReportCsv(
  text: string,
  sourceFile?: string
): AmazonTaxReportParseResult {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) {
    throw new Error("El CSV está vacío o no tiene filas de datos");
  }

  const headers = table[0].map((h) => h.trim().replace(/^"|"$/g, ""));
  if (!isAmazonTaxReport(headers)) {
    throw new Error(
      "No parece un Amazon VAT Tax Report. Necesita columnas como «VAT Invoice Number» y «Tax Calculation Reason Code»."
    );
  }

  const rows: AmazonTaxReportRow[] = [];
  let marketplaceCollectedVatSkipped = 0;

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells.length || cells.every((c) => !String(c).trim())) continue;

    const map: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      map[headers[c]] = (cells[c] ?? "").trim();
    }

    const transactionType = col(map, "Transaction Type") || "SHIPMENT";
    const reason = col(map, "Tax Calculation Reason Code").toUpperCase();
    const responsibility = col(
      map,
      "Tax Collection Responsibility"
    ).toUpperCase();
    const taxRateFrac = parseNum(col(map, "Tax Rate"));
    const vatRatePct = round2(taxRateFrac * 100);

    const subtotal = moneySum(map, [
      "OUR_PRICE Tax Exclusive Selling Price",
      "OUR_PRICE Tax Exclusive Promo Amount",
      "SHIPPING Tax Exclusive Selling Price",
      "SHIPPING Tax Exclusive Promo Amount",
      "GIFTWRAP Tax Exclusive Selling Price",
      "GIFTWRAP Tax Exclusive Promo Amount",
    ]);
    const rawVat = moneySum(map, [
      "OUR_PRICE Tax Amount",
      "OUR_PRICE Tax Amount Promo",
      "SHIPPING Tax Amount",
      "SHIPPING Tax Amount Promo",
      "GIFTWRAP Tax Amount",
      "GIFTWRAP Tax Amount Promo",
    ]);

    const scheme = col(map, "Tax Reporting Scheme").toUpperCase();
    let vatAmount = rawVat;
    let vatStatus: MarketplaceVatStatus;
    const isMarketplaceCollected =
      responsibility === "MARKETPLACE" ||
      scheme.includes("OSS") ||
      scheme.includes("VCS");
    if (isMarketplaceCollected) {
      vatStatus = "MARKETPLACE_COLLECTED";
      marketplaceCollectedVatSkipped = round2(
        marketplaceCollectedVatSkipped + rawVat
      );
      vatAmount = 0;
    } else if (
      reason === "EXEMPT" ||
      vatRatePct === 0 ||
      col(map, "Product Tax Code").toUpperCase().includes("NOTAX")
    ) {
      vatStatus = "EXEMPT";
      vatAmount = 0;
    } else {
      vatStatus = "TAXABLE";
    }

    const vatInvoice = col(map, "VAT Invoice Number") || null;
    const orderId = col(map, "Order ID") || null;
    const sku = col(map, "SKU") || null;
    const asin = col(map, "ASIN") || null;
    const shipTo = col(map, "Ship To Country") || null;
    const qty = col(map, "Quantity");

    const issueDate = parseAmazonDate(
      col(map, "Tax Calculation Date") ||
        col(map, "Shipment Date") ||
        col(map, "Order Date")
    );

    const externalKey = buildExternalKey({
      transactionId: col(map, "Transaction ID"),
      asin: asin ?? "",
      transactionType,
      vatInvoice: vatInvoice ?? "",
      sku: sku ?? "",
      shipmentId: col(map, "Shipment ID"),
    });

    const total = round2(subtotal + vatAmount);
    const descParts = [
      transactionType,
      sku ? `SKU ${sku}` : null,
      asin ? `ASIN ${asin}` : null,
      qty ? `×${qty}` : null,
      shipTo ? `→ ${shipTo}` : null,
    ].filter(Boolean);

    const notesParts = [
      sourceFile ? `Archivo: ${sourceFile}` : null,
      col(map, "Tax Reporting Scheme")
        ? `Scheme: ${col(map, "Tax Reporting Scheme")}`
        : null,
      responsibility ? `Collection: ${responsibility}` : null,
    ].filter(Boolean);

    rows.push({
      channel: "AMAZON",
      issueDate,
      externalKey,
      externalRef: vatInvoice,
      orderId,
      sku,
      description: descParts.join(" · "),
      transactionType,
      vatStatus,
      vatRate: vatStatus === "TAXABLE" ? vatRatePct : 0,
      subtotal,
      vatAmount,
      total,
      shipToCountry: shipTo,
      notes: notesParts.length ? notesParts.join(" · ") : null,
    });
  }

  if (!rows.length) {
    throw new Error("No se encontraron líneas de datos en el informe");
  }

  let taxableBase = 0;
  let taxableVat = 0;
  let exemptBase = 0;
  let marketplaceCollectedBase = 0;
  let refundsBase = 0;

  for (const r of rows) {
    if (r.subtotal < 0) refundsBase = round2(refundsBase + r.subtotal);
    if (r.vatStatus === "TAXABLE") {
      taxableBase = round2(taxableBase + r.subtotal);
      taxableVat = round2(taxableVat + r.vatAmount);
    } else if (r.vatStatus === "EXEMPT") {
      exemptBase = round2(exemptBase + r.subtotal);
    } else {
      marketplaceCollectedBase = round2(
        marketplaceCollectedBase + r.subtotal
      );
    }
  }

  return {
    rows,
    summary: {
      count: rows.length,
      taxableBase,
      taxableVat,
      exemptBase,
      marketplaceCollectedBase,
      marketplaceCollectedVatSkipped,
      refundsBase,
    },
  };
}
