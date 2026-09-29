import * as XLSX from "xlsx-js-style";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_VAT_OPERATION_TYPES,
} from "./fiscal";

export type ExpenseExportRow = {
  issueDate: Date;
  supplierName: string;
  supplierNif: string | null;
  invoiceNumber: string | null;
  description: string | null;
  category: string;
  vatOperationType: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  vatDeductiblePct: number;
  irpfDeductiblePct: number;
  isInvestment: boolean;
  hasDocument: boolean;
};

type Cell = string | number | null;

const VEXO = {
  accent: "7B2CFE",
  accentSoft: "EFE8FF",
  ink: "1A1528",
  inkMuted: "6B6578",
  white: "FFFFFF",
  line: "E2DEEA",
  warningSoft: "FFF4E5",
} as const;

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
  alignment: {
    vertical: "center" as const,
    horizontal: "center" as const,
    wrapText: true,
  },
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

type RowStyle =
  | "title"
  | "subtitle"
  | "section"
  | "header"
  | "total"
  | "warn"
  | "body"
  | "note"
  | "none";

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
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function categoryLabel(id: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function opLabel(op: string): string {
  return (
    EXPENSE_VAT_OPERATION_TYPES.find((t) => t.value === op)?.label ?? op
  );
}

function sumRows(rows: ExpenseExportRow[]) {
  return {
    n: rows.length,
    base: round2(rows.reduce((a, r) => a + r.subtotal, 0)),
    vat: round2(rows.reduce((a, r) => a + r.vatAmount, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
  };
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
  }
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const money = new Set(opts.moneyCols ?? []);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  ws["!cols"] = opts.colWidths.map((wch) => ({ wch }));
  ws["!rows"] = [];

  for (let R = range.s.r; R <= range.e.r; R++) {
    const kind = rowKinds[R] ?? "none";
    ws["!rows"]![R] =
      kind === "title"
        ? { hpt: 30 }
        : kind === "header" || kind === "section"
          ? { hpt: 20 }
          : { hpt: 16 };
    const baseStyle = styleFor(kind);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) {
        if (
          kind === "title" ||
          kind === "subtitle" ||
          kind === "section" ||
          kind === "header" ||
          kind === "total"
        ) {
          ws[addr] = { t: "s", v: "" };
        } else continue;
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

function summarySheet(
  periodLabel: string,
  rows: ExpenseExportRow[]
): XLSX.WorkSheet {
  const aoa: Cell[][] = [];
  const kinds: RowStyle[] = [];
  const push = (row: Cell[], kind: RowStyle) => {
    aoa.push(row);
    kinds.push(kind);
  };

  const all = sumRows(rows);
  const missingPdf = rows.filter((r) => !r.hasDocument).length;

  push(["INFORME DE GASTOS · GESTORÍA"], "title");
  push([`Periodo  ${periodLabel}`], "subtitle");
  push([`Generado  ${formatDateLocal(new Date())}`], "subtitle");
  push([], "none");

  push(["PORTADA — TOTALES"], "section");
  push(["Concepto", "Valor"], "header");
  push(["Nº de gastos", all.n], "body");
  push(["Base imponible €", all.base], "total");
  push(["Cuota IVA €", all.vat], "total");
  push(["Total documentos €", all.total], "total");
  push(
    ["Sin PDF adjunto", missingPdf],
    missingPdf > 0 ? "warn" : "body"
  );
  push([], "none");

  push(["POR TIPO DE OPERACIÓN IVA"], "section");
  push(["Tipo", "Líneas", "Base €", "Cuota €", "Total €"], "header");
  const byOp = new Map<string, ExpenseExportRow[]>();
  for (const r of rows) {
    const list = byOp.get(r.vatOperationType) ?? [];
    list.push(r);
    byOp.set(r.vatOperationType, list);
  }
  for (const t of EXPENSE_VAT_OPERATION_TYPES) {
    const list = byOp.get(t.value);
    if (!list?.length) continue;
    const s = sumRows(list);
    push([t.label, s.n, s.base, s.vat, s.total], "body");
  }
  push(["TOTAL", all.n, all.base, all.vat, all.total], "total");
  push([], "none");

  push(["POR CATEGORÍA"], "section");
  push(["Categoría", "Líneas", "Base €", "Cuota €", "Total €"], "header");
  const byCat = new Map<string, ExpenseExportRow[]>();
  for (const r of rows) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }
  for (const c of EXPENSE_CATEGORIES) {
    const list = byCat.get(c.id);
    if (!list?.length) continue;
    const s = sumRows(list);
    push([c.label, s.n, s.base, s.vat, s.total], "body");
  }
  const otherCats = [...byCat.keys()].filter(
    (id) => !EXPENSE_CATEGORIES.some((c) => c.id === id)
  );
  for (const id of otherCats) {
    const s = sumRows(byCat.get(id)!);
    push([categoryLabel(id), s.n, s.base, s.vat, s.total], "body");
  }
  push([], "none");

  push(["NOTAS"], "section");
  push(
    [
      "",
      "Interior: IVA soportado deducible según %. Intracom/servicios UE/extracom: cuota autorrepercutida (no cobrada por el proveedor).",
    ],
    "note"
  );
  push(
    ["", "Total documento = base en reverse charge; base+IVA en compras interiores."],
    "note"
  );
  push(
    ["", "La hoja «Gastos» tiene el detalle filtrable. «Sin_PDF» lista los que faltan adjunto."],
    "note"
  );

  return buildSheet(aoa, kinds, {
    colWidths: [48, 12, 12, 12, 12],
    freezeRows: 6,
    moneyCols: [1, 2, 3, 4],
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    ],
  });
}

function detailSheet(
  periodLabel: string,
  rows: ExpenseExportRow[]
): XLSX.WorkSheet {
  const aoa: Cell[][] = [];
  const kinds: RowStyle[] = [];
  const push = (row: Cell[], kind: RowStyle) => {
    aoa.push(row);
    kinds.push(kind);
  };

  push(["Gastos — detalle"], "title");
  push([`Periodo: ${periodLabel}`], "subtitle");
  push([], "none");

  if (!rows.length) {
    push(["Sin gastos en este periodo."], "warn");
    return buildSheet(aoa, kinds, {
      colWidths: [48],
      merges: [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      ],
    });
  }

  const all = sumRows(rows);
  push(["RESUMEN"], "section");
  push(["Líneas", "Base €", "Cuota €", "Total €"], "header");
  push([all.n, all.base, all.vat, all.total], "total");
  push([], "none");
  push(["DETALLE"], "section");

  const headerRow = aoa.length;
  push(
    [
      "Fecha",
      "Proveedor",
      "NIF",
      "Nº factura",
      "Concepto",
      "Categoría",
      "Tipo IVA",
      "% IVA",
      "Base €",
      "Cuota €",
      "Total €",
      "% ded. IVA",
      "% ded. IRPF",
      "Inversión",
      "PDF",
    ],
    "header"
  );

  for (const r of rows) {
    push(
      [
        formatDateEs(r.issueDate),
        r.supplierName,
        r.supplierNif ?? "",
        r.invoiceNumber ?? "",
        r.description ?? "",
        categoryLabel(r.category),
        opLabel(r.vatOperationType),
        r.vatRate,
        round2(r.subtotal),
        round2(r.vatAmount),
        round2(r.total),
        r.vatDeductiblePct,
        r.irpfDeductiblePct,
        r.isInvestment ? "Sí" : "No",
        r.hasDocument ? "Sí" : "No",
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
      all.base,
      all.vat,
      all.total,
      "",
      "",
      "",
      "",
    ],
    "total"
  );

  return buildSheet(aoa, kinds, {
    colWidths: [11, 26, 14, 14, 28, 14, 28, 8, 11, 11, 11, 10, 10, 10, 8],
    freezeRows: headerRow + 1,
    moneyCols: [8, 9, 10],
    autoFilterRow: headerRow,
    lastDataRow,
    lastCol: 14,
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    ],
  });
}

function missingPdfSheet(
  periodLabel: string,
  rows: ExpenseExportRow[]
): XLSX.WorkSheet {
  const missing = rows.filter((r) => !r.hasDocument);
  const aoa: Cell[][] = [];
  const kinds: RowStyle[] = [];
  const push = (row: Cell[], kind: RowStyle) => {
    aoa.push(row);
    kinds.push(kind);
  };

  push(["Gastos sin PDF"], "title");
  push([`Periodo: ${periodLabel}`], "subtitle");
  push([], "none");

  if (!missing.length) {
    push(["Todos los gastos del periodo tienen documento adjunto."], "section");
    return buildSheet(aoa, kinds, {
      colWidths: [60],
      merges: [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      ],
    });
  }

  push([`${missing.length} gasto(s) sin adjunto`], "warn");
  const headerRow = aoa.length;
  push(
    ["Fecha", "Proveedor", "NIF", "Nº factura", "Base €", "Total €", "Tipo IVA"],
    "header"
  );
  for (const r of missing) {
    push(
      [
        formatDateEs(r.issueDate),
        r.supplierName,
        r.supplierNif ?? "",
        r.invoiceNumber ?? "",
        round2(r.subtotal),
        round2(r.total),
        opLabel(r.vatOperationType),
      ],
      "body"
    );
  }

  return buildSheet(aoa, kinds, {
    colWidths: [11, 28, 14, 16, 11, 11, 32],
    freezeRows: headerRow + 1,
    moneyCols: [4, 5],
    autoFilterRow: headerRow,
    lastDataRow: aoa.length - 1,
    lastCol: 6,
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    ],
  });
}

/** Excel gestoría de gastos: Resumen + detalle + sin PDF. Estilo Vexo. */
export function buildExpenseGestoriaExcelBuffer(opts: {
  periodLabel: string;
  expenses: ExpenseExportRow[];
}): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    summarySheet(opts.periodLabel, opts.expenses),
    "Resumen"
  );
  XLSX.utils.book_append_sheet(
    wb,
    detailSheet(opts.periodLabel, opts.expenses),
    "Gastos"
  );
  XLSX.utils.book_append_sheet(
    wb,
    missingPdfSheet(opts.periodLabel, opts.expenses),
    "Sin_PDF"
  );
  return XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer;
}
