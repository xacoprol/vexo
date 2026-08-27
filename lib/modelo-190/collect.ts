import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding/types";
import { filterEffectiveWithholdings } from "@/lib/fiscal-withholding/effective";
import { resolve111WithholdingPeriod } from "@/lib/modelo-111/period";
import { validate111Payee } from "@/lib/modelo-111/collect";
import { resolve190PerceptionClassification } from "@/lib/modelo-190/classify";
import type {
  Model190Warning,
  Model190WithholdingRow,
} from "@/lib/modelo-190/types";

/**
 * Misma semántica de efectividad que el 111 (ACTIVE / no SUPERSEDED).
 * Filtro anual por paymentDate del ejercicio.
 */
export function collectEffectiveProfessionalWithholdings(opts: {
  withholdings: Model190WithholdingRow[];
  year: number;
}): {
  included: Model190WithholdingRow[];
  missingPaymentDate: Model190WithholdingRow[];
  warnings: Model190Warning[];
} {
  const warnings: Model190Warning[] = [];
  const missingPaymentDate: Model190WithholdingRow[] = [];
  const included: Model190WithholdingRow[] = [];

  const candidates = opts.withholdings.filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.PROFESSIONAL
  );
  const effective = filterEffectiveWithholdings(candidates);

  for (const w of effective) {
    const resolution = resolve111WithholdingPeriod(w);
    if (!resolution.ok) {
      missingPaymentDate.push(w);
      warnings.push({
        code: "MODEL190_PAYMENT_DATE_MISSING",
        message: resolution.message.replace(
          "Modelo 111",
          "Modelo 190"
        ),
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
      continue;
    }
    if (resolution.year !== opts.year) continue;

    const payee = validate111Payee(w as Parameters<typeof validate111Payee>[0]);
    if (!payee.ok) {
      warnings.push({
        code: "MODEL190_PAYEE_ID_MISSING",
        message: payee.message,
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
    }

    const cls = resolve190PerceptionClassification(w);
    if (cls.warning) warnings.push(cls.warning);

    included.push(w);
  }

  return { included, missingPaymentDate, warnings };
}
