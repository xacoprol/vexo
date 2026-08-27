import type {
  CensusSource,
  CensusTriState,
  FiscalCensusProfile,
} from "@/lib/fiscal-obligations/types";

export function parseCensusTriState(raw: unknown): CensusTriState {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "YES" || v === "SI" || v === "SÍ" || v === "1") return "YES";
  if (v === "NO" || v === "0") return "NO";
  return "UNKNOWN";
}

export function parseCensusSource(raw: unknown): CensusSource {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "MANUAL") return "MANUAL";
  if (v === "OCR_036" || v === "OCR") return "OCR_036";
  return "UNKNOWN";
}

/** Campos de CompanySettings relevantes al perfil censal. */
export type CensusSettingsRow = {
  fiscalRegime?: string | null;
  irpfDirectEstimationMode?: string | null;
  activityKind130?: string | null;
  priorYearWithholdingPct130?: number | null;
  activityStartYear?: number | null;
  vatPeriodicity?: string | null;
  vatUsesSii?: string | null;
  vatTerritory?: string | null;
  vatActivity390Scope?: string | null;
  lastVatPeriodFilingRequired?: string | null;
  paysProfessionalsSubjectToWithholding?: string | null;
  hasEmployees?: string | null;
  rentsBusinessPremises?: string | null;
  businessRentSubjectToWithholding?: string | null;
  censusModel130?: string | null;
  censusModel303?: string | null;
  censusModel111?: string | null;
  model111Periodicity?: string | null;
  model115Periodicity?: string | null;
  censusModel115?: string | null;
  censusModel180?: string | null;
  censusModel190?: string | null;
  censusModel349?: string | null;
  censusModel347?: string | null;
  censusModel390?: string | null;
  censusSource?: string | null;
  censusLastUpdatedAt?: Date | null;
};

export function buildFiscalCensusProfileFromSettings(
  settings: CensusSettingsRow | null | undefined
): FiscalCensusProfile {
  const s = settings ?? {};
  return {
    obligations: {
      model130: parseCensusTriState(s.censusModel130),
      model303: parseCensusTriState(s.censusModel303),
      model111: parseCensusTriState(s.censusModel111),
      model115: parseCensusTriState(s.censusModel115),
      model180: parseCensusTriState(s.censusModel180),
      model190: parseCensusTriState(s.censusModel190),
      model349: parseCensusTriState(s.censusModel349),
      model347: parseCensusTriState(s.censusModel347),
      model390: parseCensusTriState(s.censusModel390),
    },
    facts: {
      fiscalRegime: s.fiscalRegime === "131" ? "131" : "130",
      irpfDirectEstimationMode: s.irpfDirectEstimationMode ?? "NORMAL",
      activityKind130: s.activityKind130 ?? "UNKNOWN",
      priorYearWithholdingPct130:
        s.priorYearWithholdingPct130 != null &&
        Number.isFinite(s.priorYearWithholdingPct130)
          ? Number(s.priorYearWithholdingPct130)
          : null,
      activityStartYear:
        s.activityStartYear != null && Number.isFinite(s.activityStartYear)
          ? Math.floor(Number(s.activityStartYear))
          : null,
      vatPeriodicity: s.vatPeriodicity ?? "UNKNOWN",
      vatUsesSii: s.vatUsesSii ?? "UNKNOWN",
      vatTerritory: s.vatTerritory ?? "UNKNOWN",
      vatActivity390Scope: s.vatActivity390Scope ?? "UNKNOWN",
      lastVatPeriodFilingRequired: s.lastVatPeriodFilingRequired ?? "UNKNOWN",
      paysProfessionalsSubjectToWithholding: parseCensusTriState(
        s.paysProfessionalsSubjectToWithholding
      ),
      hasEmployees: parseCensusTriState(s.hasEmployees),
      rentsBusinessPremises: parseCensusTriState(s.rentsBusinessPremises),
      businessRentSubjectToWithholding: parseCensusTriState(
        s.businessRentSubjectToWithholding
      ),
    },
    censusSource: parseCensusSource(s.censusSource),
    censusLastUpdatedAt: s.censusLastUpdatedAt ?? null,
  };
}

export const CENSUS_SETTINGS_SELECT = {
  fiscalRegime: true,
  irpfDirectEstimationMode: true,
  activityKind130: true,
  priorYearWithholdingPct130: true,
  activityStartYear: true,
  vatPeriodicity: true,
  vatUsesSii: true,
  vatTerritory: true,
  vatActivity390Scope: true,
  lastVatPeriodFilingRequired: true,
  paysProfessionalsSubjectToWithholding: true,
  hasEmployees: true,
  rentsBusinessPremises: true,
  businessRentSubjectToWithholding: true,
  censusModel130: true,
  censusModel303: true,
  censusModel111: true,
  model111Periodicity: true,
  model115Periodicity: true,
  censusModel115: true,
  censusModel180: true,
  censusModel190: true,
  censusModel349: true,
  censusModel347: true,
  censusModel390: true,
  censusSource: true,
  censusLastUpdatedAt: true,
} as const;
