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

type Cell = string | number | null;

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

function sumMkt(rows: IncomeExportMarketplaceRow[]) {
  return {
    n: rows.length,
    base: round2(rows.reduce((a, r) => a + r.subtotal, 0)),
    vat: round2(rows.reduce((a, r) => a + r.vatAmount, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  };
}

function sumInv(rows: IncomeExportInvoiceRow[]) {
  return {
    n: rows.length,
    base: round2(rows.reduce((a, r) => a + r.subtotal, 0)),
    vat: round2(rows.reduce((a, r) => a + r.vatAmount, 0)),
    irpf: round2(rows.reduce((a, r) => a + r.irpfAmount, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  };
}

function vatStatusLabel(status: string): string {
  switch (status) {
    case "TAXABLE":
      return "Con IVA (TAXABLE)";
    case "EXEMPT":
      return "Exento / sin IVA";
    case "MARKETPLACE_COLLECTED":
      return "OSS marketplace (IVA recaudado por canal)";
    default:
      return status;
  }
}

/** Aplica anchos, freeze y formato numérico a columnas de importes. */
function polishSheet(
  ws: XLSX.WorkSheet,
  opts: {
    colWidths: number[];
    freezeRows?: number;
    moneyCols?: number[];
    headerRow?: number;
  }
) {
  ws["!cols"] = opts.colWidths.map((wch) => ({ wch }));
  if (opts.freezeRows && opts.freezeRows > 0) {
    ws["!freeze"] = { xSplit: 0, ySplit: opts.freezeRows, topLeftCell: `A${opts.freezeRows + 1}`, activePane: "bottomLeft", state: "frozen" };
  }
  const money = new Set(opts.moneyCols ?? []);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (const C of money) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = "#,##0.00";
      }
    }
  }
  if (opts.headerRow != null) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: opts.headerRow, c: C });
      const cell = ws[addr];
      if (cell && cell.t === "s") {
        cell.v = String(cell.v);
      }
    }
  }
}

