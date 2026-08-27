import { isPlaceholderTaxId } from "@/lib/fiscal-347-349";
import { isUnmergeableTaxId } from "@/lib/fiscal-withholding/amounts";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding/types";
import { filterEffectiveWithholdings } from "@/lib/fiscal-withholding/effective";
import { isValidTaxId } from "@/lib/nif";
import type { FiscalQuarter } from "@/lib/fiscal";
import { withholdingIn115Period } from "@/lib/modelo-115/period";
import type {
  Model115LeaseRef,
  Model115Periodicity,
  Model115Warning,
  Model115WithholdingRow,
} from "@/lib/modelo-115/types";

/**
 * Registros efectivos para el 115:
 * - PRACTICED + RENT
 * - ACTIVE (helper compartido con 180)
 * - período por paymentDate
 * - consistencia lease cuando hay leaseId
 */
export function collectEffective115Withholdings(opts: {
  withholdings: Model115WithholdingRow[];
  leasesById?: Map<string, Model115LeaseRef>;
  year: number;
  quarter: FiscalQuarter;
  month?: number | null;
  periodicity: Exclude<Model115Periodicity, "UNKNOWN">;
}): {
  included: Model115WithholdingRow[];
  missingPaymentDate: Model115WithholdingRow[];
  warnings: Model115Warning[];
} {
  const warnings: Model115Warning[] = [];
  const missingPaymentDate: Model115WithholdingRow[] = [];
  const included: Model115WithholdingRow[] = [];
  const leasesById = opts.leasesById ?? new Map();

  const candidates = opts.withholdings.filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.RENT
  );
  const effective = filterEffectiveWithholdings(candidates);

  for (const w of effective) {
    const { inPeriod, resolution } = withholdingIn115Period(w, {
      year: opts.year,
      quarter: opts.quarter,
      month: opts.month,
      periodicity: opts.periodicity,
    });

    if (!resolution.ok) {
      missingPaymentDate.push(w);
      warnings.push({
        code: "MODEL115_PAYMENT_DATE_MISSING",
        message: resolution.message,
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
      continue;
    }

    if (!inPeriod) continue;

    const payee = validate115Landlord(w);
    if (!payee.ok) {
      warnings.push({
        code: payee.code,
        message: payee.message,
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
    }

    // Lease consistency
    if (w.leaseId) {
      const lease = leasesById.get(w.leaseId);
      if (!lease) {
        warnings.push({
          code: "MODEL115_LEASE_MISMATCH",
          message: `FiscalWithholding RENT apunta a leaseId inexistente (${w.leaseId}).`,
          withholdingId: w.id,
          leaseId: w.leaseId,
          sourceId: w.sourceId,
          severity: "ERROR",
        });
      } else {
        if (lease.counterpartyId !== w.counterpartyId) {
          warnings.push({
            code: "MODEL115_LEASE_WITHHOLDING_MISMATCH",
            message:
              "El arrendador del Lease no coincide con el counterparty de la retención RENT.",
            withholdingId: w.id,
            leaseId: lease.id,
            sourceId: w.sourceId,
            severity: "ERROR",
          });
        }
        if (lease.withholdingStatus === "NO") {
          warnings.push({
            code: "MODEL115_LEASE_WITHHOLDING_MISMATCH",
            message:
              "Existe FiscalWithholding RENT ACTIVE pero el lease declara withholdingStatus=NO.",
            withholdingId: w.id,
            leaseId: lease.id,
            sourceId: w.sourceId,
            severity: "ERROR",
          });
        } else if (lease.withholdingStatus === "UNKNOWN") {
          warnings.push({
            code: "MODEL115_EXEMPTION_REVIEW_REQUIRED",
            message:
              "Lease con withholdingStatus=UNKNOWN y retención RENT ACTIVE — revisa la sujeción.",
            withholdingId: w.id,
            leaseId: lease.id,
            severity: "WARNING",
          });
        }
      }
    } else if (w.sourceType === "EXPENSE") {
      warnings.push({
        code: "MODEL115_LEASE_MISMATCH",
        message:
          "Retención RENT desde Expense sin leaseId vinculado — conviene vincular el local.",
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "WARNING",
      });
    }

    included.push(w);
  }

  return { included, missingPaymentDate, warnings };
}

export function validate115Landlord(w: Model115WithholdingRow):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  const cp = w.counterparty;
  if (!cp?.id) {
    return {
      ok: false,
      code: "MODEL115_LANDLORD_ID_MISSING",
      message: "La retención RENT no tiene FiscalCounterparty.",
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
      code: "MODEL115_LANDLORD_ID_MISSING",
      message: `NIF del arrendador ausente o no válido («${taxId || "—"}»).`,
    };
  }
  if (cp.kind && cp.kind !== "LANDLORD" && cp.kind !== "OTHER") {
    return {
      ok: false,
      code: "MODEL115_WITHHOLDING_MISMATCH",
      message: `Contraparte kind=${cp.kind} no adecuado para Modelo 115 (esperado LANDLORD).`,
    };
  }
  return { ok: true };
}
