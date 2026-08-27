/**
 * Fixtures tipados para validación Fase 10.
 * No son datos de producción; alimentan motores existentes / readiness puro.
 */

import type { FiscalObligationEntry, FiscalObligationsResult } from "@/lib/fiscal-obligations/types";
import type { FiscalHealthIssue } from "@/lib/fiscal-health/types";
import type { ModelValidationEntry } from "@/lib/fiscal-validation/types";
import { WITHHOLDING_STATUS } from "@/lib/fiscal-withholding";
import type { Model111WithholdingRow } from "@/lib/modelo-111/types";
import type { Model115WithholdingRow, Model115LeaseRef } from "@/lib/modelo-115/types";

export type FixtureCensus = {
  nif: string;
  fiscalRegime: string;
  censusModel130?: string;
  censusModel303?: string;
  censusModel111?: string;
  censusModel115?: string;
  censusModel349?: string;
  censusModel190?: string;
  censusModel180?: string;
  hasEmployees?: string;
  paysProfessionalsSubjectToWithholding?: string;
  rentsBusinessPremises?: string;
  businessRentSubjectToWithholding?: string;
};

export const FIXTURE_CENSUS_BASIC: FixtureCensus = {
  nif: "12345678Z",
  fiscalRegime: "130",
  censusModel130: "YES",
  censusModel303: "YES",
  censusModel111: "NO",
  censusModel115: "NO",
  censusModel349: "NO",
  hasEmployees: "NO",
};

export const FIXTURE_CENSUS_UE: FixtureCensus = {
  ...FIXTURE_CENSUS_BASIC,
  censusModel349: "YES",
};

export const FIXTURE_CENSUS_WITHHOLDING: FixtureCensus = {
  ...FIXTURE_CENSUS_BASIC,
  censusModel111: "YES",
  paysProfessionalsSubjectToWithholding: "YES",
};

export const FIXTURE_CENSUS_RENT: FixtureCensus = {
  ...FIXTURE_CENSUS_BASIC,
  censusModel115: "YES",
  rentsBusinessPremises: "YES",
  businessRentSubjectToWithholding: "YES",
};

export function professionalWithholdingFixture(
  partial: Partial<Model111WithholdingRow> & {
    id: string;
    counterpartyId: string;
    baseAmount: number;
    withholdingAmount: number;
    paymentDate: Date;
  }
): Model111WithholdingRow {
  const taxId = partial.counterparty?.taxId ?? "B12345674";
  return {
    direction: "PRACTICED",
    kind: "PROFESSIONAL",
    status: WITHHOLDING_STATUS.ACTIVE,
    rectifiesId: null,
    sourceType: "EXPENSE",
    sourceId: `exp-${partial.id}`,
    rate: 15,
    accrualDate: partial.paymentDate,
    year: partial.paymentDate.getFullYear(),
    quarter: Math.ceil((partial.paymentDate.getMonth() + 1) / 3),
    counterparty: {
      id: partial.counterpartyId,
      name: "Profesional Fixture",
      taxId,
      normalizedTaxId: taxId,
      kind: "PROFESSIONAL",
      countryCode: "ES",
      requiresReview: false,
    },
    ...partial,
  };
}

export function rentWithholdingFixture(
  partial: Partial<Model115WithholdingRow> & {
    id: string;
    counterpartyId: string;
    leaseId: string;
    baseAmount: number;
    withholdingAmount: number;
    paymentDate: Date;
  }
): Model115WithholdingRow {
  const taxId = partial.counterparty?.taxId ?? "A12345674";
  return {
    direction: "PRACTICED",
    kind: "RENT",
    status: WITHHOLDING_STATUS.ACTIVE,
    rectifiesId: null,
    sourceType: "EXPENSE",
    sourceId: `exp-${partial.id}`,
    rate: 19,
    accrualDate: partial.paymentDate,
    year: partial.paymentDate.getFullYear(),
    quarter: Math.ceil((partial.paymentDate.getMonth() + 1) / 3),
    leaseId: partial.leaseId,
    counterparty: {
      id: partial.counterpartyId,
      name: "Arrendador Fixture",
      taxId,
      normalizedTaxId: taxId,
      kind: "LANDLORD",
      countryCode: "ES",
      requiresReview: false,
    },
    ...partial,
  };
}

export function leaseFixture(
  partial: Partial<Model115LeaseRef> & { id: string; counterpartyId: string }
): Model115LeaseRef {
  return {
    propertyAddress: "Local Fixture",
    withholdingStatus: "YES",
    withholdingExemptionReason: null,
    active: true,
    ...partial,
  };
}

