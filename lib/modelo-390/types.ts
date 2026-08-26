import type { FiscalQuarter } from "@/lib/fiscal";
import type { LastPeriodAnnual303Info } from "@/lib/modelo-303/last-period-annual";
import type { Model303Trace, Model303Warning } from "@/lib/modelo-303/types";

export type Model390FilingObligationStatus = "REQUIRED" | "EXEMPT" | "UNKNOWN";

export type Model390FilingObligation = {
  status: Model390FilingObligationStatus;
  reasons: string[];
  warnings: Model390Warning[];
  /** Si EXEMPT: la información anual debe incluirse en el último 303 del ejercicio. */
  requiresLastPeriodAnnualInfo: boolean;
};

export type Model390QuarterSource = "PRESENTED" | "DRAFT";

export type Model390Quarter303 = {
  quarter: FiscalQuarter;
  source: Model390QuarterSource;
  provisional: boolean;
  outputVat: number;
  inputVat: number;
  activityResult: number;
  box110: number;
  box78: number;
  box87: number;
  box71: number;
};

export type Model390VatBreakdown = {
  /** Casilla 27 agregada */
  outputVat: number;
  /** Casilla 45 agregada */
  inputVat: number;
  /** box71 agregada — liquidación trimestral, no confundir con devengado/deducible */
  activityResult: number;
  domesticQuota: { rate4: number; rate10: number; rate21: number; other: number };
  euIntracomAccruedVat: number;
  otherIspAccruedVat: number;
  domesticDeductibleVat: number;
  investmentDomesticVat: number;
  importCurrentBase: number;
  importCurrentVat: number;
  importInvestmentBase: number;
  importInvestmentVat: number;
  taxableBaseDomestic: number;
  euCurrentDeductibleVat: number;
  euInvestmentDeductibleVat: number;
  otherIspDeductibleVat: number;
  baseExenta: number;
  baseIntracomDeliveries: number;
  baseExport: number;
  baseMarketplaceOss: number;
};

export type Model390AnnualVatSummary = {
  outputVat: number;
  inputVat: number;
  /** Neto de actividad (Σ box71) — separado de devengado/deducible */
  activityNet: number;
  breakdown: Model390VatBreakdown;
  quarters?: Model390Quarter303[];
  trace?: Model303Trace;
  warnings: Model390Warning[];
};

export type Model390ReconciliationDifference = {
  field: string;
  label: string;
  operationsAmount: number;
  from303Amount: number;
  delta: number;
};

export type Model390ReconciliationStatus =
  | "MATCH"
  | "DIFFERENCES"
  | "PROVISIONAL"
  | "REQUIRES_REVIEW";

export type Model390Reconciliation = {
  status: Model390ReconciliationStatus;
  differences: Model390ReconciliationDifference[];
};

export type Model390CompensationSummary = {
  openingBalance: number;
  appliedInYear: number;
  pendingEndOfYear: number;
  generatedInYear: number;
  quarters: {
    quarter: FiscalQuarter;
    box110: number;
    box78: number;
    box87: number;
    box71: number;
    source: Model390QuarterSource;
  }[];
};

export type Model390PresentedSnapshot = {
  version: 1;
  filingObligation: Model390FilingObligation;
  annualFromOperations: Pick<
    Model390AnnualVatSummary,
    "outputVat" | "inputVat" | "activityNet"
  >;
  annualFrom303: Pick<
    Model390AnnualVatSummary,
    "outputVat" | "inputVat" | "activityNet"
  >;
  reconciliation: Model390Reconciliation;
};

export type Model390Result = {
  year: number;
  filingObligation: Model390FilingObligation;
  annualFromOperations: Model390AnnualVatSummary;
  annualFrom303: Model390AnnualVatSummary;
  reconciliation: Model390Reconciliation;
  compensationSummary: Model390CompensationSummary;
  warnings: Model390Warning[];
  requiresReview: boolean;
  lastPeriodAnnualInfo: LastPeriodAnnual303Info;
};
