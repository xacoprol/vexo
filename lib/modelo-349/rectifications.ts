import type { FiscalQuarter } from "@/lib/fiscal";
import { quarterRange } from "@/lib/fiscal";
import {
  collect349ExpenseLines,
  collect349InvoiceLines,
  group349Operations,
  invoiceFiscalBase,
  num,
  round2,
  type Model349ExpenseRow,
  type Model349InvoiceRow,
} from "@/lib/modelo-349/aggregate";
import { resolve349KeyFromSale } from "@/lib/modelo-349/keys";
import { quarterPeriodLabel } from "@/lib/modelo-349/periodicity";
import type {
  Model349PresentedSnapshot,
  Model349Rectification,
  Model349Warning,
} from "@/lib/modelo-349/types";
import { resolveEuVatId } from "@/lib/modelo-349/vat-id";

export type Presented349Filing = {
  year: number;
  quarter: number | null;
  boxes: { code: string; value: number }[];
  rawExtract: unknown;
};

function filingQuarterKey(year: number, quarter: FiscalQuarter): string {
  return `${year}:${quarter}`;
}

export function parse349PresentedSnapshot(
  raw: unknown
): Model349PresentedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const snap = o.model349Snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Model349PresentedSnapshot;
  if (s.version !== 1 || !Array.isArray(s.operations)) return null;
  return s;
}

function amountFromPresentedSnapshot(
  snapshot: Model349PresentedSnapshot | null,
  vatId: string,
  key: string
): number | null {
  if (!snapshot) return null;
  const row = snapshot.operations.find((o) => o.vatId === vatId && o.key === key);
  return row ? num(row.amount) : null;
}

function amountFromLegacyBoxes(
  filing: Presented349Filing,
  key: string
): number | null {
  const box = filing.boxes.find((b) => b.code === key);
  return box ? num(box.value) : null;
}

function fiscalQuarterFromDate(d: Date): { year: number; quarter: FiscalQuarter } {
  const month = d.getMonth() + 1;
  const quarter = (Math.ceil(month / 3) as 1 | 2 | 3 | 4);
  return { year: d.getFullYear(), quarter };
}

function correctedBaseAfterRectification(
  original: Model349InvoiceRow,
  rectifier: Model349InvoiceRow
): number {
  if (
    rectifier.rectificationMethod === "SUBSTITUTION" &&
    rectifier.substitutionCorrectSubtotal != null
  ) {
    return round2(num(rectifier.substitutionCorrectSubtotal));
  }
  return round2(num(original.subtotal) + num(rectifier.subtotal));
}

