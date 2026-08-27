import type { CensusTriState } from "@/lib/fiscal-obligations/types";
import type {
  Model115FilingObligation,
  Model115Outcome,
} from "@/lib/modelo-115/types";

/**
 * Obligación Modelo 115.
 * Lease activo ≠ operación. Solo RENT withholdings efectivas generan HAS_OPS.
 * census YES + ZERO_OPS ≠ presentar 0 automáticamente.
 */
export function assess115FilingObligation(opts: {
  censusModel115: CensusTriState | string;
  hasRelevantPayments: boolean;
  totalWithholdingAmount: number;
  hasSubjectBaseWithZeroWithholding: boolean;
  requiresReview: boolean;
  /** Lease activos con withholding UNKNOWN (sin ops). */
  hasLeaseWithholdingUnknown?: boolean;
  rentsBusinessPremises?: CensusTriState | string;
  businessRentSubjectToWithholding?: CensusTriState | string;
}): Model115FilingObligation {
  const census = String(opts.censusModel115 ?? "UNKNOWN").toUpperCase() as
    | "YES"
    | "NO"
    | "UNKNOWN";
  const reasons: string[] = [];
  const reasonCodes: string[] = [];

  const operationsSignal = opts.hasRelevantPayments
    ? ("HAS_OPS" as const)
    : ("ZERO_OPS" as const);

  let outcomeHint: Model115Outcome | null = null;
  if (opts.requiresReview) {
    outcomeHint = "REQUIRES_REVIEW";
  } else if (!opts.hasRelevantPayments) {
    outcomeHint = "NO_RELEVANT_PAYMENTS";
  } else if (
    opts.hasSubjectBaseWithZeroWithholding &&
    opts.totalWithholdingAmount <= 0
  ) {
    outcomeHint = "NEGATIVE";
  } else if (opts.totalWithholdingAmount > 0) {
    outcomeHint = "TO_PAY";
  }

  if (opts.hasLeaseWithholdingUnknown && !opts.hasRelevantPayments) {
    reasons.push(
      "Hay locales con withholdingStatus=UNKNOWN sin retención RENT clara."
    );
    reasonCodes.push("MODEL115_EXEMPTION_REVIEW_REQUIRED");
  }

  if (census === "NO") {
    reasonCodes.push("CENSUS_115_NO");
    if (operationsSignal === "HAS_OPS") {
      reasons.push(
        "Hay retenciones RENT practicadas pero el censo 115 = NO."
      );
      reasonCodes.push("CENSUS_MODEL115_MISMATCH");
      return {
        status: "UNKNOWN",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
        outcomeHint: outcomeHint ?? "REQUIRES_REVIEW",
      };
    }
    reasons.push("Perfil censal: Modelo 115 = NO.");
    return {
      status: "NOT_APPLICABLE",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: census,
      outcomeHint,
    };
  }

  if (census === "YES") {
    reasonCodes.push("CENSUS_115_YES");
    if (operationsSignal === "HAS_OPS") {
      reasons.push(
        "Censo 115 = YES y hay rentas de alquiler con retención satisfechas en el período."
      );
      return {
        status: "REQUIRED",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
        outcomeHint,
      };
    }
    reasons.push(
      "Censo 115 = YES pero no hay rentas relevantes satisfechas este período (NO_RELEVANT_PAYMENTS). Revisa baja/continuidad; no se exige 115 a cero automáticamente."
    );
    reasonCodes.push("ZERO_OPS_NOT_EXEMPT", "NO_RELEVANT_PAYMENTS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: census,
      outcomeHint: "NO_RELEVANT_PAYMENTS",
    };
  }

  // census UNKNOWN — ops no bastan para REQUIRED sin censo confirmado
  reasonCodes.push("CENSUS_115_UNKNOWN");
  if (operationsSignal === "HAS_OPS") {
    reasons.push(
      "Hay retenciones RENT; censo 115 UNKNOWN — obligación requiere revisión censal (036)."
    );
    reasonCodes.push("MODEL115_OBLIGATION_REVIEW_REQUIRED", "HAS_OPS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: "UNKNOWN",
      outcomeHint: outcomeHint ?? "REQUIRES_REVIEW",
    };
  }

  const rentSubject = String(
    opts.businessRentSubjectToWithholding ?? "UNKNOWN"
  ).toUpperCase();
  if (rentSubject === "YES" || opts.hasLeaseWithholdingUnknown) {
    reasons.push(
      "Hechos de alquiler/retención incompletos y censo 115 UNKNOWN."
    );
    reasonCodes.push("MODEL115_OBLIGATION_REVIEW_REQUIRED", "NO_RELEVANT_PAYMENTS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: "UNKNOWN",
      outcomeHint: "REQUIRES_REVIEW",
    };
  }

  reasons.push(
    "Sin rentas relevantes en el período y censo 115 UNKNOWN. No se infiere NOT_APPLICABLE."
  );
  reasonCodes.push("NO_RELEVANT_PAYMENTS", "ZERO_OPS");
  return {
    status: "UNKNOWN",
    reasons,
    reasonCodes,
    operationsSignal,
    censusSignal: "UNKNOWN",
    outcomeHint: "NO_RELEVANT_PAYMENTS",
  };
}