function marketplaceSheet(
  title: string,
  rows: IncomeExportMarketplaceRow[],
  emptyHint: string
): XLSX.WorkSheet {
  const aoa: Cell[][] = [[title], []];

  if (!rows.length) {
    aoa.push(["Sin líneas en este periodo."]);
    aoa.push([emptyHint]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    polishSheet(ws, { colWidths: [72], freezeRows: 0 });
    return ws;
  }

  // Mini-resumen por estado IVA (útil sobre todo en Amazon)
  const byStatus = new Map<string, IncomeExportMarketplaceRow[]>();
  for (const r of rows) {
    const list = byStatus.get(r.vatStatus) ?? [];
    list.push(r);
    byStatus.set(r.vatStatus, list);
  }

  aoa.push(["Desglose por estado IVA"]);
  aoa.push(["Estado", "Líneas", "Base", "Cuota", "Total"]);
  for (const status of ["TAXABLE", "EXEMPT", "MARKETPLACE_COLLECTED"]) {
    const list = byStatus.get(status) ?? [];
    if (!list.length) continue;
    const s = sumMkt(list);
    aoa.push([vatStatusLabel(status), s.n, s.base, s.vat, s.total]);
  }
  const otherStatuses = [...byStatus.keys()].filter(
    (s) => !["TAXABLE", "EXEMPT", "MARKETPLACE_COLLECTED"].includes(s)
  );
  for (const status of otherStatuses) {
    const s = sumMkt(byStatus.get(status)!);
    aoa.push([vatStatusLabel(status), s.n, s.base, s.vat, s.total]);
  }
  const all = sumMkt(rows);
  aoa.push(["TOTAL", all.n, all.base, all.vat, all.total]);
  aoa.push([]);

  const headerRowIndex = aoa.length;
  aoa.push([
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
  ]);

  for (const r of rows) {
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
  aoa.push([
    "TOTALES",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    all.base,
    all.vat,
    all.total,
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  polishSheet(ws, {
    colWidths: [12, 12, 18, 16, 14, 36, 10, 22, 8, 12, 12, 12, 14, 22],
    freezeRows: headerRowIndex + 1,
    moneyCols: [9, 10, 11],
    headerRow: headerRowIndex,
  });
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  return ws;
}

function invoicesSheet(
  title: string,
  rows: IncomeExportInvoiceRow[]
): XLSX.WorkSheet {
  const aoa: Cell[][] = [[title], []];

  if (!rows.length) {
    aoa.push(["Sin facturas emitidas en este periodo."]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    polishSheet(ws, { colWidths: [48] });
    return ws;
  }

  const totals = sumInv(rows);
  aoa.push(["Resumen facturas"]);
  aoa.push(["Líneas", "Base", "Cuota IVA", "IRPF", "Total"]);
  aoa.push([totals.n, totals.base, totals.vat, totals.irpf, totals.total]);
  aoa.push([]);

  const headerRowIndex = aoa.length;
  aoa.push([
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
  ]);

  for (const r of rows) {
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
    totals.base,
    "",
    totals.vat,
    totals.irpf,
    totals.total,
    "",
    "",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  polishSheet(ws, {
    colWidths: [14, 12, 28, 14, 32, 12, 8, 12, 10, 12, 18, 14, 12, 10],
    freezeRows: headerRowIndex + 1,
    moneyCols: [5, 7, 8, 9],
    headerRow: headerRowIndex,
  });
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  return ws;
}

function summarySheet(opts: {
  periodLabel: string;
  amazon: IncomeExportMarketplaceRow[];
  shopify: IncomeExportMarketplaceRow[];
  invoices: IncomeExportInvoiceRow[];
  amazonLastMonthWithData?: string | null;
}): XLSX.WorkSheet {
  const a = sumMkt(opts.amazon);
  const s = sumMkt(opts.shopify);
  const v = sumInv(opts.invoices);
  const converted = [...opts.amazon, ...opts.shopify].filter(
    (r) => r.invoiceFullNumber
  ).length;

  const aoa: Cell[][] = [
    [`Informe de ingresos para gestoría`],
    [`Periodo: ${opts.periodLabel}`],
    [`Generado: ${formatDateEs(new Date())}`],
    [],
    ["1. Totales por bloque"],
    ["Bloque", "Líneas", "Base imponible", "Cuota IVA", "Total"],
    ["Amazon (marketplace)", a.n, a.base, a.vat, a.total],
    ["Shopify (marketplace)", s.n, s.base, s.vat, s.total],
    ["Facturas Vexo (emitidas)", v.n, v.base, v.vat, v.total],
    [
      "Suma bloques (orientativa)",
      a.n + s.n + v.n,
      round2(a.base + s.base + v.base),
      round2(a.vat + s.vat + v.vat),
      round2(a.total + s.total + v.total),
    ],
    [],
  ];

  if (!opts.amazon.length) {
    aoa.push([
      "Amazon",
      opts.amazonLastMonthWithData
        ? `Sin líneas en este periodo. Último mes con datos Amazon: ${opts.amazonLastMonthWithData}. Revisa el filtro de fechas o importa el CSV VAT de Amazon.`
        : "Sin líneas Amazon en este periodo. Importa el CSV VAT de Amazon en Ingresos marketplace.",
    ]);
    aoa.push([]);
  } else {
    aoa.push(["2. Desglose Amazon por estado IVA"]);
    aoa.push(["Estado", "Líneas", "Base", "Cuota", "Total"]);
    const byStatus = new Map<string, IncomeExportMarketplaceRow[]>();
    for (const r of opts.amazon) {
      const list = byStatus.get(r.vatStatus) ?? [];
      list.push(r);
      byStatus.set(r.vatStatus, list);
    }
    for (const status of ["TAXABLE", "EXEMPT", "MARKETPLACE_COLLECTED"]) {
      const list = byStatus.get(status);
      if (!list?.length) continue;
      const sum = sumMkt(list);
      aoa.push([vatStatusLabel(status), sum.n, sum.base, sum.vat, sum.total]);
    }
    aoa.push([]);
  }

  if (!opts.shopify.length) {
    aoa.push(["Shopify", "Sin líneas en este periodo."]);
    aoa.push([]);
  }

  aoa.push(["3. Notas para gestoría"]);
  aoa.push([
    "",
    "Amazon y Shopify: ingresos marketplace del periodo (hojas Amazon / Shopify).",
  ]);
  aoa.push([
    "",
    "Facturas Vexo: solo emitidas (ISSUED) no anuladas. La columna Origen indica si vinieron de marketplace.",
  ]);
  aoa.push([
    "",
    converted
      ? `Hay ${converted} ingreso(s) marketplace ya convertidos a factura Vexo (columna «Factura Vexo»). No sumar dos veces esos importes.`
      : "Ningún ingreso marketplace convertido a factura Vexo en este periodo.",
  ]);
  aoa.push([
    "",
    "La «Suma bloques» es orientativa: si hay conversiones a factura, puede haber solape entre marketplace y Facturas Vexo.",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  polishSheet(ws, {
    colWidths: [28, 18, 16, 14, 14],
    freezeRows: 6,
    moneyCols: [2, 3, 4],
  });
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  return ws;
}

/**
 * Excel para gestoría: resumen + Amazon + Shopify + Facturas Vexo.
 */
export function buildIncomeGestoriaExcelBuffer(opts: {
  periodLabel: string;
  amazon: IncomeExportMarketplaceRow[];
  shopify: IncomeExportMarketplaceRow[];
  invoices: IncomeExportInvoiceRow[];
  amazonLastMonthWithData?: string | null;
}): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet(opts), "Resumen");
  XLSX.utils.book_append_sheet(
    wb,
    marketplaceSheet(
      `Amazon — ${opts.periodLabel}`,
      opts.amazon,
      opts.amazonLastMonthWithData
        ? `Último mes con datos: ${opts.amazonLastMonthWithData}. Cambia el periodo del informe o importa el CSV VAT.`
        : "Importa el CSV VAT de Amazon en Ingresos marketplace."
    ),
    "Amazon"
  );
  XLSX.utils.book_append_sheet(
    wb,
    marketplaceSheet(
      `Shopify — ${opts.periodLabel}`,
      opts.shopify,
      "Sincroniza Shopify o importa el Informe IVA."
    ),
    "Shopify"
  );
  XLSX.utils.book_append_sheet(
    wb,
    invoicesSheet(`Facturas Vexo — ${opts.periodLabel}`, opts.invoices),
    "Facturas_Vexo"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
