import * as XLSX from "xlsx-js-style";

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
  origin: "Email" | "Amazon" | "Shopify";
};

type Cell = string | number | null;

/** Paleta Vexo (globals.css) */
const VEXO = {
  accent: "7B2CFE",
  accentSoft: "EFE8FF",
  ink: "1A1528",
  inkMuted: "6B6578",
  white: "FFFFFF",
  line: "E2DEEA",
  warningSoft: "FFF4E5",
} as const;

const EMAIL_INVOICES_LABEL = "Facturas venta por email";
const EMAIL_INVOICES_SHEET = "Venta_por_email";

const thinBorder = {
  top: { style: "thin" as const, color: { rgb: VEXO.line } },
  bottom: { style: "thin" as const, color: { rgb: VEXO.line } },
  left: { style: "thin" as const, color: { rgb: VEXO.line } },
  right: { style: "thin" as const, color: { rgb: VEXO.line } },
};

const styleTitle = {
  font: { bold: true, sz: 16, color: { rgb: VEXO.white }, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: VEXO.accent } },
  alignment: { vertical: "center" as const, horizontal: "left" as const },
};

const styleSubtitle = {
  font: { sz: 11, color: { rgb: VEXO.inkMuted }, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: VEXO.accentSoft } },
  alignment: { vertical: "center" as const },
};

const styleSection = {
  font: { bold: true, sz: 11, color: { rgb: VEXO.accent }, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: VEXO.accentSoft } },
  alignment: { vertical: "center" as const },
};

const styleHeader = {
  font: { bold: true, sz: 10, color: { rgb: VEXO.white }, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: VEXO.accent } },
  alignment: { vertical: "center" as const, horizontal: "center" as const, wrapText: true },
  border: thinBorder,
};

const styleTotal = {
  font: { bold: true, sz: 10, color: { rgb: VEXO.ink }, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: VEXO.accentSoft } },
  border: thinBorder,
};

const styleWarn = {
  font: { sz: 10, color: { rgb: VEXO.ink }, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: VEXO.warningSoft } },
};

const styleBody = {
  font: { sz: 10, color: { rgb: VEXO.ink }, name: "Calibri" },
  border: thinBorder,
  alignment: { vertical: "center" as const },
};

const styleNote = {
  font: { sz: 10, color: { rgb: VEXO.inkMuted }, name: "Calibri" },
};

function formatDateEs(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateLocal(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
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
      return "Con IVA";
    case "EXEMPT":
      return "Exento / sin IVA";
    case "MARKETPLACE_COLLECTED":
      return "OSS marketplace";
    default:
      return status;
  }
}

type RowStyle = "title" | "subtitle" | "section" | "header" | "total" | "warn" | "body" | "note" | "none";

function styleFor(kind: RowStyle) {
  switch (kind) {
    case "title":
      return styleTitle;
    case "subtitle":
      return styleSubtitle;
    case "section":
      return styleSection;
    case "header":
      return styleHeader;
    case "total":
      return styleTotal;
    case "warn":
      return styleWarn;
    case "body":
      return styleBody;
    case "note":
      return styleNote;
    default:
      return undefined;
  }
}

function buildSheet(
  aoa: Cell[][],
  rowKinds: RowStyle[],
  opts: {
    colWidths: number[];
    freezeRows?: number;
    moneyCols?: number[];
    autoFilterRow?: number;
    lastDataRow?: number;
    lastCol?: number;
    merges?: XLSX.Range[];
    titleRowHeight?: number;
  }
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const money = new Set(opts.moneyCols ?? []);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");

  ws["!cols"] = opts.colWidths.map((wch) => ({ wch }));
  ws["!rows"] = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const kind = rowKinds[R] ?? "none";
    if (kind === "title") ws["!rows"]![R] = { hpt: opts.titleRowHeight ?? 28 };
    else if (kind === "header" || kind === "section") ws["!rows"]![R] = { hpt: 20 };
    else ws["!rows"]![R] = { hpt: 16 };

    const baseStyle = styleFor(kind);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) {
        if (kind === "title" || kind === "subtitle" || kind === "section" || kind === "header" || kind === "total") {
          ws[addr] = { t: "s", v: "" };
        } else {
          continue;
        }
      }
      const cell = ws[addr];
      if (typeof cell.v === "number") {
        cell.t = "n";
        if (money.has(C)) cell.z = "#,##0.00";
      }
      if (baseStyle) {
        const align =
          "alignment" in baseStyle && baseStyle.alignment
            ? baseStyle.alignment
            : {};
        cell.s = {
          ...baseStyle,
          ...(money.has(C) && typeof cell.v === "number"
            ? {
                alignment: {
                  ...align,
                  horizontal: "right" as const,
                },
              }
            : {}),
        };
      }
    }
  }

  if (opts.freezeRows && opts.freezeRows > 0) {
    ws["!freeze"] = {
      xSplit: 0,
      ySplit: opts.freezeRows,
      topLeftCell: `A${opts.freezeRows + 1}`,
      activePane: "bottomLeft",
      state: "frozen",
    };
  }

  if (
    opts.autoFilterRow != null &&
    opts.lastDataRow != null &&
    opts.lastCol != null &&
    opts.lastDataRow >= opts.autoFilterRow
  ) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: opts.autoFilterRow, c: 0 },
        e: { r: opts.lastDataRow, c: opts.lastCol },
      }),
    };
  }

  if (opts.merges?.length) ws["!merges"] = opts.merges;
  return ws;
}

