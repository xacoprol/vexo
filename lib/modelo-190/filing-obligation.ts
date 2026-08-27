import type { CensusTriState } from "@/lib/fiscal-obligations/types";
import type { Model190FilingObligation } from "@/lib/modelo-190/types";

/**
 * Obligación anual 190 — no basta «hay 111 → REQUIRED».
 */
export function assess190FilingObligation(opts: {
  censusModel190: CensusTriState | string;
  hasRelevantPerceptions: boolean;
  totalWithholdingAmount: number;
  requiresReview: boolean;
  hasEmployees?: CensusTriState | string;
  censusModel111?: CensusTriState | string;
}): Model190FilingObligation {
  const census = String(opts.censusModel190 ?? "UNKNOWN").toUpperCase() as
    | "YES"
    | "NO"
    | "UNKNOWN";
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  const operationsSignal = opts.hasRelevantPerceptions
    ? ("HAS_OPS" as const)
    : ("ZERO_OPS" as const);

  const employees = String(opts.hasEmployees ?? "UNKNOWN").toUpperCase();
  if (employees === "YES") {
    reasons.push(
      "hasEmployees=YES: el 190 parcial (solo profesionales) no es definitivo."
    );
    reasonCodes.push("MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED");
  }

  if (census === "NO") {
    reasonCodes.push("CENSUS_190_NO");
    if (operationsSignal === "HAS_OPS") {
      reasons.push(
        "Hay retenciones profesionales anuales pero censusModel190 = NO."
      );
      reasonCodes.push("CENSUS_MODEL190_MISMATCH");
      return {
        status: "UNKNOWN",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
      };
    }
    reasons.push("Perfil censal: Modelo 190 = NO.");
    return {
      status: "NOT_APPLICABLE",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: census,
    };
  }

  if (census === "YES") {
    reasonCodes.push("CENSUS_190_YES");
    if (operationsSignal === "HAS_OPS") {
      if (employees === "YES" || opts.requiresReview) {
        reasons.push(
          "Censo 190 = YES con operaciones, pero requiere revisión (empleados u otros)."
        );
        reasonCodes.push("MODEL190_OBLIGATION_REVIEW_REQUIRED");
        return {
          status: "UNKNOWN",
          reasons,
          reasonCodes,
          operationsSignal,
          censusSignal: census,
        };
      }
      reasons.push("Censo 190 = YES y hay percepciones profesionales en el año.");
      return {
        status: "REQUIRED",
        reasons,
        reasonCodes,
        operationsSignal,
        censusSignal: census,
      };
    }
    reasons.push(
      "Censo 190 = YES sin percepciones profesionales relevantes este año. Revisa continuidad; no NOT_REQUIRED automático."
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

  // UNKNOWN
  reasonCodes.push("CENSUS_190_UNKNOWN");
  if (operationsSignal === "HAS_OPS") {
    reasons.push(
      "Hay retenciones profesionales anuales; censo 190 UNKNOWN — revisión censal."
    );
    reasonCodes.push("MODEL190_OBLIGATION_REVIEW_REQUIRED", "HAS_OPS");
    return {
      status: "UNKNOWN",
      reasons,
      reasonCodes,
      operationsSignal,
      censusSignal: "UNKNOWN",
    };
  }

  reasons.push(
    "Sin percepciones profesionales relevantes y censo 190 UNKNOWN."
  );
  reasonCodes.push("NO_RELEVANT_PAYMENTS", "ZERO_OPS");
  return {
    status: "UNKNOWN",
    reasons,
    reasonCodes,
    operationsSignal,
    censusSignal: "UNKNOWN",
  };
}
