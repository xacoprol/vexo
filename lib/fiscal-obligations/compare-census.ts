import type {
  CensusMismatch,
  FiscalCensusProfile,
} from "@/lib/fiscal-obligations/types";

export type OperationalCensusSignals = {
  /** Hay al menos un FiscalWithholding PRACTICED PROFESSIONAL ACTIVE en el año. */
  hasPracticedProfessionalWithholding: boolean;
  /** Hay al menos un FiscalWithholding PRACTICED RENT ACTIVE en el año. */
  hasPracticedRentWithholding?: boolean;
  /** Hay al menos un BusinessPremisesLease activo. */
  hasActiveBusinessPremisesLease?: boolean;
};

/**
 * Compara perfil censal vs señales operativas.
 * NUNCA auto-corrige el censo.
 */
export function compareCensusVsOperationalSignals(
  profile: FiscalCensusProfile,
  ops: OperationalCensusSignals
): CensusMismatch[] {
  const out: CensusMismatch[] = [];
  const census111 = profile.obligations.model111;
  const census115 = profile.obligations.model115;
  const paysPros = profile.facts.paysProfessionalsSubjectToWithholding;
  const rentsPremises = profile.facts.rentsBusinessPremises;

  if (ops.hasPracticedProfessionalWithholding && census111 === "NO") {
    out.push({
      code: "CENSUS_MODEL111_MISMATCH",
      model: "111",
      severity: "WARNING",
      title: "Mismatch censal Modelo 111",
      description:
        "Hay retenciones practicadas a profesionales, pero el perfil censal declara Modelo 111 = NO. Revisa el 036; VEXO no cambia el censo automáticamente.",
    });
  }

  if (ops.hasPracticedProfessionalWithholding && census111 === "UNKNOWN") {
    out.push({
      code: "MODEL111_OBLIGATION_REVIEW_REQUIRED",
      model: "111",
      severity: "WARNING",
      title: "Revisar obligación Modelo 111",
      description:
        "Existen retenciones practicadas y la obligación censal 111 está en UNKNOWN. Confirma en Ajustes si debes presentar el 111.",
    });
  }

  if (paysPros === "YES" && census111 === "NO") {
    out.push({
      code: "CENSUS_MODEL111_MISMATCH",
      model: "111",
      severity: "WARNING",
      title: "Hecho operativo vs censo 111",
      description:
        "Declaras que pagas profesionales con retención, pero el Modelo 111 no consta en el perfil censal.",
    });
  }

  if (paysPros === "YES" && census111 === "UNKNOWN") {
    // Evitar duplicar si ya hay withholding review
    if (!out.some((m) => m.code === "MODEL111_OBLIGATION_REVIEW_REQUIRED")) {
      out.push({
        code: "MODEL111_OBLIGATION_REVIEW_REQUIRED",
        model: "111",
        severity: "INFO",
        title: "Confirmar censo Modelo 111",
        description:
          "Indicas pagos a profesionales con retención; completa si el 111 consta en tu 036.",
      });
    }
  }

  if (ops.hasActiveBusinessPremisesLease && rentsPremises === "NO") {
    out.push({
      code: "CENSUS_RENT_ACTIVITY_MISMATCH",
      model: "115",
      severity: "WARNING",
      title: "Mismatch: alquiler de local vs censo",
      description:
        "Hay locales arrendados activos pero rentsBusinessPremises = NO. VEXO no cambia el censo automáticamente.",
    });
  }

  if (ops.hasPracticedRentWithholding && census115 === "NO") {
    out.push({
      code: "CENSUS_MODEL115_MISMATCH",
      model: "115",
      severity: "WARNING",
      title: "Mismatch censal Modelo 115",
      description:
        "Hay retenciones practicadas de alquiler, pero el perfil censal declara Modelo 115 = NO.",
    });
  }

  if (ops.hasPracticedRentWithholding && census115 === "UNKNOWN") {
    out.push({
      code: "MODEL115_OBLIGATION_REVIEW_REQUIRED",
      model: "115",
      severity: "WARNING",
      title: "Revisar obligación Modelo 115",
      description:
        "Existen retenciones de alquiler y la obligación censal 115 está en UNKNOWN. El motor 115 aún no afirma REQUIRED.",
    });
  }

  return out;
}

/**
 * Resolver legal vs censo para un modelo concreto (p. ej. 130).
 */
export function compareResolverVsCensus(opts: {
  model: "130" | "303" | "390" | "349" | "347";
  resolverStatus: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN" | "EXEMPT" | "NOT_APPLICABLE";
  censusSignal: "YES" | "NO" | "UNKNOWN";
}): CensusMismatch | null {
  const { model, resolverStatus, censusSignal } = opts;

  if (
    (resolverStatus === "NOT_REQUIRED" || resolverStatus === "EXEMPT" || resolverStatus === "NOT_APPLICABLE") &&
    censusSignal === "YES"
  ) {
    return {
      code: `CENSUS_MODEL${model}_REVIEW_REQUIRED`,
      model,
      severity: "WARNING",
      title: `Revisar censo Modelo ${model}`,
      description: `El resolver indica ${resolverStatus} pero el perfil censal declara ${model} = YES. No se auto-corrige.`,
    };
  }

  if (resolverStatus === "REQUIRED" && censusSignal === "NO") {
    return {
      code: "CENSUS_OBLIGATION_MISMATCH",
      model,
      severity: "WARNING",
      title: `Mismatch censal Modelo ${model}`,
      description: `El resolver indica REQUIRED pero el perfil censal declara ${model} = NO.`,
    };
  }

  return null;
}
