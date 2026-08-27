import type { FiscalQuarter } from "@/lib/fiscal";
import { round2 } from "@/lib/modelo-390/money";
import {
  assemble111Boxes,
  build111BoxList,
  to111TraceLine,
} from "@/lib/modelo-111/boxes";
import { collectEffective111Withholdings } from "@/lib/modelo-111/collect";
import { resolve111Deadline } from "@/lib/modelo-111/deadlines";
import { assess111FilingObligation } from "@/lib/modelo-111/filing-obligation";
import { resolveModel111Periodicity } from "@/lib/modelo-111/period";
import type {
  Model111Outcome,
  Model111Result,
  Model111WithholdingRow,
} from "@/lib/modelo-111/types";
import {
  MODEL111_SCOPE_NOTE,
  MODEL111_SUPPORTED_SECTIONS,
} from "@/lib/modelo-111/types";

export type BuildModel111Input = {
  year: number;
  quarter: FiscalQuarter;
  month?: number | null;
  withholdings: Model111WithholdingRow[];
  censusModel111?: string | null;
  paysProfessionalsSubjectToWithholding?: string | null;
  hasEmployees?: string | null;
  model111Periodicity?: string | null;
  /** Intento de complementaria → aviso. */
  complementaryAttempt?: boolean;
};

function resolveOutcome(opts: {
  hasRelevantPayments: boolean;
  box08: number;
  box09: number;
  box30: number;
  requiresReview: boolean;
}): Model111Outcome {
  if (opts.requiresReview) return "REQUIRES_REVIEW";
  if (!opts.hasRelevantPayments) return "NO_RELEVANT_PAYMENTS";
  if (opts.box08 > 0 && opts.box09 <= 0) return "NEGATIVE";
  if (opts.box30 > 0) return "TO_PAY";
  if (opts.box08 > 0) return "NEGATIVE";
  return "NO_RELEVANT_PAYMENTS";
}

/**
 * Motor puro Modelo 111 (scope profesionales).
 */
export function buildModel111(input: BuildModel111Input): Model111Result {
  const { periodicity, assumedFromUnknown } = resolveModel111Periodicity(
    input.model111Periodicity
  );
  const warnings = [];

  if (assumedFromUnknown) {
    warnings.push({
      code: "MODEL111_PERIODICITY_ASSUMED_QUARTERLY",
      message:
        "Periodicidad 111 UNKNOWN: se asume trimestral (autónomo PF ordinario). Confirma en Ajustes si debes presentar mensualmente.",
      severity: "INFO" as const,
    });
  }

  if (input.complementaryAttempt) {
    warnings.push({
      code: "MODEL111_COMPLEMENTARY_NOT_SUPPORTED",
      message:
        "Autoliquidaciones complementarias (casilla 29) no están soportadas. box29=0 en declaración ordinaria.",
      severity: "WARNING" as const,
    });
  }

  const hasEmployees = String(input.hasEmployees ?? "UNKNOWN").toUpperCase();
  if (hasEmployees === "YES") {
    warnings.push({
      code: "MODEL111_EMPLOYEE_DATA_NOT_SUPPORTED",
      message:
        "hasEmployees=YES pero VEXO no tiene motor de nóminas/trabajo. El 111 no es definitivo (casillas 01–06 no soportadas).",
      severity: "ERROR" as const,
    });
  }

  const collected = collectEffective111Withholdings({
    withholdings: input.withholdings,
    year: input.year,
    quarter: input.quarter,
    month: input.month,
    periodicity,
  });
  warnings.push(...collected.warnings);

  if (hasEmployees === "YES") {
    warnings.push({
      code: "MODEL111_UNSUPPORTED_SECTION",
      message:
        "Sección trabajo (01–06) no soportada. No presentes el 111 como completo.",
      severity: "WARNING" as const,
    });
  }

  const zeroUnsupportedConfirmed = hasEmployees === "NO";
  const { boxes, traces } = assemble111Boxes({
    economicRows: collected.included,
    zeroUnsupportedConfirmed,
  });

  const payeeMap = new Map<
    string,
    Model111Result["payees"][number]
  >();
  for (const w of collected.included) {
    const line = to111TraceLine(w);
    let row = payeeMap.get(w.counterpartyId);
    if (!row) {
      row = {
        counterpartyId: w.counterpartyId,
        name: w.counterparty.name,
        taxId: w.counterparty.taxId,
        baseAmount: 0,
        withholdingAmount: 0,
        lines: [],
      };
      payeeMap.set(w.counterpartyId, row);
    }
    row.baseAmount = round2(row.baseAmount + line.baseAmount);
    row.withholdingAmount = round2(
      row.withholdingAmount + line.withholdingAmount
    );
    row.lines.push(line);
  }

  const requiresReview =
    warnings.some((w) => w.severity === "ERROR") ||
    collected.missingPaymentDate.length > 0 ||
    hasEmployees === "YES";

  const hasRelevantPayments = collected.included.length > 0;
  const hasSubjectBaseWithZeroWithholding =
    boxes.box08 > 0 && boxes.box09 <= 0;

  const filingObligation = assess111FilingObligation({
    censusModel111: input.censusModel111 ?? "UNKNOWN",
    hasRelevantPayments,
    totalWithholdingAmount: boxes.box09,
    hasSubjectBaseWithZeroWithholding,
    requiresReview,
    paysProfessionalsSubjectToWithholding:
      input.paysProfessionalsSubjectToWithholding,
  });

  const outcome = resolveOutcome({
    hasRelevantPayments,
    box08: boxes.box08,
    box09: boxes.box09,
    box30: boxes.box30,
    requiresReview,
  });

  const deadline = resolve111Deadline({
    year: input.year,
    quarter: input.quarter,
    month: input.month,
    periodicity,
  });

  return {
    year: input.year,
    quarter: input.quarter,
    month: input.month ?? null,
    periodicity,
    label: `${input.quarter}T ${input.year}`,
    scopeNote: MODEL111_SCOPE_NOTE,
    supportedSections: MODEL111_SUPPORTED_SECTIONS,
    boxes,
    boxList: build111BoxList(boxes),
    payees: [...payeeMap.values()],
    trace: {
      box07: traces,
      box08: traces,
      box09: traces,
    },
    warnings,
    requiresReview,
    outcome,
    filingObligation,
    deadline,
    excludedMissingPaymentDate: collected.missingPaymentDate,
  };
}
