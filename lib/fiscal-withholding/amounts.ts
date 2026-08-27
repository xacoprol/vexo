import { isPlaceholderTaxId } from "@/lib/fiscal-347-349";
import { normalizeTaxId as normalizeTaxIdCore } from "@/lib/nif";
import { moneyEqual, round2 } from "@/lib/modelo-390/money";
import type {
  PracticedWithholdingStatus,
} from "@/lib/fiscal-withholding/types";
import { PRACTICED_WITHHOLDING_STATUS } from "@/lib/fiscal-withholding/types";

/** Normaliza NIF de forma consistente (espacios, guiones, puntos → vacío; mayúsculas). */
export function normalizeCounterpartyTaxId(
  raw: string | null | undefined
): string {
  return normalizeTaxIdCore(String(raw ?? "").trim());
}

/**
 * NIF vacío, PEND-*, o literales no identificables no deben fusionarse.
 */
export function isUnmergeableTaxId(raw: string | null | undefined): boolean {
  const normalized = normalizeCounterpartyTaxId(raw);
  if (!normalized) return true;
  const rawStr = String(raw ?? "");
  if (isPlaceholderTaxId(rawStr) || isPlaceholderTaxId(normalized)) return true;
  if (/^VARIOS$/i.test(normalized)) return true;
  return false;
}

export function parsePracticedWithholdingStatus(
  raw: unknown
): PracticedWithholdingStatus {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "YES" || v === "SI" || v === "SÍ" || v === "1" || v === "TRUE") {
    return PRACTICED_WITHHOLDING_STATUS.YES;
  }
  if (v === "NO" || v === "0" || v === "FALSE") {
    return PRACTICED_WITHHOLDING_STATUS.NO;
  }
  return PRACTICED_WITHHOLDING_STATUS.UNKNOWN;
}

/**
 * Importes del gasto con retención practicada.
 *
 * Expense.total = importe bruto del documento (subtotal+IVA interior; reverse charge ≈ subtotal).
 * amountPayable = bruto − retención practicada (solo si status = YES).
 *
 * La retención NO altera subtotal ni vatAmount.
 */
export function resolveExpenseDocumentAmounts(opts: {
  subtotal: number;
  vatAmount: number;
  /** Gross document amount (Expense.total). */
  total: number;
  practicedWithholdingStatus: PracticedWithholdingStatus | string;
  practicedWithholdingAmount?: number | null;
}): {
  baseAmount: number;
  vatAmount: number;
  grossInvoiceAmount: number;
  withholdingAmount: number;
  amountPayable: number;
} {
  const baseAmount = round2(Math.max(0, Number(opts.subtotal) || 0));
  const vatAmount = round2(Math.max(0, Number(opts.vatAmount) || 0));
  const grossInvoiceAmount = round2(Math.max(0, Number(opts.total) || 0));
  const status = parsePracticedWithholdingStatus(opts.practicedWithholdingStatus);
  const withholdingAmount =
    status === PRACTICED_WITHHOLDING_STATUS.YES
      ? round2(Math.max(0, Number(opts.practicedWithholdingAmount) || 0))
      : 0;
  return {
    baseAmount,
    vatAmount,
    grossInvoiceAmount,
    withholdingAmount,
    amountPayable: round2(grossInvoiceAmount - withholdingAmount),
  };
}

export type PracticedWithholdingInput = {
  counterpartyTaxId: string | null | undefined;
  counterpartyName: string | null | undefined;
  baseAmount: number;
  rate: number;
  withholdingAmount: number;
  accrualDate: Date | null | undefined;
};

export type PracticedWithholdingValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Validación de retención PRACTICED (profesional).
 * No asume tipo 15 %: el rate lo introduce el usuario.
 */
export function validatePracticedWithholding(
  input: PracticedWithholdingInput
): PracticedWithholdingValidation {
  const taxId = normalizeCounterpartyTaxId(input.counterpartyTaxId);
  if (!taxId || isUnmergeableTaxId(input.counterpartyTaxId)) {
    return {
      ok: false,
      code: "WITHHOLDING_COUNTERPARTY_TAX_ID",
      message:
        "El NIF del perceptor es obligatorio y debe ser identificable (no PEND-/vacío/VARIOS).",
    };
  }

  const name = String(input.counterpartyName ?? "").trim();
  if (!name) {
    return {
      ok: false,
      code: "WITHHOLDING_COUNTERPARTY_NAME",
      message: "El nombre del perceptor es obligatorio.",
    };
  }

  if (!(input.accrualDate instanceof Date) || Number.isNaN(input.accrualDate.getTime())) {
    return {
      ok: false,
      code: "WITHHOLDING_ACCRUAL_DATE",
      message: "La fecha de la factura (devengo) es obligatoria.",
    };
  }

  const base = Number(input.baseAmount);
  const rate = Number(input.rate);
  const amount = Number(input.withholdingAmount);

  if (!Number.isFinite(base) || base <= 0) {
    return {
      ok: false,
      code: "WITHHOLDING_BASE",
      message: "La base sujeta a retención debe ser mayor que 0.",
    };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return {
      ok: false,
      code: "WITHHOLDING_RATE",
      message: "El tipo de retención no puede ser negativo.",
    };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      ok: false,
      code: "WITHHOLDING_AMOUNT",
      message: "La retención no puede ser negativa.",
    };
  }

  const expected = round2(base * (rate / 100));
  if (!moneyEqual(amount, expected)) {
    return {
      ok: false,
      code: "WITHHOLDING_AMOUNT_MISMATCH",
      message: `La retención (${amount} €) no coincide con base × tipo (${expected} €).`,
    };
  }

  return { ok: true };
}

export function expectedWithholdingAmount(base: number, rate: number): number {
  return round2(Math.max(0, Number(base) || 0) * (Math.max(0, Number(rate) || 0) / 100));
}
