import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding/types";
import { filterEffectiveWithholdings } from "@/lib/fiscal-withholding/effective";
import { resolve115WithholdingPeriod } from "@/lib/modelo-115/period";
import type {
  Model180LeaseRef,
  Model180Warning,
  Model180WithholdingRow,
} from "@/lib/modelo-180/types";

/**
 * Misma efectividad ACTIVE/SUPERSEDED que el 115; filtro anual por paymentDate.
 */
export function collectEffective180Withholdings(opts: {
  withholdings: Model180WithholdingRow[];
  leasesById?: Map<string, Model180LeaseRef>;
  year: number;
}): {
  included: Model180WithholdingRow[];
  missingPaymentDate: Model180WithholdingRow[];
  warnings: Model180Warning[];
} {
  const warnings: Model180Warning[] = [];
  const missingPaymentDate: Model180WithholdingRow[] = [];
  const included: Model180WithholdingRow[] = [];
  const leasesById = opts.leasesById ?? new Map();

  const candidates = opts.withholdings.filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.RENT
  );
  const effective = filterEffectiveWithholdings(candidates);

  for (const w of effective) {
    const resolution = resolve115WithholdingPeriod(w);
    if (!resolution.ok) {
      missingPaymentDate.push(w);
      warnings.push({
        code: "MODEL180_PAYMENT_DATE_MISSING",
        message:
          "Falta paymentDate: no se puede ubicar la retención RENT en el 180 anual.",
        withholdingId: w.id,
        sourceId: w.sourceId,
        severity: "ERROR",
      });
      continue;
    }
    if (resolution.year !== opts.year) continue;

    if (!w.counterpartyId) {
      warnings.push({
        code: "MODEL180_LANDLORD_ID_MISSING",
        message: "Retención RENT sin counterpartyId.",
        withholdingId: w.id,
        severity: "ERROR",
      });
    }

    const lease = w.leaseId ? leasesById.get(w.leaseId) : null;
    if (w.leaseId && !lease) {
      warnings.push({
        code: "MODEL180_PROPERTY_DATA_MISSING",
        message: `Lease ${w.leaseId} no encontrado para withholding ${w.id}.`,
        withholdingId: w.id,
        leaseId: w.leaseId,
        severity: "WARNING",
      });
    } else if (lease) {
      if (lease.counterpartyId !== w.counterpartyId) {
        warnings.push({
          code: "MODEL180_LANDLORD_ID_MISSING",
          message: "Arrendador del lease ≠ counterparty de la retención.",
          withholdingId: w.id,
          leaseId: lease.id,
          severity: "ERROR",
        });
      }
      if (!lease.cadastralReference?.trim()) {
        warnings.push({
          code: "MODEL180_CADASTRAL_DATA_MISSING",
          message:
            `Inmueble «${lease.propertyAddress}» sin referencia catastral. ` +
            "Situación=4 (sin RC) según diseño AEAT; no se inventa la referencia.",
          leaseId: lease.id,
          counterpartyId: lease.counterpartyId,
          severity: "WARNING",
        });
      }
      if (!lease.propertyAddress?.trim()) {
        warnings.push({
          code: "MODEL180_PROPERTY_DATA_MISSING",
          message: "Falta dirección del inmueble en el lease.",
          leaseId: lease.id,
          severity: "ERROR",
        });
      }
    } else if (!w.leaseId) {
      warnings.push({
        code: "MODEL180_PROPERTY_DATA_MISSING",
        message:
          "Retención RENT sin leaseId: no se puede desglosar inmueble en el 180.",
        withholdingId: w.id,
        severity: "ERROR",
      });
    }

    included.push(w);
  }

  return { included, missingPaymentDate, warnings };
}
