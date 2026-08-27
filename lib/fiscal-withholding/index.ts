/**
 * Retenciones fiscales practicadas / soportadas (Fase 9.1).
 *
 * Invoice.irpfAmount sigue siendo la fuente de retenciones SOPORTADAS (130).
 * FiscalWithholding PRACTICED es la fuente de retenciones PRACTICADAS (futuros 111/115).
 */

export {
  resolveExpenseDocumentAmounts,
  validatePracticedWithholding,
  expectedWithholdingAmount,
  normalizeCounterpartyTaxId,
  isUnmergeableTaxId,
  parsePracticedWithholdingStatus,
} from "@/lib/fiscal-withholding/amounts";
export { resolveOrCreateFiscalCounterparty } from "@/lib/fiscal-withholding/counterparty";
export {
  syncExpensePracticedWithholding,
  syncExpenseRentWithholding,
  deleteExpensePracticedWithholdings,
  findActiveExpensePracticedWithholding,
  findActiveExpenseRentWithholding,
} from "@/lib/fiscal-withholding/sync";
export {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_SOURCE,
  WITHHOLDING_STATUS,
  COUNTERPARTY_KIND,
  PRACTICED_WITHHOLDING_STATUS,
  CENSUS_TRI_STATE,
  WITHHOLDING_DATE_SEMANTICS,
  type WithholdingDirection,
  type WithholdingKind,
  type WithholdingSourceType,
  type WithholdingStatus,
  type CounterpartyKind,
  type PracticedWithholdingStatus,
  type CensusTriState,
} from "@/lib/fiscal-withholding/types";
export {
  filterEffectiveWithholdings,
  isEffectiveWithholdingStatus,
} from "@/lib/fiscal-withholding/effective";
