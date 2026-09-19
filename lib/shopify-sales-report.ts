/** Parser del informe Shopify “Sales by billing country” (export.csv). */

import {
  parseCsv,
  type AmazonTaxReportParseResult,
  type AmazonTaxReportRow,
  type MarketplaceVatStatus,
} from "@/lib/amazon-tax-report";

const REQUIRED_HEADERS = [
  "Billing country",
  "Net sales",
  "Shipping charges",
  "Taxes",
  "Total sales",
] as const;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseNum(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

const COUNTRY_MAP: Record<string, string> = {
  spain: "ES",
  españa: "ES",
  espana: "ES",
  portugal: "PT",
  france: "FR",
  francia: "FR",
  germany: "DE",
  alemania: "DE",
  italy: "IT",
  italia: "IT",
  "united kingdom": "GB",
  "reino unido": "GB",
  ireland: "IE",
  irlanda: "IE",
  netherlands: "NL",
  "países bajos": "NL",
  "paises bajos": "NL",
  belgium: "BE",
  bélgica: "BE",
  belgica: "BE",
};

export function isShopifySalesByCountryReport(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return REQUIRED_HEADERS.every((h) => set.has(h));
}

/** ISO-3166-1 alpha-2 o nombre mapeado; rechaza basura tipo "IVA". */
export function normalizeShipToCountry(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const mapped = COUNTRY_MAP[t.toLowerCase()];
  if (mapped) return mapped;
  return null;
}

function countryCode(raw: string): string | null {
  return normalizeShipToCountry(raw);
}

export function marketplaceRowHasInvalidCountry(
  row: Pick<AmazonTaxReportRow, "shipToCountry" | "importFlags" | "notes"> & {
    shipToCountry?: string | null;
    notes?: string | null;
  }
): boolean {
  if (row.importFlags?.includes("IMPORT_DATA_INVALID")) return true;
  if ((row.notes ?? "").includes("IMPORT_DATA_INVALID")) return true;
  const c = row.shipToCountry?.trim() ?? "";
  if (!c) return false;
  return normalizeShipToCountry(c) == null || c.toUpperCase() === "IVA";
}

function inferVatRate(base: number, vat: number): number {
  if (base <= 0 || vat === 0) return 0;
  const pct = round2((Math.abs(vat) / Math.abs(base)) * 100);
  const candidates = [0, 4, 10, 21, 23];
  let best = pct;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c - pct);
    if (d < bestDiff) {
      bestDiff = d;
      best = c;
    }
  }
  return bestDiff <= 1.5 ? best : pct;
}