function marketplaceSheet(
  title: string,
  subtitle: string,
  rows: IncomeExportMarketplaceRow[],
  emptyHint: string
): XLSX.WorkSheet {
  const aoa: Cell[][] = [];
  const kinds: RowStyle[] = [];

  const push = (row: Cell[], kind: RowStyle) => {
    aoa.push(row);
    kinds.push(kind);
  };

  push([title], "title");
  push([subtitle], "subtitle");
  push([], "none");

  if (!rows.length) {
    push(["Sin movimientos en este periodo."], "warn");
    push([emptyHint], "note");
    return buildSheet(aoa, kinds, {
      colWidths: [80],
      merges: [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      ],
    });
  }

  const byStatus = new Map<string, IncomeExportMarketplaceRow[]>();
  for (const r of rows) {
    const list = byStatus.get(r.vatStatus) ?? [];
    list.push(r);
    byStatus.set(r.vatStatus, list);
  }

  push(["RESUMEN RÁPIDO"], "section");
  push(["Estado IVA", "Líneas", "Base €", "Cuota €", "Total €"], "header");
  for (const status of ["TAXABLE", "EXEMPT", "MARKETPLACE_COLLECTED"]) {
    const list = byStatus.get(status) ?? [];
    if (!list.length) continue;
    const s = sumMkt(list);
    push([vatStatusLabel(status), s.n, s.base, s.vat, s.total], "body");
  }
  const all = sumMkt(rows);
  push(["TOTAL PERIODO", all.n, all.base, all.vat, all.total], "total");
  push([], "none");
  push(["DETALLE"], "section");

  const headerRowIndex = aoa.length;
  push(
    [
      "Fecha",
      "Tipo",
      "Ref. externa",
      "Pedido",
      "SKU",
      "Descripción",
      "País",
      "Estado IVA",
      "% IVA",
      "Base €",
      "Cuota €",
      "Total €",
      "Factura email",
      "Archivo",
    ],
    "header"
  );

  for (const r of rows) {
    push(
      [
        formatDateEs(r.issueDate),
        r.transactionType,
        r.externalRef ?? "",
        r.orderId ?? "",
        r.sku ?? "",
        r.description ?? "",
        r.shipToCountry ?? "",
        vatStatusLabel(r.vatStatus),
        r.vatRate,
        round2(r.subtotal),
        round2(r.vatAmount),
        round2(r.total),
        r.invoiceFullNumber ?? "",
        r.sourceFile ?? "",
      ],
      "body"
    );
  }

  const lastDataRow = aoa.length - 1;
  push([], "none");
  push(
    [
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
    ],
    "total"
  );

  return buildSheet(aoa, kinds, {
    colWidths: [11, 11, 16, 14, 12, 34, 8, 16, 8, 11, 11, 11, 14, 20],
    freezeRows: headerRowIndex + 1,
    moneyCols: [2, 3, 4, 9, 10, 11],
    autoFilterRow: headerRowIndex,
    lastDataRow,
    lastCol: 13,
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    ],
  });
}

