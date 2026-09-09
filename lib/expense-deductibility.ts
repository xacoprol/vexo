/**
 * Deducibilidad independiente IVA / IRPF para gastos.
 * Centraliza el importe computable en IRPF (incl. IVA no deducible como coste).
 *
 * DECISIÓN FASE 2 (fail-closed / históricos):
 * - Prisma persiste vatDeductiblePct/irpfDeductiblePct @default(100) y deductible@default(true).
 *   Esos defaults son fuente de verdad explícita para datos migrados → se respetan (no romper histórico).
 * - Campos omitidos (undefined) en filas intermedias ≡ mismos defaults 100.
 * - Ausencia ambigua solo si deductible === null (explícito) Y ambos pct son null
 *   → unresolvedDeductibility=true; el caller debe bloquear presentación, no asumir 100% en silencio.
 */

export type ExpenseDeductibilityInput = {
  subtotal: number;
  vatAmount: number;
  /** 0–100; omitido + deductible null → unresolved */
  vatDeductiblePct?: number | null;
  /** 0–100 */
  irpfDeductiblePct?: number | null;
  /** Legacy binario; false → 0%; null + pcts null → unresolved */
  deductible?: boolean | null;
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
  /** true si no hay base segura para % — no usar como 100% silencioso */
  unresolvedDeductibility: boolean;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clampPct(raw: unknown, fallback = 100): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function resolvePcts(input: ExpenseDeductibilityInput): {
  vatDeductiblePct: number;
  irpfDeductiblePct: number;
  unresolvedDeductibility: boolean;
} {
  const vatMissing = input.vatDeductiblePct == null;
  const irpfMissing = input.irpfDeductiblePct == null;
  /**
   * Ausencia ambigua = deductible explícitamente null Y ambos pct null.
   * Omitir campos (undefined) ≡ defaults Prisma históricos 100 — no romper fixtures/DB shape.
   */
  if (vatMissing && irpfMissing && input.deductible === null) {
    return {
      vatDeductiblePct: 0,
      irpfDeductiblePct: 0,
      unresolvedDeductibility: true,
    };
  }

  if (input.deductible === false) {
    return {
      vatDeductiblePct: vatMissing ? 0 : clampPct(input.vatDeductiblePct, 0),
      irpfDeductiblePct: irpfMissing ? 0 : clampPct(input.irpfDeductiblePct, 0),
      unresolvedDeductibility: false,
    };
  }

  // deductible true/undefined with at least one pct or legacy omit → defaults 100 (histórico)
  return {
    vatDeductiblePct: clampPct(input.vatDeductiblePct, 100),
    irpfDeductiblePct: clampPct(input.irpfDeductiblePct, 100),
    unresolvedDeductibility: false,
  };
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
  const { vatDeductiblePct, irpfDeductiblePct, unresolvedDeductibility } =
    resolvePcts(input);
  const subtotal = Number(input.subtotal) || 0;
  // Preserve sign: supplier credit notes / abonos carry negative base and VAT.
  const vatAmount = Number(input.vatAmount) || 0;

  if (unresolvedDeductibility) {
    return {
      vatDeductiblePct: 0,
      irpfDeductiblePct: 0,
      deductibleVat: 0,
      nonDeductibleVat: 0,
      irpfCostBeforePct: 0,
      irpfComputable: 0,
      unresolvedDeductibility: true,
    };
  }

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
      unresolvedDeductibility: false,
    };
  }

  return {
    vatDeductiblePct,
    irpfDeductiblePct,
    deductibleVat,
    nonDeductibleVat,
    irpfCostBeforePct,
    irpfComputable: round2(irpfCostBeforePct * (irpfDeductiblePct / 100)),
    unresolvedDeductibility: false,
  };
}

/** Base IVA soportado deducible (interior / extracom cuota en 29). Sign-preserving. */
export function deductibleVatAmount(
  vatAmount: number,
  vatDeductiblePct: number
): number {
  return round2((Number(vatAmount) || 0) * (clampPct(vatDeductiblePct) / 100));
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
