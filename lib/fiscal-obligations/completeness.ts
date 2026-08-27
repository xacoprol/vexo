import type {
  FiscalCensusProfile,
  ProfileCompleteness,
} from "@/lib/fiscal-obligations/types";

/**
 * Completitud del perfil según datos necesarios para modelos relevantes.
 * No exige configurar TODOS los modelos (115/180/190 pueden quedar UNKNOWN).
 */
export function assessCensusProfileCompleteness(
  profile: FiscalCensusProfile
): ProfileCompleteness {
  const missingCore: string[] = [];

  if (profile.facts.fiscalRegime === "130") {
    if (profile.facts.activityKind130 === "UNKNOWN") {
      missingCore.push("activityKind130");
    }
    if (profile.facts.priorYearWithholdingPct130 == null) {
      missingCore.push("priorYearWithholdingPct130");
    }
  }

  if (profile.facts.vatPeriodicity === "UNKNOWN") {
    missingCore.push("vatPeriodicity");
  }

  // Núcleo IVA/IRPF: 130 y 303 deberían tener censo conocido o al menos UNKNOWN consciente
  const coreCensusUnknown =
    profile.obligations.model130 === "UNKNOWN" &&
    profile.obligations.model303 === "UNKNOWN";

  if (missingCore.length >= 3 && coreCensusUnknown) {
    return "INSUFFICIENT";
  }

  if (
    missingCore.length > 0 ||
    profile.obligations.model130 === "UNKNOWN" ||
    profile.obligations.model303 === "UNKNOWN" ||
    profile.facts.paysProfessionalsSubjectToWithholding === "UNKNOWN"
  ) {
    return "PARTIAL";
  }

  return "COMPLETE";
}
