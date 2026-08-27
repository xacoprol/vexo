/**
 * Tipos del mapa maestro de obligaciones fiscales (Fase 9.2).
 *
 * Separación obligatoria:
 * - censusSignal: qué consta en el perfil / 036
 * - operationsSignal: si hay operaciones en el período
 * - obligationStatus: conclusión legal del resolver (o UNKNOWN)
 * - filingStatus: presentación / calendario
 */

import type { FiscalQuarter } from "@/lib/fiscal";

export type CensusTriState = "YES" | "NO" | "UNKNOWN";

export type CensusSource = "MANUAL" | "OCR_036" | "UNKNOWN";

export type ObligationModelCode =
  | "130"
  | "303"
  | "111"
  | "115"
  | "180"
  | "190"
  | "349"
  | "347"
  | "390";

export type ObligationDomain = "AEAT" | "TGSS";

export type ObligationStatus =
  | "REQUIRED"
  | "NOT_REQUIRED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

/** Fuente de la conclusión de obligación. */
export type ObligationStatusSource =
  | "RESOLVER"
  | "CENSUS"
  | "OPERATIONS"
  | "INSUFFICIENT_DATA"
  | "COMBINED";

export type OperationsSignal = "HAS_OPS" | "ZERO_OPS" | "UNKNOWN";

export type FilingStatus =
  | "FILED"
  | "DUE"
  | "UPCOMING"
  | "OVERDUE"
  | "REQUIRES_REVIEW"
  | "NOT_APPLICABLE";

export type ProfileCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";

export type FiscalObligationPeriod = {
  year: number;
  quarter?: FiscalQuarter | null;
  month?: number | null;
  label: string;
};

export type FiscalObligationEntry = {
  model: ObligationModelCode;
  domain: ObligationDomain;
  period: FiscalObligationPeriod;
  obligationStatus: ObligationStatus;
  reason: string;
  reasonCodes: string[];
  statusSource: ObligationStatusSource;
  censusSignal: CensusTriState;
  operationsSignal: OperationsSignal;
  filingStatus: FilingStatus;
  dueDate: Date | null;
  /** Si dueDate es fiable para OVERDUE (calendario conocido). */
  dueDateReliable: boolean;
  filingId: string | null;
  warnings: string[];
};

export type FiscalCensusProfile = {
  obligations: {
    model130: CensusTriState;
    model303: CensusTriState;
    model111: CensusTriState;
    model115: CensusTriState;
    model180: CensusTriState;
    model190: CensusTriState;
    model349: CensusTriState;
    model347: CensusTriState;
    model390: CensusTriState;
  };
  facts: {
    fiscalRegime: "130" | "131";
    irpfDirectEstimationMode: string;
    activityKind130: string;
    priorYearWithholdingPct130: number | null;
    activityStartYear: number | null;
    vatPeriodicity: string;
    vatUsesSii: string;
    vatTerritory: string;
    vatActivity390Scope: string;
    lastVatPeriodFilingRequired: string;
    paysProfessionalsSubjectToWithholding: CensusTriState;
    hasEmployees: CensusTriState;
    rentsBusinessPremises: CensusTriState;
    businessRentSubjectToWithholding: CensusTriState;
  };
  censusSource: CensusSource;
  censusLastUpdatedAt: Date | null;
};

export type CensusMismatch = {
  code: string;
  model: ObligationModelCode | "HEALTH";
  severity: "WARNING" | "INFO";
  title: string;
  description: string;
};

export type FiscalObligationsResult = {
  obligations: FiscalObligationEntry[];
  profile: FiscalCensusProfile;
  profileCompleteness: ProfileCompleteness;
  mismatches: CensusMismatch[];
  warnings: string[];
  generatedAt: Date;
  year: number;
  quarter: FiscalQuarter | null;
  mode: "quarter" | "annual";
};
