export {
  parseSalesVatKind,
  parsePurchaseVatKind,
  isPurchaseReverseCharge,
  isEuIntracomPurchase,
  isOtherIspPurchase,
  purchaseKindToLegacyExpenseType,
  PURCHASE_VAT_KIND_LABELS,
  type SalesVatKind,
  type PurchaseVatKind,
} from "@/lib/modelo-303/vat-classification";
export {
  buildModel303,
  model303ResultToLegacyBoxes,
  computeBox27,
  computeBox45,
  computeModel303Liquidation,
} from "@/lib/modelo-303/engine";
export {
  aggregateModel303Period,
  buildModel303ChainFromRows,
  type Model303InvoiceRow,
  type Model303ExpenseRow,
  type Model303MarketplaceRow,
  type Model303AssetRow,
} from "@/lib/modelo-303/aggregate";
export {
  carryFromPresented303,
  presented303CarryToPriorCompensation,
  parseFilingBoxes,
  type Presented303Carry,
} from "@/lib/modelo-303/compensation";
export {
  boxValueFromList,
  buildCompensationDisplay,
  buildFiscalSummary,
  comparePresentedVsDraft,
  getOutcomeDisplay,
  getTraceForBox,
  boxHasTrace,
  groupBoxesForDisplay,
  humanizeWarning,
  humanizeWarnings,
  parseScopeLimitations,
  sourceDocumentHref,
  traceLineAmount,
  type Model303OutcomeDisplay,
  type Model303CompensationDisplay,
} from "@/lib/modelo-303/presentation";
export type {
  VatBucket,
  Model303TraceLine,
  Model303Warning,
  Model303Outcome,
  Model303Trace,
  Model303Result,
  Model303Boxes,
} from "@/lib/modelo-303/types";
