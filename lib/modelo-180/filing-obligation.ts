import type { CensusTriState } from "@/lib/fiscal-obligations/types";
import type { Model180FilingObligation } from "@/lib/modelo-180/types";

export function assess180FilingObligation(opts: {
  censusModel180: CensusTriState | string;
  hasRelevantRentPayments: boolean;
  totalWithholdingAmount: number;
  requiresReview: boolean;
  hasActiveLeaseWithoutRent?: boolean;
  censusModel115?: CensusTriState | string;
}): Model180FilingObligation {
  const census = String(opts.censusModel180 ?? "UNKNOWN").toUpperCase() as
    | "YES"
    | "NO"
    | "UNKNOWN";
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  const operationsSignal = opts.hasRelevantRentPayments
    ? ("HAS_OPS" as const)
    : ("ZERO_OPS" as const);

  if (opts.hasActiveLeaseWithoutRent && !opts.hasRelevantRentPayments) {
    reasons.push(
      "Hay lease activo sin rentas RENT sujetas en el año — no implica obligación 180."
    );
    reasonCodes.push("LEASE_WITHOUT_RENT_OPS");
  }

  if (census === "NO") {
    reasonCodes.push("CENSUS_180_NO");
    if (operationsSignal === "HAS_OPS") {
      reasons.push(
        "Hay retenciones RENT anuales pero censusModel180 = NO."
      );
      reasonCodes.push("CENSUS_MODEL180_MISMATCH");
      return {
        status: "UNKNOWN",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
      };
    }
    reasons.push("Perfil censal: Modelo 180 = NO.");
    return {
      status: "NOT_APPLICABLE",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: census,
    };
  }

  if (census === "YES") {
    reasonCodes.push("CENSUS_180_YES");
    if (operationsSignal === "HAS_OPS") {
      if (opts.requiresReview) {
        reasons.push("Censo 180 = YES con operaciones, pero requiere revisión.");
        reasonCodes.push("MODEL180_OBLIGATION_REVIEW_REQUIRED");
        return {
          status: "UNKNOWN",
          reasons,
          reasonCodes,
          operationsSignal,
          censusSignal: census,
        };
      }
      reasons.push("Censo 180 = YES y hay rentas RENT satisfechas en el año.");
      return {
        status: "REQUIRED",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
      };
    }
    reasons.push(
      "Censo 180 = YES sin rentas relevantes este año. No NOT_REQUIRED automático."
    );
    reasonCodes.push("ZERO_OPS_NOT_EXEMPT", "NO_RELEVANT_PAYMENTS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: census,
    };
  }

  reasonCodes.push("CENSUS_180_UNKNOWN");
  if (operationsSignal === "HAS_OPS") {
    reasons.push(
      "Hay retenciones RENT anuales; censo 180 UNKNOWN — revisión censal."
    );
    reasonCodes.push("MODEL180_OBLIGATION_REVIEW_REQUIRED", "HAS_OPS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: "UNKNOWN",
    };
  }

  reasons.push("Sin rentas RENT relevantes y censo 180 UNKNOWN.");
  reasonCodes.push("NO_RELEVANT_PAYMENTS", "ZERO_OPS");
  return {
    status: "UNKNOWN",
    reasons,
    reasonCodes,
    operationsSignal,
    censusSignal: "UNKNOWN",
  };
}
