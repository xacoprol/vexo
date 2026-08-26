import type { Model390FilingObligation } from "@/lib/modelo-390/types";
import {
  isQuarterlyExemptActivity,
  normalizeLegacyVatConfig,
  type Model390CompanyVatConfig,
  type NormalizedVatConfig,
} from "@/lib/modelo-390/vat-config";

export type { Model390CompanyVatConfig };

function exemptResult(
  reasons: string[],
  requiresLastPeriodAnnualInfo = true
): Model390FilingObligation {
  return {
    status: "EXEMPT",
    reasons,
    warnings: [],
    requiresLastPeriodAnnualInfo,
  };
}

function requiredResult(reasons: string[]): Model390FilingObligation {
  return {
    status: "REQUIRED",
    reasons,
    warnings: [],
    requiresLastPeriodAnnualInfo: false,
  };
}

function unknownResult(reasons: string[]): Model390FilingObligation {
  return {
    status: "UNKNOWN",
    reasons,
    warnings: [],
    requiresLastPeriodAnnualInfo: false,
  };
}

function trySiiExemption(
  config: NormalizedVatConfig
): Model390FilingObligation | "blocked" | null {
  if (config.vatUsesSii !== "YES") return null;

  const last = config.lastVatPeriodFilingRequired;
  if (last === "YES") {
    return exemptResult([
      "Exonerado de presentar Modelo 390: llevas los libros de IVA mediante SII.",
    ]);
  }
  if (last === "NO") return "blocked";
  return unknownResult([
    "Llevas los libros mediante SII, pero falta confirmar si debes presentar la autoliquidación del último período del ejercicio.",
  ]);
}

function tryQuarterlyExemption(
  config: NormalizedVatConfig
): Model390FilingObligation | "blocked" | "not_applicable" | null {
  if (config.vatPeriodicity !== "QUARTERLY") return "not_applicable";
  if (config.vatTerritory !== "COMMON_ONLY") return "not_applicable";
  if (!isQuarterlyExemptActivity(config.vatActivity390Scope)) {
    return "not_applicable";
  }

  const last = config.lastVatPeriodFilingRequired;
  if (last === "YES") {
    const activityLabel = activityScopeLabel(config.vatActivity390Scope);
    return exemptResult([
      `Exonerado de presentar Modelo 390: liquidación trimestral, territorio común y actividad ${activityLabel}.`,
    ]);
  }
  if (last === "NO") return "blocked";
  return unknownResult([
    "Perfil trimestral exonerado del 390, pero falta confirmar si debes presentar la autoliquidación del último período del ejercicio.",
  ]);
}

function activityScopeLabel(scope: NormalizedVatConfig["vatActivity390Scope"]): string {
  switch (scope) {
    case "SIMPLIFIED":
      return "en régimen simplificado de IVA";
    case "URBAN_RENTAL":
      return "de arrendamiento de inmuebles urbanos";
    case "SIMPLIFIED_AND_URBAN_RENTAL":
      return "en régimen simplificado y arrendamiento urbano";
    default:
      return "exonerada";
  }
}

function canInferRequired(config: NormalizedVatConfig): boolean {
  if (config.vatUsesSii !== "NO") return false;
  if (config.vatPeriodicity === "UNKNOWN") return false;

  if (config.vatPeriodicity === "MONTHLY") return true;

  if (config.vatTerritory === "UNKNOWN" || config.vatActivity390Scope === "UNKNOWN") {
    return false;
  }

  return (
    config.vatTerritory === "OTHER" || config.vatActivity390Scope === "GENERAL"
  );
}

function blockedExemptionUnknown(
  config: NormalizedVatConfig,
  blockedPaths: string[]
): Model390FilingObligation {
  const parts = [
    "No aplica exoneración del Modelo 390: baja censal antes del último período (sin obligación de presentar esa autoliquidación).",
  ];
  if (blockedPaths.length > 0) {
    parts.push(`Supuestos descartados: ${blockedPaths.join("; ")}.`);
  }
  if (config.vatUsesSii === "YES") {
    parts.push("Revisar si procede otra obligación anual del IVA.");
  }
  return unknownResult(parts);
}

function hasBlockingUnknowns(config: NormalizedVatConfig): string[] {
  const missing: string[] = [];
  if (config.vatUsesSii === "UNKNOWN") {
    missing.push("si llevas los libros de IVA mediante SII");
  }
  if (config.vatPeriodicity === "UNKNOWN") {
    missing.push("la periodicidad habitual del IVA");
  }
  if (config.vatPeriodicity === "QUARTERLY") {
    if (config.vatTerritory === "UNKNOWN") {
      missing.push("si tributas exclusivamente en territorio común");
    }
    if (config.vatActivity390Scope === "UNKNOWN") {
      missing.push("el tipo de actividad IVA relevante para el 390");
    }
  }
  return missing;
}

function assessFromFacts(config: NormalizedVatConfig): Model390FilingObligation {
  const blockedPaths: string[] = [];

  const sii = trySiiExemption(config);
  if (sii && sii !== "blocked") return sii;
  if (sii === "blocked") {
    blockedPaths.push("exoneración por SII");
  }

  const quarterly = tryQuarterlyExemption(config);
  if (quarterly && quarterly !== "blocked" && quarterly !== "not_applicable") {
    return quarterly;
  }
  if (quarterly === "blocked") {
    blockedPaths.push("exoneración trimestral (régimen simplificado / alquiler urbano)");
  }

  if (blockedPaths.length > 0) {
    return blockedExemptionUnknown(config, blockedPaths);
  }

  if (canInferRequired(config)) {
    if (config.vatPeriodicity === "MONTHLY") {
      return requiredResult([
        "Obligado a presentar Modelo 390: periodicidad mensual y sin supuesto de exoneración aplicable.",
      ]);
    }
    return requiredResult([
      "Obligado a presentar Modelo 390: liquidación trimestral sin perfil de exoneración (actividad general u otro territorio).",
    ]);
  }

  const missing = hasBlockingUnknowns(config);
  if (missing.length > 0) {
    return unknownResult([
      `Faltan datos fiscales para determinar la obligación del Modelo 390: ${missing.join(", ")}.`,
    ]);
  }

  return unknownResult([
    "No se puede determinar la obligación del Modelo 390 con los hechos fiscales configurados.",
  ]);
}

/**
 * Determina si el contribuyente debe presentar Modelo 390 a partir de hechos fiscales.
 * Nunca usa un selector manual REQUIRED/EXEMPT como fuente principal.
 */
export function assess390FilingObligation(
  config: Model390CompanyVatConfig | null | undefined
): Model390FilingObligation {
  if (!config) {
    return unknownResult([
      "Sin configuración fiscal de empresa — no se puede determinar la obligación del 390.",
    ]);
  }

  const normalized = normalizeLegacyVatConfig(config);
  return assessFromFacts(normalized);
}

/** Expuesto para tests — evalúa hechos ya normalizados. */
export function assess390FilingObligationFromFacts(
  config: NormalizedVatConfig
): Model390FilingObligation {
  return assessFromFacts(config);
}
