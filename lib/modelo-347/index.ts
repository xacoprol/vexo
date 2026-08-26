export type {
  Model347Deadline,
  Model347ExcludedOperation,
  Model347Eligibility,
  Model347EligibilityReason,
  Model347OperationType,
  Model347Operator,
  Model347PresentedSnapshot,
  Model347QuarterAmounts,
  Model347Result,
  Model347ThresholdContext,
  Model347TraceLine,
  Model347Warning,
} from "@/lib/modelo-347/types";

export {
  MODEL_347_THRESHOLD,
  MODELO_347_THRESHOLD,
  build347ThresholdContext,
  exceeds347Threshold,
  round2,
} from "@/lib/modelo-347/threshold";

export {
  isSpanish347Counterparty,
  resolve347Operator,
  type Operator347Resolution,
} from "@/lib/modelo-347/operator";

export {
  ELIGIBILITY_REASON_LABELS,
  assess347PurchaseEligibility,
  assess347SaleEligibility,
  eligibilityReasonLabel,
} from "@/lib/modelo-347/eligibility";

export {
  compute347CashAccountingAmounts,
  type Model347CashAccountingAmounts,
  type Model347PaymentRow,
} from "@/lib/modelo-347/cash-accounting";

export {
  compute347InvoiceAmount,
  compute347RectificationAmount,
  type Model347OriginalInvoiceRef,
  type Model347RectificationInput,
} from "@/lib/modelo-347/rectification";

export {
  MODEL347_DEADLINE_SCOPE_NOTE,
  MODEL347_OFFICIAL_DEADLINES,
  addToQuarter,
  adjustForWeekend,
  emptyQuarters,
  fiscalQuarterFromDate,
  resolve347Deadline,
} from "@/lib/modelo-347/deadlines";

export {
  aggregate347Year,
  collect347ExpenseLines,
  collect347InvoiceLines,
  collect347MarketplaceExcluded,
  effective347OperatorAmount,
  group347Operators,
  num,
  type Model347ExpenseRow,
  type Model347InvoiceRow,
  type Model347MarketplaceRow,
} from "@/lib/modelo-347/aggregate";

export { buildModel347Engine, buildModel347Result } from "@/lib/modelo-347/engine";

export {
  build347DraftBoxes,
  build347PresentedSnapshot,
  compare347PresentedVsDraft,
  draft347Total,
  humanize347Warnings,
  operationTypeLabel,
  parse347PresentedSnapshot,
  type Model347PresentedCompare,
  type Model347PresentedCompareRow,
  type Model347WarningDisplay,
} from "@/lib/modelo-347/presentation";
