export type LineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountPct: number;
};

export type CalculatedLine = LineInput & {
  sortOrder: number;
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
};

export type DocumentTotals = {
  lines: CalculatedLine[];
  /** Suma de bases de línea (antes del descuento general) */
  grossSubtotal: number;
  discountPct: number;
  discountAmount: number;
  /** Base imponible tras descuento general */
  subtotal: number;
  vatAmount: number;
  vatBreakdown: { rate: number; base: number; amount: number }[];
  irpfRate: number;
  irpfAmount: number;
  total: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateLine(
  line: LineInput,
  sortOrder = 0
): CalculatedLine {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  const discount = Number(line.discountPct) || 0;
  const vat = Number(line.vatRate) || 0;

  const gross = qty * price;
  const lineSubtotal = round2(gross * (1 - discount / 100));
  const lineVat = round2(lineSubtotal * (vat / 100));
  const lineTotal = round2(lineSubtotal + lineVat);

  return {
    description: line.description,
    quantity: qty,
    unitPrice: price,
    vatRate: vat,
    discountPct: discount,
    sortOrder,
    lineSubtotal,
    lineVat,
    lineTotal,
  };
}

/**
 * @param irpfRate retención IRPF %
 * @param globalDiscountPct descuento general % sobre la base (tras dto. de línea)
 */
export function calculateDocument(
  lines: LineInput[],
  irpfRate = 0,
  globalDiscountPct = 0
): DocumentTotals {
  const calculated = lines.map((l, i) => calculateLine(l, i));
  const grossSubtotal = round2(
    calculated.reduce((s, l) => s + l.lineSubtotal, 0)
  );

  const discountPct = Math.min(
    100,
    Math.max(0, Number(globalDiscountPct) || 0)
  );
  const discountAmount = round2((grossSubtotal * discountPct) / 100);
  const factor = 1 - discountPct / 100;
  const subtotal = round2(grossSubtotal - discountAmount);

  const byRate = new Map<number, { base: number; amount: number }>();
  for (const l of calculated) {
    const cur = byRate.get(l.vatRate) ?? { base: 0, amount: 0 };
    const base = round2(l.lineSubtotal * factor);
    const amount = round2(base * (l.vatRate / 100));
    cur.base = round2(cur.base + base);
    cur.amount = round2(cur.amount + amount);
    byRate.set(l.vatRate, cur);
  }

  const vatBreakdown = [...byRate.entries()]
    .map(([rate, v]) => ({ rate, base: v.base, amount: v.amount }))
    .sort((a, b) => b.rate - a.rate);

  const vatAmount = round2(vatBreakdown.reduce((s, v) => s + v.amount, 0));

  const rate = Number(irpfRate) || 0;
  const irpfAmount = round2(subtotal * (rate / 100));
  const total = round2(subtotal + vatAmount - irpfAmount);

  return {
    lines: calculated,
    grossSubtotal,
    discountPct,
    discountAmount,
    subtotal,
    vatAmount,
    vatBreakdown,
    irpfRate: rate,
    irpfAmount,
    total,
  };
}

export function formatCurrency(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  const amount = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export const VAT_RATES = [21, 10, 4, 0] as const;
export const IRPF_RATES = [0, 7, 15] as const;
