import type { FiscalQuarter } from "@/lib/fiscal";
import { round2 } from "@/lib/modelo-390/money";
import {
  assemble115Boxes,
  build115BoxList,
  to115TraceLine,
} from "@/lib/modelo-115/boxes";
import { collectEffective115Withholdings } from "@/lib/modelo-115/collect";
import { resolve115Deadline } from "@/lib/modelo-115/deadlines";
import { assess115FilingObligation } from "@/lib/modelo-115/filing-obligation";
import { resolveModel115Periodicity } from "@/lib/modelo-115/period";
import type {
  Model115LeaseRef,
  Model115Outcome,
  Model115Result,
  Model115Warning,
  Model115WithholdingRow,
} from "@/lib/modelo-115/types";
import {
  MODEL115_PERIOD_RULE_NOTE,
  MODEL115_SCOPE_NOTE,
} from "@/lib/modelo-115/types";

export type BuildModel115Input = {
  year: number;
  quarter: FiscalQuarter;
  month?: number | null;
  withholdings: Model115WithholdingRow[];
  leases?: Model115LeaseRef[];
  censusModel115?: string | null;
  rentsBusinessPremises?: string | null;
  businessRentSubjectToWithholding?: string | null;
  model115Periodicity?: string | null;
  complementaryAttempt?: boolean;
};

function resolveOutcome(opts: {
  hasRelevantPayments: boolean;
  box02: number;
  box03: number;
  box05: number;
  requiresReview: boolean;
}): Model115Outcome {
  if (opts.requiresReview) return "REQUIRES_REVIEW";
  if (!opts.hasRelevantPayments) return "NO_RELEVANT_PAYMENTS";
  if (opts.box02 > 0 && opts.box03 <= 0) return "NEGATIVE";
  if (opts.box05 > 0) return "TO_PAY";
  if (opts.box02 > 0) return "NEGATIVE";
  return "NO_RELEVANT_PAYMENTS";
}

/**
 * Motor puro Modelo 115 (casillas oficiales 01–05).
 */
export function buildModel115(input: BuildModel115Input): Model115Result {
  const { periodicity, assumedFromUnknown } = resolveModel115Periodicity(
    input.model115Periodicity
  );
  const warnings: Model115Warning[] = [];

  if (assumedFromUnknown) {
    warnings.push({
      code: "MODEL115_PERIODICITY_ASSUMED_QUARTERLY",
      message:
        "Periodicidad 115 UNKNOWN: se asume trimestral (autónomo PF ordinario). Confirma en Ajustes si debes presentar mensualmente (p. ej. gran empresa).",
      severity: "INFO",
    });
  }

  if (input.complementaryAttempt) {
    warnings.push({
      code: "MODEL115_COMPLEMENTARY_NOT_SUPPORTED",
      message:
        "Declaraciones complementarias (casilla 04) no automatizadas. box04=0 en ordinaria.",
      severity: "WARNING",
    });
  }

  const leases = input.leases ?? [];
  const leasesById = new Map(leases.map((l) => [l.id, l]));

  for (const lease of leases) {
    if (!lease.active) continue;
    if (lease.withholdingStatus === "UNKNOWN") {
      warnings.push({
        code: "MODEL115_EXEMPTION_REVIEW_REQUIRED",
        message: `Local «${lease.propertyAddress}»: withholdingStatus=UNKNOWN.`,
        leaseId: lease.id,
        severity: "WARNING",
      });
    } else if (
      lease.withholdingStatus === "NO" &&
      (!lease.withholdingExemptionReason ||
        lease.withholdingExemptionReason === "UNKNOWN")
    ) {
      warnings.push({
        code: "MODEL115_EXEMPTION_REVIEW_REQUIRED",
        message: `Local «${lease.propertyAddress}»: NO retención sin motivo declarado.`,
        leaseId: lease.id,
        severity: "WARNING",
      });
    }
  }

  const collected = collectEffective115Withholdings({
    withholdings: input.withholdings,
    leasesById,
    year: input.year,
    quarter: input.quarter,
    month: input.month,
    periodicity,
  });
  warnings.push(...collected.warnings);

  const { boxes, traces } = assemble115Boxes({
    rows: collected.included,
    leasesById,
  });

  const landlordMap = new Map<string, Model115Result["landlords"][number]>();
  for (const w of collected.included) {
    const lease = w.leaseId ? leasesById.get(w.leaseId) : null;
    const line = to115TraceLine(w, lease);
    let row = landlordMap.get(w.counterpartyId);
    if (!row) {
      row = {
        counterpartyId: w.counterpartyId,
        taxId: w.counterparty.taxId,
        name: w.counterparty.name,
        baseAmount: 0,
        withholdingAmount: 0,
        leaseIds: [],
        trace: [],
      };
      landlordMap.set(w.counterpartyId, row);
    }
    row.baseAmount = round2(row.baseAmount + line.baseAmount);
    row.withholdingAmount = round2(
      row.withholdingAmount + line.withholdingAmount
    );
    row.trace.push(line);
    if (line.leaseId && !row.leaseIds.includes(line.leaseId)) {
      row.leaseIds.push(line.leaseId);
    }
  }

  const requiresReview =
    warnings.some((w) => w.severity === "ERROR") ||
    collected.missingPaymentDate.length > 0;

  const hasRelevantPayments = collected.included.length > 0;
  const hasLeaseWithholdingUnknown = leases.some(
    (l) => l.active && l.withholdingStatus === "UNKNOWN"
  );

  const filingObligation = assess115FilingObligation({
    censusModel115: input.censusModel115 ?? "UNKNOWN",
    hasRelevantPayments,
    totalWithholdingAmount: boxes.box03,
    hasSubjectBaseWithZeroWithholding: boxes.box02 > 0 && boxes.box03 <= 0,
    requiresReview,
    hasLeaseWithholdingUnknown,
    rentsBusinessPremises: input.rentsBusinessPremises,
    businessRentSubjectToWithholding: input.businessRentSubjectToWithholding,
  });

  const outcome = resolveOutcome({
    hasRelevantPayments,
    box02: boxes.box02,
    box03: boxes.box03,
    box05: boxes.box05,
    requiresReview,
  });

  const deadline = resolve115Deadline({
    year: input.year,
    quarter: input.quarter,
    month: input.month,
    periodicity,
  });

  void traces;

  return {
    year: input.year,
    quarter: input.quarter,
    month: input.month ?? null,
    periodicity,
    label: `${input.quarter}T ${input.year}`,
    scopeNote: MODEL115_SCOPE_NOTE,
    periodRuleNote: MODEL115_PERIOD_RULE_NOTE,
    boxes,
    boxList: build115BoxList(boxes),
    landlords: [...landlordMap.values()],
    warnings,
    requiresReview,
    outcome,
    filingObligation,
    deadline,
    excludedMissingPaymentDate: collected.missingPaymentDate,
  };
}
