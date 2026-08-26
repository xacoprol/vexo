export type {
  Model390AnnualVatSummary,
  Model390CompensationSummary,
  Model390FilingObligation,
  Model390PresentedSnapshot,
  Model390Quarter303,
  Model390Reconciliation,
  Model390Result,
  Model390VatBreakdown,
} from "@/lib/modelo-390/types";

export {
  MONEY_TOLERANCE,
  moneyDelta,
  moneyEqual,
  round2,
} from "@/lib/modelo-390/money";

export {
  assess390FilingObligation,
  assess390FilingObligationFromFacts,
  type Model390CompanyVatConfig,
} from "@/lib/modelo-390/obligation";

export {
  isQuarterlyExemptActivity,
  normalizeLegacyVatConfig,
  parseTriState,
  parseVatActivity390Scope,
  parseVatPeriodicity,
  parseVatTerritory,
  type NormalizedVatConfig,
  type TriState,
  type VatActivity390Scope,
  type VatPeriodicity,
  type VatTerritory,
} from "@/lib/modelo-390/vat-config";

export {
  aggregateModel303PeriodFor390,
  buildAnnualFromOperations,
  quarter303FromResult,
} from "@/lib/modelo-390/annual-operations";

export { buildAnnualFrom303 } from "@/lib/modelo-390/annual-303";

export { reconcileAnnualVat } from "@/lib/modelo-390/reconcile";

export {
  buildCompensationSummary,
  openingBalanceFromFirstQuarter,
} from "@/lib/modelo-390/compensation";

export { buildModel390Result } from "@/lib/modelo-390/engine";

export {
  buildModelo390LegacyAdapter,
  model390ResultToModeloBoxes,
} from "@/lib/modelo-390/legacy-adapter";

export {
  buildLastPeriodAnnual303Info,
  lastPeriodAnnualInfoHeadline,
  type LastPeriodAnnual303Info,
  type LastPeriodAnnualInfoStatus,
} from "@/lib/modelo-303/last-period-annual";

export {
  build390PresentedSnapshot,
  compare390PresentedVsDraft,
  humanize390Warnings,
  obligationHeadline,
  parse390PresentedSnapshot,
  reconciliationHeadline,
  type Model390WarningDisplay,
} from "@/lib/modelo-390/presentation";