export function build349Rectifications(opts: {
  rectifyingInvoices: Model349InvoiceRow[];
  originalsById: Map<string, Model349InvoiceRow>;
  presentedFilings: Presented349Filing[];
  filingPeriodYear: number;
  filingPeriodQuarter: FiscalQuarter;
  warnings: Model349Warning[];
}): Model349Rectification[] {
  const rectifications: Model349Rectification[] = [];
  const { from, to } = quarterRange(
    opts.filingPeriodYear,
    opts.filingPeriodQuarter
  );

  for (const rect of opts.rectifyingInvoices) {
    if (rect.invoiceFiscalType !== "RECTIFYING") continue;
    if (rect.issueDate < from || rect.issueDate > to) continue;

    const key = resolve349KeyFromSale(rect.vatOperationType);
    if (!key) continue;

    const originalId = rect.rectifiesInvoiceId;
    if (!originalId) continue;
    const original = opts.originalsById.get(originalId);
    if (!original) continue;

    const vat = resolveEuVatId(rect.client.nif, rect.client.countryCode);
    if (!vat.ok) {
      opts.warnings.push({
        code: vat.code,
        message: `Rectificativa ${rect.fullNumber ?? rect.id}: ${vat.code}`,
        sourceId: rect.id,
      });
      continue;
    }

    const origPeriod = fiscalQuarterFromDate(original.issueDate);
    const originalPeriod = quarterPeriodLabel(origPeriod.year, origPeriod.quarter);
    const filingPeriod = quarterPeriodLabel(
      opts.filingPeriodYear,
      opts.filingPeriodQuarter
    );

    const filing = opts.presentedFilings.find(
      (f) =>
        f.year === origPeriod.year &&
        f.quarter === origPeriod.quarter &&
        f.quarter != null
    );

    const snapshot = filing ? parse349PresentedSnapshot(filing.rawExtract) : null;
    let previousAmount = amountFromPresentedSnapshot(snapshot, vat.vatId, key);

    if (previousAmount == null && filing) {
      previousAmount = amountFromLegacyBoxes(filing, key);
      if (previousAmount != null && !snapshot) {
        opts.warnings.push({
          code: "LEGACY_349_FILING_DETAIL",
          message: `349 presentado ${originalPeriod} sin detalle por operador — importe anterior aproximado por clave ${key}.`,
        });
      }
    }

    const originalDeclaredBase = invoiceFiscalBase(original);
    const correctedAmount = correctedBaseAfterRectification(original, rect);

    let needsReview = false;
    let reviewCode: Model349Rectification["reviewCode"];

    if (previousAmount == null) {
      needsReview = true;
      reviewCode = "PRIOR_349_DATA_MISSING";
      opts.warnings.push({
        code: "PRIOR_349_DATA_MISSING",
        message: `Rectificativa ${rect.fullNumber ?? rect.id}: no hay 349 presentado con detalle para ${vat.vatId} · ${key} en ${originalPeriod}.`,
        sourceId: rect.id,
      });
      previousAmount = originalDeclaredBase;
    }

    rectifications.push({
      operatorVatId: vat.vatId,
      operatorName: rect.client.name,
      country: vat.country,
      operationKey: key,
      originalPeriod,
      filingPeriod,
      previousAmount: round2(previousAmount),
      correctedAmount: round2(correctedAmount),
      delta: round2(correctedAmount - previousAmount),
      trace: [
        {
          sourceType: "invoice",
          sourceId: rect.id,
          label: rect.fullNumber ?? `Rectificativa ${rect.id.slice(0, 8)}`,
          issueDate: rect.issueDate.toISOString().slice(0, 10),
          base: round2(correctedAmount - previousAmount),
          href: `/invoices/${rect.id}`,
        },
        {
          sourceType: "invoice",
          sourceId: original.id,
          label: original.fullNumber ?? `Original ${original.id.slice(0, 8)}`,
          issueDate: original.issueDate.toISOString().slice(0, 10),
          base: originalDeclaredBase,
          href: `/invoices/${original.id}`,
        },
      ],
      needsReview,
      reviewCode,
    });
  }

  return rectifications;
}

export function build349PresentedSnapshot(result: {
  periodicity: import("@/lib/modelo-349/types").Model349Periodicity;
  operations: import("@/lib/modelo-349/types").Model349Operation[];
  rectifications: Model349Rectification[];
}): Model349PresentedSnapshot {
  return {
    version: 1,
    periodicity: result.periodicity,
    operations: result.operations.map((o) => ({
      vatId: o.vatId,
      country: o.country,
      operatorName: o.operatorName,
      key: o.key,
      amount: o.amount,
    })),
    rectifications: result.rectifications.map((r) => ({
      operatorVatId: r.operatorVatId,
      operatorName: r.operatorName,
      country: r.country,
      operationKey: r.operationKey,
      originalPeriod: r.originalPeriod,
      filingPeriod: r.filingPeriod,
      previousAmount: r.previousAmount,
      correctedAmount: r.correctedAmount,
      delta: r.delta,
    })),
  };
}

/** Recalcula operaciones del periodo incorporando efecto neto de rectificativas en el periodo original. */
export function merge349OperationsWithRectifications(
  operations: import("@/lib/modelo-349/types").Model349Operation[],
  rectifications: Model349Rectification[]
): import("@/lib/modelo-349/types").Model349Operation[] {
  const map = new Map<string, import("@/lib/modelo-349/types").Model349Operation>();
  for (const op of operations) {
    map.set(`${op.key}|${op.vatId}`, { ...op, trace: [...op.trace] });
  }
  for (const r of rectifications) {
    const k = `${r.operationKey}|${r.operatorVatId}`;
    const cur = map.get(k);
    if (cur) {
      cur.amount = round2(r.correctedAmount);
    }
  }
  return [...map.values()];
}

export function aggregate349ForQuarterTotals(
  invoices: Model349InvoiceRow[],
  expenses: Model349ExpenseRow[],
  year: number,
  quarter: FiscalQuarter
): number {
  const warnings: Model349Warning[] = [];
  const { from, to } = quarterRange(year, quarter);
  const inv = collect349InvoiceLines(invoices, from, to, warnings);
  const exp = collect349ExpenseLines(expenses, from, to, warnings);
  const ops = group349Operations([...inv.lines, ...exp.lines]);
  return round2(ops.reduce((s, o) => s + Math.abs(o.amount), 0));
}

export { filingQuarterKey };
