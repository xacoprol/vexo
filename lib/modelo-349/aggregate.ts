import type { FiscalQuarter } from "@/lib/fiscal";
import { quarterRange } from "@/lib/fiscal";
import {
  resolve349KeyFromPurchase,
  resolve349KeyFromSale,
} from "@/lib/modelo-349/keys";
import { monthsInQuarter } from "@/lib/modelo-349/filing-periods";
import type {
  Model349Operation,
  Model349OperationKey,
  Model349TraceLine,
  Model349Warning,
} from "@/lib/modelo-349/types";
import { resolveEuVatId } from "@/lib/modelo-349/vat-id";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type Model349InvoiceRow = {
  id: string;
  fullNumber: string | null;
  issueDate: Date;
  subtotal: number;
  vatOperationType: string | null;
  invoiceFiscalType?: string | null;
  rectifiesInvoiceId?: string | null;
  rectificationMethod?: string | null;
  substitutionCorrectSubtotal?: number | null;
  client: {
    name: string;
    nif: string;
    countryCode: string | null;
  };
};

export type Model349ExpenseRow = {
  id: string;
  issueDate: Date;
  subtotal: number;
  vatOperationType: string | null;
  supplierName: string | null;
  supplierNif: string | null;
  description?: string | null;
};

export type Model349MarketplaceRow = {
  id: string;
  issueDate: Date;
  subtotal: number;
  vatStatus: string;
  shipToCountry: string | null;
  channel: string;
  orderId: string | null;
  invoiceId: string | null;
};

export type Raw349Line = {
  vatId: string;
  country: string | null;
  operatorName: string;
  key: Model349OperationKey;
  base: number;
  trace: Model349TraceLine;
};

function aggregateKey(vatId: string, key: Model349OperationKey): string {
  return `${key}|${vatId}`;
}