function defaultPeriodDate(): string {
  // Último día del mes anterior (informe típico mensuel)
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Último día del mes (month 1–12) → YYYY-MM-DD */
export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ShopifyIvaSummaryDraft = {
  periodYear: number;
  periodMonth: number; // 1–12
  periodLabel?: string | null;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shipping: number;
  taxes: number;
  totalSales: number;
  /** Nº de pedidos si el resumen lo indica */
  orders?: number;
  /** table = Informe IVA clásico; chat = resumen por texto/email */
  reportKind?: "table" | "chat" | string;
  notes?: string | null;
  confidence?: "high" | "medium" | "low";
};

/**
 * Convierte el Informe IVA mensual de Shopify (captura / PDF / resumen chat)
 * en una fila de ingreso marketplace (base = net + envío, o total − IVA).
 */
export function parseShopifyIvaSummaryDraft(
  draft: ShopifyIvaSummaryDraft,
  sourceFile?: string
): AmazonTaxReportParseResult {
  const year = Math.trunc(Number(draft.periodYear));
  const month = Math.trunc(Number(draft.periodMonth));
  if (!year || month < 1 || month > 12) {
    throw new Error("El periodo del Informe IVA no es válido (mes/año)");
  }

  let netSales = round2(Number(draft.netSales) || 0);
  const shipping = round2(Number(draft.shipping) || 0);
  const taxes = round2(Number(draft.taxes) || 0);
  const totalSales = round2(Number(draft.totalSales) || 0);
  const gross = round2(Number(draft.grossSales) || 0);
  const discounts = round2(Number(draft.discounts) || 0);
  const returns = round2(Number(draft.returns) || 0);
  const orders = Math.max(0, Math.trunc(Number(draft.orders) || 0));

  // Resumen tipo chat: solo total + IVA → base = total − IVA
  if (!netSales && !shipping && totalSales && taxes) {
    netSales = round2(totalSales - taxes);
  } else if (!netSales && !shipping && totalSales && !taxes) {
    netSales = totalSales;
  }

  if (
    netSales === 0 &&
    shipping === 0 &&
    taxes === 0 &&
    totalSales === 0
  ) {
    throw new Error("El Informe IVA no tiene importes de ventas");
  }

  const issueDate = lastDayOfMonth(year, month);
  const subtotal = round2(netSales + shipping);
  const vatAmount = taxes;
  const total =
    totalSales !== 0 ? totalSales : round2(subtotal + vatAmount);

  let vatStatus: MarketplaceVatStatus;
  let vatRate = 0;
  if (Math.abs(vatAmount) < 0.005) {
    vatStatus = "EXEMPT";
  } else {
    vatStatus = "TAXABLE";
    vatRate = inferVatRate(subtotal, vatAmount);
  }

  const periodTag = `${year}-${String(month).padStart(2, "0")}`;
  const label =
    draft.periodLabel?.trim() ||
    `Informe IVA ${periodTag}`;

  // Resumen IVA agregado: NO inventar país. "IVA" no es ISO y no implica PT/OSS.
  const shipToCountry: string | null = null;
  const importFlags: NonNullable<AmazonTaxReportRow["importFlags"]> = [
    "IMPORT_DATA_INVALID",
    "NEEDS_REVIEW",
  ];

  const externalKey = shopifyExternalKey({
    country: "SUMMARY",
    issueDate,
    netSales,
    taxes,
    orders,
    sourceFile,
  });

  const row: AmazonTaxReportRow = {
    channel: "SHOPIFY",
    issueDate,
    externalKey,
    externalRef: `Shopify · ${label} · ${issueDate}`,
    orderId: orders
      ? `${orders} pedido${orders === 1 ? "" : "s"}`
      : null,
    sku: null,
    description: `Ventas Shopify · ${label}${
      orders ? ` · ${orders} pedido${orders === 1 ? "" : "s"}` : ""
    }`,
    transactionType: "SUMMARY",
    vatStatus,
    vatRate,
    subtotal,
    vatAmount,
    total,
    shipToCountry,
    importFlags,
    notes: [
      "IMPORT_DATA_INVALID",
      "NEEDS_REVIEW",
      "Resumen IVA mensual sin desglose por país ISO — no liquidar como operación fiscal válida hasta desglose.",
      sourceFile ? `Archivo: ${sourceFile}` : null,
      draft.reportKind === "chat" ? "Resumen IVA chat/email Shopify" : null,
      gross ? `Gross ${gross}` : null,
      discounts ? `Discounts ${discounts}` : null,
      returns ? `Returns ${returns}` : null,
      `Net ${netSales} · Shipping ${shipping}`,
      draft.notes?.trim() || null,
      draft.reportKind === "chat"
        ? "Resumen mensual Shopify (captura texto)"
        : "Informe IVA mensual Shopify (captura)",
    ]
      .filter(Boolean)
      .join(" · "),
  };

  const taxableBase = 0;
  const taxableVat = 0;
  const exemptBase = 0;
  const refundsBase = subtotal < 0 ? subtotal : 0;

  return {
    rows: [row],
    summary: {
      count: 1,
      taxableBase,
      taxableVat,
      exemptBase,
      marketplaceCollectedBase: 0,
      marketplaceCollectedVatSkipped: 0,
      refundsBase,
    },
  };
}

export function shopifyExternalKey(opts: {
  country: string;
  issueDate: string;
  netSales: number;
  taxes: number;
  orders: number;
  sourceFile?: string;
}): string {
  return [
    "by-country",
    opts.country || "UNKNOWN",
    opts.issueDate,
    String(opts.netSales),
    String(opts.taxes),
    String(opts.orders),
    opts.sourceFile || "",
  ].join("|");
}

export function parseShopifySalesByCountryCsv(
  text: string,
  sourceFile?: string,
  periodDate?: string
): AmazonTaxReportParseResult {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length < 2) {
    throw new Error("El CSV de Shopify está vacío o no tiene datos");
  }

  const headers = table[0].map((h) => h.trim().replace(/^"|"$/g, ""));
  if (!isShopifySalesByCountryReport(headers)) {
    throw new Error(
      "No parece el informe Shopify por país de facturación (Billing country / Net sales / Taxes)."
    );
  }

  const issueDate = periodDate || defaultPeriodDate();
  const rows: AmazonTaxReportRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells.length || cells.every((c) => !String(c).trim())) continue;

    const map: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      map[headers[c]] = (cells[c] ?? "").trim();
    }

    const countryRaw = map["Billing country"] ?? "";
    const country = countryCode(countryRaw);
    const netSales = parseNum(map["Net sales"]);
    const shipping = parseNum(map["Shipping charges"]);
    const discounts = parseNum(map["Discounts"]);
    const taxes = parseNum(map["Taxes"]);
    const totalSales = parseNum(map["Total sales"]);
    const orders = parseNum(map["Orders"]);
    const gross = parseNum(map["Gross sales"]);

    // Saltar totales vacíos
    if (
      netSales === 0 &&
      shipping === 0 &&
      taxes === 0 &&
      totalSales === 0 &&
      orders === 0
    ) {
      continue;
    }

    const subtotal = round2(netSales + shipping);
    const vatAmount = round2(taxes);
    const total =
      totalSales !== 0 ? round2(totalSales) : round2(subtotal + vatAmount);

    let vatStatus: MarketplaceVatStatus;
    let vatRate = 0;
    if (Math.abs(vatAmount) < 0.005) {
      vatStatus = "EXEMPT";
    } else {
      vatStatus = "TAXABLE";
      vatRate = inferVatRate(subtotal, vatAmount);
    }

    const countryLabel = countryRaw.trim() || "Sin país";
    const invalidCountry =
      Boolean(countryRaw.trim()) && country == null;
    const importFlags: AmazonTaxReportRow["importFlags"] = invalidCountry
      ? ["IMPORT_DATA_INVALID", "NEEDS_REVIEW"]
      : undefined;

    const externalKey = shopifyExternalKey({
      country: country || (invalidCountry ? "INVALID" : "UNKNOWN"),
      issueDate,
      netSales,
      taxes,
      orders,
      sourceFile,
    });

    rows.push({
      channel: "SHOPIFY",
      issueDate,
      externalKey,
      externalRef: `Shopify · ${countryLabel} · ${issueDate}`,
      orderId: orders
        ? `${orders} pedido${orders === 1 ? "" : "s"}`
        : null,
      sku: null,
      description: `Ventas Shopify · ${countryLabel}${
        orders ? ` · ${orders} pedido${orders === 1 ? "" : "s"}` : ""
      }`,
      transactionType: "SUMMARY",
      vatStatus,
      vatRate,
      subtotal,
      vatAmount,
      total,
      shipToCountry: country,
      importFlags,
      notes: [
        invalidCountry ? "IMPORT_DATA_INVALID" : null,
        invalidCountry ? "NEEDS_REVIEW" : null,
        invalidCountry
          ? `País de facturación no ISO: "${countryRaw.trim()}"`
          : null,
        sourceFile ? `Archivo: ${sourceFile}` : null,
        gross ? `Gross ${gross}` : null,
        discounts ? `Discounts ${discounts}` : null,
        "Resumen por país de facturación (no es factura unitaria)",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (!rows.length) {
    throw new Error("No se encontraron líneas de ventas en el CSV de Shopify");
  }

  let taxableBase = 0;
  let taxableVat = 0;
  let exemptBase = 0;
  let refundsBase = 0;

  for (const r of rows) {
    if (r.subtotal < 0) refundsBase = round2(refundsBase + r.subtotal);
    if (r.vatStatus === "TAXABLE") {
      taxableBase = round2(taxableBase + r.subtotal);
      taxableVat = round2(taxableVat + r.vatAmount);
    } else {
      exemptBase = round2(exemptBase + r.subtotal);
    }
  }

  return {
    rows,
    summary: {
      count: rows.length,
      taxableBase,
      taxableVat,
      exemptBase,
      marketplaceCollectedBase: 0,
      marketplaceCollectedVatSkipped: 0,
      refundsBase,
    },
  };
}
