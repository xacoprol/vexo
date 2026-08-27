import * as XLSX from "xlsx";
import type { RegisterBookType } from "@/lib/register-book-import";

export type ExportBookLine = {
  sortOrder: number;
  reference: string | null;
  invoiceNumber: string | null;
  issueDate: Date | null;
  concept: string | null;
  nif: string | null;
  counterparty: string | null;
  base: number;
  vatRate: number;
  vatAmount: number;
  withholding: number;
  total: number;
};

function formatDateEs(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const HEADERS_BASE = [
  "NºOrden",
  "N.Referencia",
  "Núm.Fact.",
  "Fecha",
  "Concepto",
  "N.I.F.",
  "Destinatario/Expedidor",
  "Base imponible",
  "%IVA",
  "Cuota",
] as const;

function withholdingHeader(bookType: RegisterBookType): string {
  // Misma columna física; semántica distinta por libro:
  // INGRESOS = retención SOPORTADA (cliente me retiene)
  // GASTOS = retención PRACTICADA (yo retengo al proveedor)
  if (bookType === "INGRESOS") return "Retención soportada";
  if (bookType === "GASTOS") return "Retención practicada";
  return "Retención";
}

function totalHeader(bookType: RegisterBookType): string {
  if (bookType === "GASTOS") return "Total / a pagar";
  return "Total Fra.";
}

/**
 * Excel compatible con el formato de libros registro de gestoría.
 */
export function buildRegisterBookExcelBuffer(opts: {
  bookType: RegisterBookType;
  year: number;
  lines: ExportBookLine[];
}): Buffer {
  const title =
    opts.bookType === "INGRESOS"
      ? `LIBRO REGISTRO INGRESOS ${opts.year}`
      : opts.bookType === "GASTOS"
        ? `LIBRO REGISTRO GASTOS ${opts.year}`
        : `LIBRO REGISTRO BIENES INVERSION ${opts.year}`;

  const aoa: (string | number)[][] = [
    [title],
    [],
    [
      ...HEADERS_BASE,
      withholdingHeader(opts.bookType),
      totalHeader(opts.bookType),
    ],
  ];

  for (const l of opts.lines) {
    aoa.push([
      l.sortOrder,
      l.reference ?? "",
      l.invoiceNumber ?? "",
      formatDateEs(l.issueDate),
      l.concept ?? "",
      l.nif ?? "",
      l.counterparty ?? "",
      l.base,
      l.vatRate,
      l.vatAmount,
      l.withholding,
      l.total,
    ]);
  }

  const totals = opts.lines.reduce(
    (acc, l) => ({
      base: acc.base + l.base,
      vat: acc.vat + l.vatAmount,
      withh: acc.withh + l.withholding,
      total: acc.total + l.total,
    }),
    { base: 0, vat: 0, withh: 0, total: 0 }
  );

  aoa.push([]);
  aoa.push([
    "",
    "",
    "",
    "",
    "TOTALES",
    "",
    "",
    Math.round(totals.base * 100) / 100,
    "",
    Math.round(totals.vat * 100) / 100,
    Math.round(totals.withh * 100) / 100,
    Math.round(totals.total * 100) / 100,
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 36 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, opts.bookType.slice(0, 31));
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(out);
}

export function registerBookExportFileName(
  bookType: RegisterBookType,
  year: number
): string {
  return `LIBRO_REGISTRO_${bookType}_${year}.xlsx`;
}
