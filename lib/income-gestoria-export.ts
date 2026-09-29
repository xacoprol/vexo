import * as XLSX from "xlsx";

export type IncomeExportMarketplaceRow = {
  issueDate: Date;
  channel: string;
  transactionType: string;
  externalRef: string | null;
  orderId: string | null;
  sku: string | null;
  description: string | null;
  shipToCountry: string | null;
  vatStatus: string;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  invoiceFullNumber: string | null;
  sourceFile: string | null;
};

export type IncomeExportInvoiceRow = {
  fullNumber: string;
  issueDate: Date;
  clientName: string;
  clientNif: string;
  concept: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  irpfAmount: number;
  total: number;
  vatOperationType: string;
  fiscalStatus: string;
  status: string;
  origin: "Vexo" | "Amazon" | "Shopify";
};

function formatDateEs(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function marketplaceSheet(
  title: string,
  rows: IncomeExportMarketplaceRow[]
): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    [title],
    [],
    [
      "Fecha",
      "Tipo",
      "Ref. externa",
      "Pedido",
      "SKU",
      "Descripción",
      "País envío",
      "Estado IVA",
      "%IVA",
      "Base",
      "Cuota",
      "Total",
      "Factura Vexo",
      "Archivo origen",
    ],
  ];

  let sumBase = 0;
  let sumVat = 0;
  let sumTotal = 0;

  for (const r of rows) {
    sumBase = round2(sumBase + r.subtotal);
    sumVat = round2(sumVat + r.vatAmount);
    sumTotal = round2(sumTotal + r.total);
    aoa.push([
      formatDateEs(r.issueDate),
      r.transactionType,
      r.externalRef ?? "",
      r.orderId ?? "",
      r.sku ?? "",
      r.description ?? "",
      r.shipToCountry ?? "",
      r.vatStatus,
      r.vatRate,
      round2(r.subtotal),
      round2(r.vatAmount),
      round2(r.total),
      r.invoiceFullNumber ?? "",
      r.sourceFile ?? "",
    ]);
  }

  aoa.push([]);
  aoa.push(["TOTALES", "", "", "", "", "", "", "", "", sumBase, sumVat, sumTotal, "", ""]);

  return XLSX.utils.aoa_to_sheet(aoa);
}

function invoicesSheet(
  title: string,
  rows: IncomeExportInvoiceRow[]
): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    [title],
    [],
    [
      "Nº factura",
      "Fecha",
      "Cliente",
      "NIF",
      "Concepto",
      "Base",
      "%IVA",
      "Cuota",
      "IRPF",
      "Total",
      "Tipo op. IVA",
      "Estado fiscal",
      "Cobro",
      "Origen",
    ],
  ];

  let sumBase = 0;
  let sumVat = 0;
  let sumIrpf = 0;
  let sumTotal = 0;

  for (const r of rows) {
    sumBase = round2(sumBase + r.subtotal);
    sumVat = round2(sumVat + r.vatAmount);
    sumIrpf = round2(sumIrpf + r.irpfAmount);
    sumTotal = round2(sumTotal + r.total);
    aoa.push([
      r.fullNumber,
      formatDateEs(r.issueDate),
      r.clientName,
      r.clientNif,
      r.concept,
      round2(r.subtotal),
      r.vatRate,
      round2(r.vatAmount),
      round2(r.irpfAmount),
      round2(r.total),
      r.vatOperationType,
      r.fiscalStatus,
      r.status,
      r.origin,
    ]);
  }

  aoa.push([]);
  aoa.push([
    "TOTALES",
    "",
    "",
    "",
    "",
    sumBase,
    "",
    sumVat,
    sumIrpf,
    sumTotal,
    "",
    "",
    "",
    "",
  ]);

  return XLSX.utils.aoa_to_sheet(aoa);
}

function summarySheet(opts: {
  periodLabel: string;
  amazon: IncomeExportMarketplaceRow[];
  shopify: IncomeExportMarketplaceRow[];
  invoices: IncomeExportInvoiceRow[];
}): XLSX.WorkSheet {
  const sumMkt = (rows: IncomeExportMarketplaceRow[]) => ({
    n: rows.length,
    base: round2(rows.reduce((a, r) => a + r.subtotal, 0)),
    vat: round2(rows.reduce((a, r) => a + r.vatAmount, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  });
  const sumInv = (rows: IncomeExportInvoiceRow[]) => ({
    n: rows.length,
    base: round2(rows.reduce((a, r) => a + r.subtotal, 0)),
    vat: round2(rows.reduce((a, r) => a + r.vatAmount, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  });

  const a = sumMkt(opts.amazon);
  const s = sumMkt(opts.shopify);
  const v = sumInv(opts.invoices);
  const converted = [...opts.amazon, ...opts.shopify].filter(
    (r) => r.invoiceFullNumber
  ).length;

  const aoa: (string | number)[][] = [
    [`Informe ingresos gestoría — ${opts.periodLabel}`],
    [],
    ["Bloque", "Líneas", "Base", "Cuota IVA", "Total"],
    ["Amazon", a.n, a.base, a.vat, a.total],
    ["Shopify", s.n, s.base, s.vat, s.total],
    ["Facturas Vexo", v.n, v.base, v.vat, v.total],
    [],
    [
      "Notas",
      "Amazon/Shopify: todos los ingresos marketplace del periodo.",
    ],
    [
      "",
      "Facturas Vexo: facturas emitidas (ISSUED) no anuladas. Origen indica si vinieron de marketplace.",
    ],
    [
      "",
      converted
        ? `Hay ${converted} ingreso(s) marketplace ya convertidos a factura Vexo (columna Factura Vexo). No sumar dos veces esos importes.`
        : "Ningún ingreso marketplace convertido a factura en este periodo.",
    ],
  ];

  return XLSX.utils.aoa_to_sheet(aoa);
}

/**
 * Excel para gestoría: resumen + Amazon + Shopify + Facturas Vexo.
 */
export function buildIncomeGestoriaExcelBuffer(opts: {
  periodLabel: string;
  amazon: IncomeExportMarketplaceRow[];
  shopify: IncomeExportMarketplaceRow[];
  invoices: IncomeExportInvoiceRow[];
}): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    summarySheet(opts),
    "Resumen"
  );
  XLSX.utils.book_append_sheet(
    wb,
    marketplaceSheet(`Amazon — ${opts.periodLabel}`, opts.amazon),
    "Amazon"
  );
  XLSX.utils.book_append_sheet(
    wb,
    marketplaceSheet(`Shopify — ${opts.periodLabel}`, opts.shopify),
    "Shopify"
  );
  XLSX.utils.book_append_sheet(
    wb,
    invoicesSheet(`Facturas Vexo — ${opts.periodLabel}`, opts.invoices),
    "Facturas_Vexo"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
