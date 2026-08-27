/**
 * Hash censal estable para pre-filing (Fase 14).
 * Solo campos fiscalmente relevantes; orden determinista.
 */

import { createHash } from "node:crypto";

/** Campos que afectan obligación / liquidación del periodo. */
export const CENSUS_HASH_FIELDS = [
  "fiscalRegime",
  "irpfDirectEstimationMode",
  "activityKind130",
  "priorYearWithholdingPct130",
  "activityStartYear",
  "previousYearNetIncome130Mode",
  "previousYearNetIncomeFor130Reduction",
  "vatPeriodicity",
  "vatUsesSii",
  "vatTerritory",
  "vatActivity390Scope",
  "lastVatPeriodFilingRequired",
  "paysProfessionalsSubjectToWithholding",
  "hasEmployees",
  "rentsBusinessPremises",
  "businessRentSubjectToWithholding",
  "censusModel130",
  "censusModel303",
  "censusModel111",
  "censusModel115",
  "censusModel180",
  "censusModel190",
  "censusModel349",
  "censusModel347",
  "censusModel390",
  "model111Periodicity",
  "model115Periodicity",
] as const;

export type CensusHashField = (typeof CENSUS_HASH_FIELDS)[number];

/** Campos UI / branding que NO deben invalidar revisión. */
export const CENSUS_HASH_IRRELEVANT_FIELDS = [
  "name",
  "companyName",
  "email",
  "phone",
  "logoUrl",
  "themePrimary",
  "themeAccent",
  "bankIban",
  "shopifyShop",
] as const;

function normalizeCensusValue(v: unknown): string {
  if (v == null) return "__NULL__";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  if (s === "") return "__EMPTY__";
  return s.toUpperCase();
}

/**
 * Extrae payload censal ordenado. null ≠ UNKNOWN.
 */
export function censusPayloadForHash(
  settings: Record<string, unknown> | null | undefined
): Record<string, string> {
  const s = settings ?? {};
  const out: Record<string, string> = {};
  for (const key of [...CENSUS_HASH_FIELDS].sort()) {
    out[key] = normalizeCensusValue(s[key]);
  }
  return out;
}

export function computeCensusHash(
  settings: Record<string, unknown> | null | undefined
): string {
  const payload = censusPayloadForHash(settings);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
