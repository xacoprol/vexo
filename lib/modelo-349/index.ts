export type {
  Model349Deadline,
  Model349FilingPeriod,
  Model349FilingPeriodKind,
  Model349MonthlyRegimeReason,
  Model349Operation,
  Model349OperationKey,
  Model349Periodicity,
  Model349PresentedSnapshot,
  Model349Rectification,
  Model349Result,
  Model349ThresholdContext,
  Model349TraceLine,
  Model349Warning,
} from "@/lib/modelo-349/types";

export {
  MODEL349_ACTIVE_KEYS,
  MODEL349_KEY_LABELS,
  MODEL349_RESERVED_KEYS,
  is349ExcludedPurchaseKind,
  is349ExcludedSaleKind,
  purchaseKindTo349Key,
  resolve349KeyFromPurchase,
  resolve349KeyFromSale,
  salesKindTo349Key,
} from "@/lib/modelo-349/keys";

export {
  euVatIdWarningMessage,
  resolveEuVatId,
  type EuVatIdResolution,
} from "@/lib/modelo-349/vat-id";

export {
  MODEL349_PERIODICITY_THRESHOLD,
  MODEL349_THRESHOLD_OPERATION_KEYS,
  priorQuarters,
  quarterPeriodKey,
  quarterPeriodLabel,
  resolve349Periodicity,
} from "@/lib/modelo-349/periodicity";

export {
  adjustForWeekend,
  MODEL349_DEADLINE_SCOPE_NOTE,
  resolve349Deadline,
  resolve349PrimaryDeadline,
} from "@/lib/modelo-349/deadlines";

export {
  detectThresholdCrossingMonthIndex,
  monthsInQuarter,
  resolve349FilingPeriods,
} from "@/lib/modelo-349/filing-periods";

export {
  aggregate349Period,
  buildQuarterTotalsMap,
  buildMonthlyOutputTotalsForQuarter,
  sum349OutputQuarterTotal,
  collect349ExpenseLines,
  collect349InvoiceLines,
  collect349MarketplaceLines,
  group349Operations,
  num,
  round2,
  type Model349ExpenseRow,
  type Model349InvoiceRow,
  type Model349MarketplaceRow,
  type Raw349Line,
} from "@/lib/modelo-349/aggregate";

export {
  aggregate349ForQuarterTotals,
  build349PresentedSnapshot,
  build349Rectifications,
  merge349OperationsWithRectifications,
  parse349PresentedSnapshot,
  type Presented349Filing,
} from "@/lib/modelo-349/rectifications";

export { buildModel349Engine, buildModel349Result } from "@/lib/modelo-349/engine";

export {
  build349DraftBoxes,
  compare349PresentedVsDraft,
  draft349Total,
  humanize349Warnings,
  periodicityLabel,
  type Model349PresentedCompare,
  type Model349PresentedCompareRow,
  type Model349WarningDisplay,
} from "@/lib/modelo-349/presentation";