function invoicesSheet(
  title: string,
  subtitle: string,
  rows: IncomeExportInvoiceRow[]
): XLSX.WorkSheet {
  const aoa: Cell[][] = [];
  const kinds: RowStyle[] = [];
  const push = (row: Cell[], kind: RowStyle) => {
    aoa.push(row);
    kinds.push(kind);
  };

  push([title], "title");
  push([subtitle], "subtitle");
  push([], "none");

  if (!rows.length) {
    push(["Sin facturas de venta por email en este periodo."], "warn");
    return buildSheet(aoa, kinds, {
      colWidths: [56],
      merges: [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      ],
    });
  }

  const totals = sumInv(rows);
  push(["RESUMEN RÁPIDO"], "section");
  push(["Facturas", "Base €", "Cuota IVA €", "IRPF €", "Total €"], "header");
  push([totals.n, totals.base, totals.vat, totals.irpf, totals.total], "total");
  push([], "none");
  push(["DETALLE"], "section");

  const headerRowIndex = aoa.length;
  push(
    [
      "Nº factura",
      "Fecha",
      "Cliente",
      "NIF",
      "Concepto",
      "Base €",
      "% IVA",
      "Cuota €",
      "IRPF €",
      "Total €",
      "Tipo op. IVA",
      "Estado fiscal",
      "Cobro",
      "Origen",
    ],
    "header"
  );

  for (const r of rows) {
    push(
      [
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
      ],
      "body"
    );
  }

  const lastDataRow = aoa.length - 1;
  push([], "none");
  push(
    [
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
    ],
    "total"
  );

  return buildSheet(aoa, kinds, {
    colWidths: [13, 11, 26, 13, 30, 11, 8, 11, 10, 11, 16, 12, 10, 10],
    freezeRows: headerRowIndex + 1,
    moneyCols: [1, 2, 3, 4, 5, 7, 8, 9],
    autoFilterRow: headerRowIndex,
    lastDataRow,
    lastCol: 13,
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    ],
  });
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

  const aoa: Cell[][] = [];
  const kinds: RowStyle[] = [];
  const push = (row: Cell[], kind: RowStyle) => {
    aoa.push(row);
    kinds.push(kind);
  };

  push(["INFORME DE INGRESOS · GESTORÍA"], "title");
  push([`Periodo  ${opts.periodLabel}`], "subtitle");
  push([`Generado  ${formatDateLocal(new Date())}`], "subtitle");
  push([], "none");
  push(["PORTADA — TOTALES"], "section");
  push(["Canal / bloque", "Líneas", "Base €", "Cuota IVA €", "Total €"], "header");
  push(["Amazon", a.n, a.base, a.vat, a.total], "body");
  push(["Shopify", s.n, s.base, s.vat, s.total], "body");
  push([EMAIL_INVOICES_LABEL, v.n, v.base, v.vat, v.total], "body");
  push(
    [
      "Suma (orientativa)",
      a.n + s.n + v.n,
      round2(a.base + s.base + v.base),
      round2(a.vat + s.vat + v.vat),
      round2(a.total + s.total + v.total),
    ],
    "total"
  );
  push([], "none");

  if (!opts.amazon.length) {
    push(
      [
        "Amazon vacío",
        opts.amazonLastMonthWithData
          ? `No hay líneas en este periodo. Último mes con datos: ${opts.amazonLastMonthWithData}. Cambia el mes o importa el CSV VAT.`
          : "No hay líneas Amazon. Importa el CSV VAT en Ingresos marketplace.",
      ],
      "warn"
    );
    push([], "none");
  } else {
    push(["AMAZON — POR ESTADO IVA"], "section");
    push(["Estado", "Líneas", "Base €", "Cuota €", "Total €"], "header");
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
      push([vatStatusLabel(status), sum.n, sum.base, sum.vat, sum.total], "body");
    }
    push([], "none");
  }

  if (!opts.shopify.length) {
    push(["Shopify", "Sin líneas en este periodo."], "note");
    push([], "none");
  }

  push(["CÓMO LEER ESTE EXCEL"], "section");
  push(
    ["1", "Hojas Amazon y Shopify = ventas marketplace del periodo elegido."],
    "note"
  );
  push(
    [
      "2",
      `Hoja «${EMAIL_INVOICES_SHEET}» = ${EMAIL_INVOICES_LABEL.toLowerCase()} emitidas (no anuladas).`,
    ],
    "note"
  );
  push(
    [
      "3",
      converted
        ? `${converted} ingreso(s) marketplace ya tienen factura email (columna «Factura email»). No sumar dos veces.`
        : "Ningún ingreso marketplace convertido a factura email en este periodo.",
    ],
    "note"
  );
  push(
    [
      "4",
      "La suma orientativa puede solaparse si hay conversiones marketplace → factura email.",
    ],
    "note"
  );
  push(
    ["5", "En las hojas de detalle puedes filtrar por columnas (autofilter)."],
    "note"
  );

  return buildSheet(aoa, kinds, {
    colWidths: [34, 14, 14, 14, 14],
    freezeRows: 6,
    moneyCols: [2, 3, 4],
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    ],
    titleRowHeight: 32,
  });
}

/**
 * Excel gestoría: Resumen + Amazon + Shopify + facturas venta por email.
 * Destacados con color de marca Vexo (#7B2CFE).
 */
export function buildIncomeGestoriaExcelBuffer(opts: {
  periodLabel: string;
  amazon: IncomeExportMarketplaceRow[];
  shopify: IncomeExportMarketplaceRow[];
  invoices: IncomeExportInvoiceRow[];
  amazonLastMonthWithData?: string | null;
}): Buffer {
  const sub = `Periodo: ${opts.periodLabel}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet(opts), "Resumen");
  XLSX.utils.book_append_sheet(
    wb,
    marketplaceSheet(
      "Amazon",
      sub,
      opts.amazon,
      opts.amazonLastMonthWithData
        ? `Último mes con datos: ${opts.amazonLastMonthWithData}. Cambia el mes del informe o importa el CSV VAT.`
        : "Importa el CSV VAT de Amazon en Ingresos marketplace."
    ),
    "Amazon"
  );
  XLSX.utils.book_append_sheet(
    wb,
    marketplaceSheet(
      "Shopify",
      sub,
      opts.shopify,
      "Sincroniza Shopify o importa el Informe IVA."
    ),
    "Shopify"
  );
  XLSX.utils.book_append_sheet(
    wb,
    invoicesSheet(EMAIL_INVOICES_LABEL, sub, opts.invoices),
    EMAIL_INVOICES_SHEET
  );
  return XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer;
}
