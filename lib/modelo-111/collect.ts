import { isPlaceholderTaxId } from "@/lib/fiscal-347-349";
import { isUnmergeableTaxId } from "@/lib/fiscal-withholding/amounts";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding/types";
import { filterEffectiveWithholdings } from "@/lib/fiscal-withholding/effective";
import { isValidTaxId } from "@/lib/nif";
import type { FiscalQuarter } from "@/lib/fiscal";
import {
  withholdingIn111Period,
} from "@/lib/modelo-111/period";
import type {
  Model111Periodicity,
  Model111Warning,
  Model111WithholdingRow,
} from "@/lib/modelo-111/types";

/**
 * Registros efectivos para el 111:
 * - direction PRACTICED, kind PROFESSIONAL
 * - status ACTIVE (helper compartido con 190)
 * - período por paymentDate
 */
export function collectEffective111Withholdings(opts: {
  withholdings: Model111WithholdingRow[];
  year: number;
  quarter: FiscalQuarter;
  month?: number | null;
  periodicity: Exclude<Model111Periodicity, "UNKNOWN">;
}): {
  included: Model111WithholdingRow[];
  missingPaymentDate: Model111WithholdingRow[];
  warnings: Model111Warning[];
} {
  const warnings: Model111Warning[] = [];
  const missingPaymentDate: Model111WithholdingRow[] = [];
  const included: Model111WithholdingRow[] = [];

  const candidates = opts.withholdings.filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.PROFESSIONAL
  );
  const effective = filterEffectiveWithholdings(candidates);

  for (const w of effective) {
    const { inPeriod, resolution } = withholdingIn111Period(w, {
      year: opts.year,
      quarter: opts.quarter,
      month: opts.month,
      periodicity: opts.periodicity,
    });

    if (!resolution.ok) {
      // Solo avisar si podría pertenecer al entorno del ejercicio (accrual cercano)
      // o siempre cuando paymentDate falta en ACTIVE PROFESSIONAL del año índice.
      missingPaymentDate.push(w);
      warnings.push({
        code: "MODEL111_PAYMENT_DATE_MISSING",
        message: resolution.message,
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
      continue;
    }

    if (!inPeriod) continue;

    const payee = validate111Payee(w);
    if (!payee.ok) {
      warnings.push({
        code: payee.code,
        message: payee.message,
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
      // Incluir igual en revisión: no excluir silenciosamente del modelo completo
      included.push(w);
      continue;
    }

    included.push(w);
  }

  return { included, missingPaymentDate, warnings };
}

export function validate111Payee(w: Model111WithholdingRow):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  const cp = w.counterparty;
  if (!cp?.id) {
    return {
      ok: false,
      code: "MODEL111_PAYEE_ID_MISSING",
      message: "La retención no tiene FiscalCounterparty.",
    };
  }
  const taxId = String(cp.taxId ?? "").trim();
  if (
    !taxId ||
    isUnmergeableTaxId(taxId) ||
    isPlaceholderTaxId(taxId) ||
    !isValidTaxId(taxId, cp.countryCode || "ES")
  ) {
    return {
      ok: false,
      code: "MODEL111_PAYEE_ID_MISSING",
      message: `NIF del perceptor ausente o no válido («${taxId || "—"}»).`,
    };
  }
  if (
    cp.kind &&
    cp.kind !== "PROFESSIONAL" &&
    cp.kind !== "OTHER"
  ) {
    return {
      ok: false,
      code: "MODEL111_WITHHOLDING_MISMATCH",
      message: `Contraparte kind=${cp.kind} no adecuado para epígrafe profesionales del 111.`,
    };
  }
  return { ok: true };
}