export function group349Operations(lines: Raw349Line[]): Model349Operation[] {
  const map = new Map<string, Model349Operation>();
  for (const line of lines) {
    const k = aggregateKey(line.vatId, line.key);
    const cur = map.get(k);
    if (cur) {
      cur.amount = round2(cur.amount + line.base);
      cur.trace.push(line.trace);
    } else {
      map.set(k, {
        vatId: line.vatId,
        country: line.country,
        operatorName: line.operatorName,
        key: line.key,
        amount: round2(line.base),
        trace: [line.trace],
      });
    }
  }
  return [...map.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function inRange(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function invoiceFiscalBase(inv: Model349InvoiceRow): number {
  if (
    inv.invoiceFiscalType === "RECTIFYING" &&
    inv.rectificationMethod === "SUBSTITUTION" &&
    inv.substitutionCorrectSubtotal != null
  ) {
    return num(inv.substitutionCorrectSubtotal);
  }
  return num(inv.subtotal);
}

export function collect349InvoiceLines(
  invoices: Model349InvoiceRow[],
  from: Date,
  to: Date,
  warnings: Model349Warning[]
): { lines: Raw349Line[]; skippedMissingVatId: number } {
  const lines: Raw349Line[] = [];
  let skippedMissingVatId = 0;

  for (const inv of invoices) {
    if (!inRange(inv.issueDate, from, to)) continue;
    const key = resolve349KeyFromSale(inv.vatOperationType);
    if (!key) continue;

    const vat = resolveEuVatId(inv.client.nif, inv.client.countryCode);
    if (!vat.ok) {
      skippedMissingVatId += 1;
      warnings.push({
        code: vat.code,
        message: `${inv.fullNumber ?? inv.id}: ${vat.code}`,
        sourceId: inv.id,
      });
      continue;
    }

    const base = invoiceFiscalBase(inv);
    lines.push({
      vatId: vat.vatId,
      country: vat.country,
      operatorName: inv.client.name,
      key,
      base,
      trace: {
        sourceType: "invoice",
        sourceId: inv.id,
        label: inv.fullNumber ?? `Factura ${inv.id.slice(0, 8)}`,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        base,
        href: `/invoices/${inv.id}`,
      },
    });
  }

  return { lines, skippedMissingVatId };
}

export function collect349ExpenseLines(
  expenses: Model349ExpenseRow[],
  from: Date,
  to: Date,
  warnings: Model349Warning[]
): { lines: Raw349Line[]; skippedMissingVatId: number } {
  const lines: Raw349Line[] = [];
  let skippedMissingVatId = 0;

  for (const e of expenses) {
    if (!inRange(e.issueDate, from, to)) continue;
    const key = resolve349KeyFromPurchase(e.vatOperationType);
    if (!key) continue;

    const vat = resolveEuVatId(e.supplierNif);
    if (!vat.ok) {
      skippedMissingVatId += 1;
      warnings.push({
        code: vat.code,
        message: `${e.supplierName ?? e.id}: ${vat.code}`,
        sourceId: e.id,
      });
      continue;
    }

    const base = num(e.subtotal);
    lines.push({
      vatId: vat.vatId,
      country: vat.country,
      operatorName: e.supplierName?.trim() || e.description?.trim() || "Proveedor",
      key,
      base,
      trace: {
        sourceType: "expense",
        sourceId: e.id,
        label: e.supplierName?.trim() || e.description?.trim() || `Gasto ${e.id.slice(0, 8)}`,
        issueDate: e.issueDate.toISOString().slice(0, 10),
        base,
        href: `/fiscal/expenses?id=${e.id}`,
      },
    });
  }

  return { lines, skippedMissingVatId };
}

export function collect349MarketplaceLines(
  rows: Model349MarketplaceRow[],
  from: Date,
  to: Date,
  warnings: Model349Warning[]
): Raw349Line[] {
  const lines: Raw349Line[] = [];

  for (const m of rows) {
    if (!inRange(m.issueDate, from, to)) continue;
    if (m.invoiceId) continue;

    const status = (m.vatStatus || "TAXABLE").toUpperCase();
    if (status === "MARKETPLACE_COLLECTED") {
      warnings.push({
        code: "MARKETPLACE_349_REVIEW_REQUIRED",
        message: `Ingreso ${m.channel} OSS/marketplace collected — no entra en 349 B2B.`,
        sourceId: m.id,
      });
      continue;
    }

    const cc = (m.shipToCountry ?? "ES").trim().toUpperCase() || "ES";
    if (cc === "ES") continue;

    // Sin VAT ID de operador B2B → no inventar 349.
    warnings.push({
      code: "MARKETPLACE_349_REVIEW_REQUIRED",
      message: `Ingreso ${m.channel} a ${cc} sin NIF-IVA B2B — revisar antes de 349.`,
      sourceId: m.id,
    });
  }

  return lines;
}

/** Suma bases E+S por trimestre natural (umbral periodicidad — solo operaciones de salida). */
export function sum349OutputQuarterTotal(
  invoices: Model349InvoiceRow[],
  year: number,
  quarter: FiscalQuarter
): number {
  const { from, to } = quarterRange(year, quarter);
  const warnings: Model349Warning[] = [];
  const inv = collect349InvoiceLines(invoices, from, to, warnings);
  return round2(
    inv.lines
      .filter((l) => l.key === "E" || l.key === "S")
      .reduce((s, l) => s + Math.abs(l.base), 0)
  );
}

/** Desglose mensual E+S dentro del trimestre (para trimestre truncado). */
export function buildMonthlyOutputTotalsForQuarter(
  invoices: Model349InvoiceRow[],
  year: number,
  quarter: FiscalQuarter
): number[] {
  const months = monthsInQuarter(quarter);
  const amounts = months.map(() => 0);
  const { from, to } = quarterRange(year, quarter);

  for (const inv of invoices) {
    if (inv.issueDate < from || inv.issueDate > to) continue;
    const key = resolve349KeyFromSale(inv.vatOperationType);
    if (key !== "E" && key !== "S") continue;
    const month = inv.issueDate.getMonth() + 1;
    const idx = months.indexOf(month);
    if (idx >= 0) amounts[idx] = round2(amounts[idx] + invoiceFiscalBase(inv));
  }

  return amounts;
}

/** @deprecated Alias — usar sum349OutputQuarterTotal */
export function sum349QuarterTotals(
  invoices: Model349InvoiceRow[],
  expenses: Model349ExpenseRow[],
  year: number,
  quarter: FiscalQuarter
): number {
  void expenses;
  return sum349OutputQuarterTotal(invoices, year, quarter);
}

export function buildQuarterTotalsMap(
  invoices: Model349InvoiceRow[],
  expenses: Model349ExpenseRow[],
  referenceYear: number,
  referenceQuarter: FiscalQuarter
): Map<string, number> {
  void expenses;
  const map = new Map<string, number>();
  const priors = [
    { year: referenceYear, quarter: referenceQuarter as FiscalQuarter },
    ...Array.from({ length: 4 }, (_, i) => {
      let y = referenceYear;
      let q = (referenceQuarter - 1 - i) as number;
      while (q < 1) {
        q += 4;
        y -= 1;
      }
      return { year: y, quarter: q as FiscalQuarter };
    }),
  ];
  for (const p of priors) {
    const key = `${p.year}:${p.quarter}`;
    map.set(key, sum349OutputQuarterTotal(invoices, p.year, p.quarter));
  }
  return map;
}

export function aggregate349Period(opts: {
  invoices: Model349InvoiceRow[];
  expenses: Model349ExpenseRow[];
  marketplace: Model349MarketplaceRow[];
  year: number;
  quarter: FiscalQuarter;
}): {
  operations: Model349Operation[];
  warnings: Model349Warning[];
  skippedMissingVatId: number;
  skippedMissingVatIdEntregas: number;
  skippedMissingVatIdAdquisiciones: number;
  totalsByKey: Partial<Record<Model349OperationKey, number>>;
} {
  const { from, to } = quarterRange(opts.year, opts.quarter);
  const warnings: Model349Warning[] = [];

  const inv = collect349InvoiceLines(opts.invoices, from, to, warnings);
  const exp = collect349ExpenseLines(opts.expenses, from, to, warnings);
  collect349MarketplaceLines(opts.marketplace, from, to, warnings);

  const operations = group349Operations([...inv.lines, ...exp.lines]);
  const totalsByKey: Partial<Record<Model349OperationKey, number>> = {};
  for (const op of operations) {
    totalsByKey[op.key] = round2((totalsByKey[op.key] ?? 0) + op.amount);
  }

  return {
    operations,
    warnings,
    skippedMissingVatId: inv.skippedMissingVatId + exp.skippedMissingVatId,
    skippedMissingVatIdEntregas: inv.skippedMissingVatId,
    skippedMissingVatIdAdquisiciones: exp.skippedMissingVatId,
    totalsByKey,
  };
}
