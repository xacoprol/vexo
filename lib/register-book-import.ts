import * as XLSX from "xlsx";

export type RegisterBookType = "INGRESOS" | "GASTOS" | "BIENES";

export type ParsedRegisterBookLine = {
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

export type ParsedRegisterBook = {
  bookType: RegisterBookType;
  year: number;
  lines: ParsedRegisterBookLine[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function cellStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s || null;
}

function cellNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: unknown, yearHint: number): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0);
    }
  }
  const s = String(v).trim();
  // DD/MM or DD/MM/YY
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = m[3] ? parseInt(m[3], 10) : yearHint;
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d, 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function normHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function detectBookTypeFromName(fileName: string): RegisterBookType | null {
  const n = fileName.toUpperCase();
  if (n.includes("BIENES")) return "BIENES";
  if (n.includes("GASTOS")) return "GASTOS";
  if (n.includes("INGRESOS")) return "INGRESOS";
  return null;
}

function detectYearFromName(fileName: string): number | null {
  const m = /(20\d{2})/.exec(fileName);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Parsea un Excel de libro registro gestoría
 * (NºOrden, N.Referencia, Núm.Fact., Fecha, Concepto, N.I.F., Destinatario/Expedidor, Base, %IVA, Cuota, Retención, Total).
 */
export function parseRegisterBookExcel(
  buffer: Buffer,
  fileName: string,
  overrides?: { bookType?: RegisterBookType; year?: number }
): ParsedRegisterBook {
  const bookType =
    overrides?.bookType ?? detectBookTypeFromName(fileName) ?? "GASTOS";
  const year =
    overrides?.year ?? detectYearFromName(fileName) ?? new Date().getFullYear();

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: null, raw: true }
  ) as unknown[][];

  if (!rows.length) {
    throw new Error("El Excel del libro registro está vacío");
  }

  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = (rows[i] ?? []).map(normHeader).join("|");
    if (joined.includes("fecha") && (joined.includes("base") || joined.includes("concepto"))) {
      headerIdx = i;
      break;
    }
  }

  const headers = (rows[headerIdx] ?? []).map(normHeader);
  const findCol = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = headers.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iRef = findCol("n.referencia", "nreferencia", "referencia");
  const iInv = findCol("num.fact", "núm.fact", "numfact", "factura");
  const iDate = findCol("fecha");
  const iConcept = findCol("concepto");
  const iNif = findCol("n.i.f", "nif");
  const iParty = findCol("destinatario", "expedidor", "proveedor", "cliente");
  const iBase = findCol("baseimponible", "base");
  const iVatRate = findCol("%iva", "iva");
  const iVat = findCol("cuota");
  const iWith = findCol("retencion", "retención");
  const iTotal = findCol("totalfra", "total");

  const lines: ParsedRegisterBookLine[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row.length || row.every((c) => c == null || c === "")) continue;

    const concept = iConcept >= 0 ? cellStr(row[iConcept]) : null;
    const party = iParty >= 0 ? cellStr(row[iParty]) : null;
    const inv = iInv >= 0 ? cellStr(row[iInv]) : null;
    const base = iBase >= 0 ? cellNum(row[iBase]) : 0;
    const total = iTotal >= 0 ? cellNum(row[iTotal]) : 0;
    if (!concept && !party && !inv && base === 0 && total === 0) continue;

    let vatRate = iVatRate >= 0 ? cellNum(row[iVatRate]) : 0;
    if (vatRate > 0 && vatRate < 1) vatRate = round2(vatRate * 100);

    lines.push({
      sortOrder: lines.length + 1,
      reference: iRef >= 0 ? cellStr(row[iRef]) : null,
      invoiceNumber: inv,
      issueDate: iDate >= 0 ? parseDate(row[iDate], year) : null,
      concept,
      nif: iNif >= 0 ? cellStr(row[iNif]) : null,
      counterparty: party,
      base: round2(base),
      vatRate,
      vatAmount: round2(iVat >= 0 ? cellNum(row[iVat]) : 0),
      withholding: round2(iWith >= 0 ? cellNum(row[iWith]) : 0),
      total: round2(total),
    });
  }

  if (!lines.length) {
    throw new Error(`No se encontraron líneas en ${fileName}`);
  }

  return { bookType, year, lines };
}

export function detectRegisterBookMeta(fileName: string): {
  bookType: RegisterBookType | null;
  year: number | null;
} {
  return {
    bookType: detectBookTypeFromName(fileName),
    year: detectYearFromName(fileName),
  };
}
