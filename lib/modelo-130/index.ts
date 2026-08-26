export {
  IRPF_130_PAYMENT_RATE_CEUTA_MELILLA,
  IRPF_130_PAYMENT_RATE_NORMAL,
  IRPF_130_REDUCTION_MAX_PRIOR_NET_INCOME,
  IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL,
  IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_RATE,
  parseIrpfDirectEstimationMode,
  type IrpfDirectEstimationMode,
} from "@/lib/modelo-130/constants";
export {
  parseAgriculturalActivities130,
  parseIrpf130HousingDeduction,
  parseIrregularIncome130Status,
  parsePreviousYearNetIncome130Mode,
} from "@/lib/modelo-130/config-enums";
export { aggregateIrpfIncome } from "@/lib/modelo-130/irpf-income";
export { aggregateIrpfExpenses } from "@/lib/modelo-130/irpf-expenses";
export {
  computeIrpfDepreciation,
  sumIrpfDepreciationYtd,
} from "@/lib/modelo-130/irpf-depreciation";
export { aggregateIrpfWithholdings } from "@/lib/modelo-130/irpf-withholdings";
export {
  buildModel130Chain,
  buildModel130Quarter,
  boxValueFromPresented,
  model130BoxesToList,
  presentedQuarterFromFiling,
} from "@/lib/modelo-130/engine";
export { computeModel130Liquidation } from "@/lib/modelo-130/liquidation";
export { assess130FilingObligation } from "@/lib/modelo-130/filing-obligation";
export { computeHardToJustifyExpense } from "@/lib/modelo-130/simplified-hard-to-justify";
export {
  computeReduction110_3c,
  reduction110_3cAmount,
} from "@/lib/modelo-130/reduction-110-3c";
export type {
  FiscalQuarter,
  Model130BoxListItem,
  Model130Boxes,
  Model130Config,
  Model130QuarterResult,
  Model130TraceLine,
  Model130Warning,
  PresentedQuarter130,
} from "@/lib/modelo-130/types";
export type { FilingObligation, FilingObligationStatus } from "@/lib/modelo-130/filing-obligation";
