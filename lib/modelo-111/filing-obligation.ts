import type { CensusTriState } from "@/lib/fiscal-obligations/types";
import type {
  Model111FilingObligation,
  Model111Outcome,
} from "@/lib/modelo-111/types";

/**
 * Obligación de presentar Modelo 111.
 * Separa censo, rentas satisfechas y operaciones del período.
 *
 * NO convierte census YES + ZERO_OPS → presentar 0 automáticamente.
 */
export function assess111FilingObligation(opts: {
  censusModel111: CensusTriState | string;
  /** Hay rentas relevantes satisfechas en el período (paymentDate). */
  hasRelevantPayments: boolean;
  /** Suma retenciones del período (box09). */
  totalWithholdingAmount: number;
  /** Hay base satisfecha > 0 aunque retención = 0. */
  hasSubjectBaseWithZeroWithholding: boolean;
  requiresReview: boolean;
  paysProfessionalsSubjectToWithholding?: CensusTriState | string;
}): Model111FilingObligation {
  const census = String(opts.censusModel111 ?? "UNKNOWN").toUpperCase() as
    | "YES"
    | "NO"
    | "UNKNOWN";
  const reasons: string[] = [];
  const reasonCodes: string[] = [];

  const operationsSignal = opts.hasRelevantPayments
    ? ("HAS_OPS" as const)
    : ("ZERO_OPS" as const);

  let outcomeHint: Model111Outcome | null = null;
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

  if (census === "NO") {
    reasonCodes.push("CENSUS_111_NO");
    if (operationsSignal === "HAS_OPS") {
      reasons.push(
        "Hay retenciones practicadas a profesionales pero el censo 111 = NO."
      );
      reasonCodes.push("CENSUS_MODEL111_MISMATCH");
      return {
        status: "UNKNOWN",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
        outcomeHint: outcomeHint ?? "REQUIRES_REVIEW",
      };
    }
    reasons.push("Perfil censal: Modelo 111 = NO.");
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
    reasonCodes.push("CENSUS_111_YES");
    if (operationsSignal === "HAS_OPS") {
      reasons.push(
        "Censo 111 = YES y hay rentas sometidas a retención satisfechas en el período."
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
    // ZERO_OPS: NO presentar vacío automáticamente
    reasons.push(
      "Censo 111 = YES pero no hay rentas relevantes satisfechas este período (NO_RELEVANT_PAYMENTS). Revisa baja/continuidad censal; no se exige 111 a cero automáticamente."
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

  // census UNKNOWN
  reasonCodes.push("CENSUS_111_UNKNOWN");
  if (operationsSignal === "HAS_OPS") {
    reasons.push(
      "Hay retenciones practicadas; censo 111 UNKNOWN — presenta y confirma el 036."
    );
    reasonCodes.push("MODEL111_OBLIGATION_REVIEW_REQUIRED", "HAS_OPS");
    return {
      status: "REQUIRED",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: "UNKNOWN",
      outcomeHint: outcomeHint ?? "REQUIRES_REVIEW",
    };
  }

  const pays = String(
    opts.paysProfessionalsSubjectToWithholding ?? "UNKNOWN"
  ).toUpperCase();
  if (pays === "YES") {
    reasons.push(
      "Declaras pagos a profesionales con retención pero sin operaciones este período y censo UNKNOWN."
    );
    reasonCodes.push("NO_RELEVANT_PAYMENTS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: "UNKNOWN",
      outcomeHint: "NO_RELEVANT_PAYMENTS",
    };
  }

  reasons.push(
    "Sin rentas relevantes en el período y censo 111 UNKNOWN. No se infiere NOT_APPLICABLE."
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
