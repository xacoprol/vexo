/**
 * Deducibilidad independiente IVA / IRPF para gastos.
 * Centraliza el importe computable en IRPF (incl. IVA no deducible como coste).
 */

export type ExpenseDeductibilityInput = {
  subtotal: number;
  vatAmount: number;
  /** 0–100 */
  vatDeductiblePct: number;
  /** 0–100 */
  irpfDeductiblePct: number;
  isInvestment?: boolean;
};

export type ExpenseDeductibilityBreakdown = {
  vatDeductiblePct: number;
  irpfDeductiblePct: number;
  deductibleVat: number;
  nonDeductibleVat: number;
  /** Base + IVA no deducible, antes de aplicar % IRPF */
  irpfCostBeforePct: number;
  /** Importe computable en IRPF / casilla 02 (0 si inversión) */
  irpfComputable: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clampPct(raw: unknown, fallback = 100): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

/**
 * IVA no deducible forma parte del coste IRPF cuando fiscalmente corresponde.
 *
 * irpfComputable =
 *   (subtotal + vatAmount × (1 − vatDeductiblePct/100)) × (irpfDeductiblePct/100)
 *
 * Inversiones: 0 (entran por amortización).
 */
export function computeExpenseDeductibility(
  input: ExpenseDeductibilityInput
): ExpenseDeductibilityBreakdown {
  const vatDeductiblePct = clampPct(input.vatDeductiblePct);
  const irpfDeductiblePct = clampPct(input.irpfDeductiblePct);
  const subtotal = Number(input.subtotal) || 0;
  const vatAmount = Math.max(0, Number(input.vatAmount) || 0);

  const deductibleVat = round2(vatAmount * (vatDeductiblePct / 100));
  const nonDeductibleVat = round2(vatAmount - deductibleVat);
  const irpfCostBeforePct = round2(subtotal + nonDeductibleVat);

  if (input.isInvestment) {
    return {
      vatDeductiblePct,
      irpfDeductiblePct,
      deductibleVat,
      nonDeductibleVat,
      irpfCostBeforePct,
      irpfComputable: 0,
    };
  }

  return {
    vatDeductiblePct,
    irpfDeductiblePct,
    deductibleVat,
    nonDeductibleVat,
    irpfCostBeforePct,
    irpfComputable: round2(irpfCostBeforePct * (irpfDeductiblePct / 100)),
  };
}

/** Base IVA soportado deducible (interior / extracom cuota en 29). */
export function deductibleVatAmount(
  vatAmount: number,
  vatDeductiblePct: number
): number {
  return round2(Math.max(0, vatAmount) * (clampPct(vatDeductiblePct) / 100));
}

/** Base AIB deducible (casillas 36) a partir de base accrued × %. */
export function aibDeductibleShare(
  accruedBase: number,
  accruedVat: number,
  vatDeductiblePct: number
): { deductibleBase: number; deductibleVat: number } {
  const pct = clampPct(vatDeductiblePct) / 100;
  return {
    deductibleBase: round2(accruedBase * pct),
    deductibleVat: round2(accruedVat * pct),
  };
}

/**
 * Sincroniza el booleano legacy `deductible` desde porcentajes.
 * true solo si ambos están al 100 % (comportamiento histórico “todo deducible”).
 */
export function legacyDeductibleFlag(
  vatDeductiblePct: number,
  irpfDeductiblePct: number
): boolean {
  return clampPct(vatDeductiblePct) >= 100 && clampPct(irpfDeductiblePct) >= 100;
}

/**
 * Desde el checkbox legacy: true → 100/100; false → 0/0.
 */
export function pctsFromLegacyDeductible(deductible: boolean): {
  vatDeductiblePct: number;
  irpfDeductiblePct: number;
} {
  return deductible
    ? { vatDeductiblePct: 100, irpfDeductiblePct: 100 }
    : { vatDeductiblePct: 0, irpfDeductiblePct: 0 };
}
