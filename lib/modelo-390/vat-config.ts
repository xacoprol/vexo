/** Tri-state fiscal facts stored in CompanySettings. */
export type TriState = "YES" | "NO" | "UNKNOWN";

export type VatPeriodicity = "QUARTERLY" | "MONTHLY" | "UNKNOWN";

/** Territorio de tributación IVA relevante para exoneración trimestral del 390. */
export type VatTerritory = "COMMON_ONLY" | "OTHER" | "UNKNOWN";

/**
 * Alcance de actividad IVA para la exoneración trimestral del Modelo 390.
 * No se infiere por nombre comercial ni CNAE — solo configuración explícita.
 */
export type VatActivity390Scope =
  | "GENERAL"
  | "SIMPLIFIED"
  | "URBAN_RENTAL"
  | "SIMPLIFIED_AND_URBAN_RENTAL"
  | "UNKNOWN";

export type Model390CompanyVatConfig = {
  vatUsesSii: string;
  vatPeriodicity: string;
  vatTerritory: string;
  vatActivity390Scope: string;
  lastVatPeriodFilingRequired: string;
  /** @deprecated Legacy — no usar como fuente de verdad; solo migración conservadora. */
  vat390FilingObligation?: string;
  /** @deprecated Legacy — REDEME/grupo no son motivos de exoneración del 390. */
  vat390ExemptionReason?: string | null;
};

export type NormalizedVatConfig = {
  vatUsesSii: TriState;
  vatPeriodicity: VatPeriodicity;
  vatTerritory: VatTerritory;
  vatActivity390Scope: VatActivity390Scope;
  lastVatPeriodFilingRequired: TriState;
};

const QUARTERLY_EXEMPT_ACTIVITIES: readonly VatActivity390Scope[] = [
  "SIMPLIFIED",
  "URBAN_RENTAL",
  "SIMPLIFIED_AND_URBAN_RENTAL",
];

export function isQuarterlyExemptActivity(
  scope: VatActivity390Scope
): boolean {
  return QUARTERLY_EXEMPT_ACTIVITIES.includes(scope);
}

export function parseTriState(raw: string | null | undefined): TriState | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === "YES" || v === "SI" || v === "SÍ") return "YES";
  if (v === "NO") return "NO";
  if (v === "UNKNOWN" || v === "") return "UNKNOWN";
  return null;
}

export function parseVatPeriodicity(
  raw: string | null | undefined
): VatPeriodicity | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === "QUARTERLY" || v === "TRIMESTRAL") return "QUARTERLY";
  if (v === "MONTHLY" || v === "MENSUAL") return "MONTHLY";
  if (v === "UNKNOWN" || v === "") return "UNKNOWN";
  return null;
}

export function parseVatTerritory(
  raw: string | null | undefined
): VatTerritory | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === "COMMON_ONLY" || v === "COMUN") return "COMMON_ONLY";
  if (v === "OTHER" || v === "OTRO") return "OTHER";
  if (v === "UNKNOWN" || v === "") return "UNKNOWN";
  return null;
}

export function parseVatActivity390Scope(
  raw: string | null | undefined
): VatActivity390Scope | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === "GENERAL") return "GENERAL";
  if (v === "SIMPLIFIED" || v === "SIMPLIFICADO") return "SIMPLIFIED";
  if (v === "URBAN_RENTAL" || v === "ALQUILER") return "URBAN_RENTAL";
  if (
    v === "SIMPLIFIED_AND_URBAN_RENTAL" ||
    v === "SIMPLIFICADO_Y_ALQUILER"
  ) {
    return "SIMPLIFIED_AND_URBAN_RENTAL";
  }
  if (v === "UNKNOWN" || v === "") return "UNKNOWN";
  return null;
}

/**
 * Aplica migración conservadora desde campos legacy.
 * Solo convierte vat390ExemptionReason=SII → vatUsesSii=YES cuando aún es UNKNOWN.
 * Nunca infiere hechos desde EXEMPT/REQUIRED manual ni desde REDEME/grupo.
 */
export function normalizeLegacyVatConfig(
  raw: Model390CompanyVatConfig
): NormalizedVatConfig {
  let vatUsesSii = parseTriState(raw.vatUsesSii) ?? "UNKNOWN";

  const legacyReason = (raw.vat390ExemptionReason ?? "").trim().toUpperCase();
  if (vatUsesSii === "UNKNOWN" && legacyReason === "SII") {
    vatUsesSii = "YES";
  }

  return {
    vatUsesSii,
    vatPeriodicity: parseVatPeriodicity(raw.vatPeriodicity) ?? "UNKNOWN",
    vatTerritory: parseVatTerritory(raw.vatTerritory) ?? "UNKNOWN",
    vatActivity390Scope:
      parseVatActivity390Scope(raw.vatActivity390Scope) ?? "UNKNOWN",
    lastVatPeriodFilingRequired:
      parseTriState(raw.lastVatPeriodFilingRequired) ?? "UNKNOWN",
  };
}
