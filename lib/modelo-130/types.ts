import type { IrpfDirectEstimationMode } from "@/lib/modelo-130/constants";
import type {
  AgriculturalActivities130,
  Irpf130HousingDeduction,
  IrregularIncome130Status,
  PreviousYearNetIncome130Mode,
} from "@/lib/modelo-130/config-enums";
import type { FilingObligation } from "@/lib/modelo-130/filing-obligation";

export type FiscalQuarter = 1 | 2 | 3 | 4;

export type Model130SourceType =
  | "invoice"
  | "marketplace"
  | "expense"
  | "amortization"
  | "hard_to_justify"
  | "withholding"
  | "prior_payment"
  | "prior_housing_deduction"
  | "reduction_110_3c"
  | "negative_carry";

export type Model130TraceLine = {
  sourceType: Model130SourceType;
  sourceId?: string;
  description: string;
  amount: number;
};

export type Model130Warning = {
  code: string;
  message: string;
};

export type PresentedQuarter130 = {
  quarter: FiscalQuarter;
  box07: number | null;
  box16: number | null;
  box19: number | null;
  presented: boolean;
};

export type Model130Config = {
  irpfDirectEstimationMode: IrpfDirectEstimationMode;
  previousYearNetIncomeMode: PreviousYearNetIncome130Mode;
  /** Importe cuando mode === KNOWN. */
  previousYearNetIncomeFor130Reduction: number | null;
  irpf130HousingDeduction: Irpf130HousingDeduction;
  agriculturalActivities130: AgriculturalActivities130;
  irregularIncome130Status: IrregularIncome130Status;
  fiscalRegime: "130" | "131";
  activityKind130: "UNKNOWN" | "PROFESSIONAL" | "BUSINESS";
  priorYearWithholdingPct130: number | null;
  hasCashAccountingInvoices: boolean;
  paymentRate?: number;
  /** Obligación de presentar (independiente del cálculo). */
  filingObligation?: FilingObligation;
};

export type Model130Boxes = {
  box01: number;
  box02: number;
  box03: number;
  box04: number;
  box05: number;
  box06: number;
  box07: number;
  box08: number;
  box09: number;
  box10: number;
  box11: number;
  box12: number;
  box13: number;
  box14: number;
  box15: number;
  box16: number;
  box17: number;
  box18: number;
  box19: number;
};

export type Model130QuarterInput = {
  year: number;
  quarter: FiscalQuarter;
  incomeBase: number;
  ordinaryExpenseBase: number;
  amortizationYtd: number;
  irpfWithheld: number;
  config: Model130Config;
  priorPayments: number;
  priorHousingDeductionsIn05: number;
  unusedNegativeResults: number;
  incomeLines: Model130TraceLine[];
  expenseLines: Model130TraceLine[];
  amortizationLines: Model130TraceLine[];
  withholdingLines: Model130TraceLine[];
  priorPaymentLines: Model130TraceLine[];
  priorPaymentsProvisional: boolean;
  hardToJustifyUsedEarlierInYear?: number;
  /** Ingresos cas. 01 del 1.er trimestre (para umbral 33.007,20 €). */
  q1IncomeBase?: number | null;
  housingDeductionUsedEarlierInYear?: number;
  /** Autoliquidación complementaria. */
  complementaryPriorPayment?: number;
};

export type Model130QuarterResult = {
  year: number;
  quarter: FiscalQuarter;
  boxes: Model130Boxes;
  result: number;
  warnings: Model130Warning[];
  filingObligation: FilingObligation;
  trace: {
    box01: Model130TraceLine[];
    box02: Model130TraceLine[];
    box06: Model130TraceLine[];
    box05: Model130TraceLine[];
    box13: Model130TraceLine[];
    box15: Model130TraceLine[];
    box16: Model130TraceLine[];
  };
  unusedNegativeResultsAfter: number;
  hardToJustifyAmount: number;
  priorPaymentsProvisional: boolean;
  /** Scope explícito: VEXO solo implementa apartado I (no agrícolas). */
  scopeNote: string;
};

export type Model130BoxListItem = {
  code: string;
  label: string;
  value: number;
};