export function makeObligation(opts: {
  model: FiscalObligationEntry["model"];
  quarter: 1 | 2 | 3 | 4;
  year?: number;
  obligationStatus: FiscalObligationEntry["obligationStatus"];
  operationsSignal?: FiscalObligationEntry["operationsSignal"];
  filingStatus?: FiscalObligationEntry["filingStatus"];
  filingId?: string | null;
}): FiscalObligationEntry {
  const year = opts.year ?? 2026;
  return {
    model: opts.model,
    domain: "AEAT",
    period: {
      year,
      quarter: opts.quarter,
      label: `${opts.quarter}T ${year}`,
    },
    obligationStatus: opts.obligationStatus,
    reason: `fixture ${opts.model}`,
    reasonCodes: [],
    statusSource: "RESOLVER",
    censusSignal: "YES",
    operationsSignal: opts.operationsSignal ?? "HAS_OPS",
    filingStatus: opts.filingStatus ?? "UPCOMING",
    dueDate: new Date(year, opts.quarter * 3, 20),
    dueDateReliable: true,
    filingId: opts.filingId ?? null,
    warnings: [],
  };
}

export function makeObligationsResult(
  entries: FiscalObligationEntry[],
  completeness: FiscalObligationsResult["profileCompleteness"] = "COMPLETE"
): FiscalObligationsResult {
  return {
    obligations: entries,
    profile: {
      obligations: {
        model111: "UNKNOWN",
        model115: "UNKNOWN",
        model130: "YES",
        model180: "UNKNOWN",
        model190: "UNKNOWN",
        model303: "YES",
        model347: "UNKNOWN",
        model349: "UNKNOWN",
        model390: "UNKNOWN",
      },
      facts: {
        fiscalRegime: "130",
        irpfDirectEstimationMode: "NORMAL",
        hasEmployees: "NO",
        paysProfessionalsSubjectToWithholding: "UNKNOWN",
        rentsBusinessPremises: "UNKNOWN",
        businessRentSubjectToWithholding: "UNKNOWN",
        activityKind130: "UNKNOWN",
        priorYearWithholdingPct130: null,
        activityStartYear: null,
        vatPeriodicity: "QUARTERLY",
        vatUsesSii: "NO",
        vatTerritory: "COMMON",
        vatActivity390Scope: "UNKNOWN",
        lastVatPeriodFilingRequired: "UNKNOWN",
      },
      censusSource: "MANUAL",
      censusLastUpdatedAt: null,
    },
    profileCompleteness: completeness,
    mismatches: [],
    warnings: [],
    generatedAt: new Date(),
    year: 2026,
    quarter: 2,
    mode: "quarter",
  };
}

export function healthIssue(partial: Partial<FiscalHealthIssue> & {
  code: string;
  title: string;
}): FiscalHealthIssue {
  return {
    fingerprint: partial.fingerprint ?? partial.code,
    severity: partial.severity ?? "WARNING",
    blocksFiling: partial.blocksFiling ?? false,
    description: partial.description ?? partial.title,
    ...partial,
  };
}

export function modelEntry(
  partial: Partial<ModelValidationEntry> & { model: ModelValidationEntry["model"] }
): ModelValidationEntry {
  return {
    domain: "AEAT",
    obligationStatus: "REQUIRED",
    operationsSignal: "HAS_OPS",
    filingStatus: "UPCOMING",
    dueDate: null,
    dueDateReliable: true,
    engineResult: 0,
    presentedResult: null,
    difference: null,
    differenceKind: "none",
    reconciliationStatus: "NO_FILING",
    snapshotAvailable: false,
    presentedAt: null,
    filingId: null,
    warnings: [],
    blockers: [],
    readyToFile: true,
    href: `/fiscal/${partial.model}`,
    notes: [],
    ...partial,
  };
}

/** G — caso roto: blocker health. */
export function brokenQuarterFixture() {
  const obligations = makeObligationsResult([
    makeObligation({
      model: "303",
      quarter: 2,
      obligationStatus: "REQUIRED",
    }),
    makeObligation({
      model: "130",
      quarter: 2,
      obligationStatus: "REQUIRED",
    }),
  ]);
  const blocker = healthIssue({
    code: "IMPORT_WITHOUT_DUA",
    title: "Importación sin DUA",
    severity: "ERROR",
    blocksFiling: true,
    model: "303",
    href: "/fiscal/expenses/broken/edit",
  });
  return { obligations, blocker };
}
