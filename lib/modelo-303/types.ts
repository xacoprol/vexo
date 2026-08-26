import type { PurchaseVatKind, SalesVatKind } from "@/lib/modelo-303/vat-classification";

export type VatBucket = {
  rate: number;
  base: number;
  quota: number;
};

export type FiscalQuarter = 1 | 2 | 3 | 4;

export type Model303SourceType =
  | "invoice"
  | "marketplace"
  | "expense"
  | "investment_asset"
  | "compensation";

export type Model303TraceLine = {
  sourceType: Model303SourceType;
  sourceId?: string;
  description: string;
  vatKind: SalesVatKind | PurchaseVatKind | "COMPENSATION" | "MARKETPLACE_OSS" | "RECTIFYING";
  base: number;
  vatAccrued?: number;
  vatDeductible?: number;
  vatNonDeductible?: number;
  vatRate?: number;
  boxCodes?: string[];
};

export type Model303Warning = {
  code: string;
  message: string;
  sourceId?: string;
};

export type Model303Outcome =
  | "TO_PAY"
  | "TO_COMPENSATE"
  | "ZERO"
  | "NO_ACTIVITY";

export type Model303Trace = Partial<Record<string, Model303TraceLine[]>>;

export type Model303Boxes = {
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
  box16: number;
  box17: number;
  box27: number;
  box28: number;
  box29: number;
  box30: number;
  box31: number;
  box32: number;
  box33: number;
  box34: number;
  box35: number;
  box36: number;
  box37: number;
  box38: number;
  box39: number;
  box41: number;
  box42: number;
  box43: number;
  box44: number;
  box45: number;
  box46: number;
  box59: number;
  box60: number;
  box66: number;
  box68: number;
  box69: number;
  box70: number;
  box71: number;
  box77: number;
  box78: number;
  box87: number;
  box108: number;
  box109: number;
  box110: number;
  box123: number;
  baseExenta: number;
  otherBase: number;
  otherQuota: number;
};

export type Model303EngineInput = {
  vatBuckets: VatBucket[];
  euIntracomAccruedBase: number;
  euIntracomAccruedVat: number;
  otherIspAccruedBase: number;
  otherIspAccruedVat: number;
  importCurrentBase: number;
  importCurrentVat: number;
  importInvestmentBase: number;
  importInvestmentVat: number;
  domesticDeductibleBase: number;
  domesticDeductibleVat: number;
  otherIspDeductibleVat: number;
  investmentDomesticBase: number;
  investmentDomesticVat: number;
  euCurrentDeductibleBase: number;
  euCurrentDeductibleVat: number;
  euInvestmentDeductibleBase: number;
  euInvestmentDeductibleVat: number;
  baseExenta: number;
  baseIntracomDeliveries: number;
  baseExport: number;
  baseCanarias: number;
  baseMarketplaceCollected: number;
  priorCompensation: number;
  priorCompensationProvisional?: boolean;
  trace: Model303Trace;
  warnings: Model303Warning[];
};

export type Model303Result = {
  boxes: Model303Boxes;
  boxList: { code: string; label: string; value: number }[];
  /** Resultado firmado final (box71). */
  result: number;
  /** box87 + newNegativeBalance — arrastre interno al periodo siguiente. */
  carryForward: number;
  /** max(0, −box71) — magnitud interna, no es casilla 70. */
  currentPeriodNegative: number;
  /** box87 — compensación de periodos anteriores no aplicada. */
  priorCompensationPending: number;
  outcome: Model303Outcome;
  trace: Model303Trace;
  warnings: Model303Warning[];
  scopeNote: string;
};
