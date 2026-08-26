import type { FiscalQuarter } from "@/lib/fiscal";
import { aggregateModel303Period } from "@/lib/modelo-303/aggregate";
import type { Model303Result } from "@/lib/modelo-303/types";
import type {
  Model390AnnualVatSummary,
  Model390Quarter303,
  Model390VatBreakdown,
} from "@/lib/modelo-390/types";
import { round2 } from "@/lib/modelo-390/money";

function breakdownFrom303(result: Model303Result): Model390VatBreakdown {
  const b = result.boxes;
  return {
    outputVat: b.box27,
    inputVat: b.box45,
    activityResult: b.box71,
    domesticQuota: {
      rate4: b.box03,
      rate10: b.box06,
      rate21: b.box09,
      other: b.otherQuota,
    },
    euIntracomAccruedVat: b.box11,
    otherIspAccruedVat: b.box13,
    domesticDeductibleVat: b.box29,
    investmentDomesticVat: b.box31,
    importCurrentBase: b.box32,
    importCurrentVat: b.box33,
    importInvestmentBase: b.box34,
    importInvestmentVat: b.box35,
    taxableBaseDomestic: round2(b.box01 + b.box04 + b.box07 + b.otherBase),
    euCurrentDeductibleVat: b.box37,
    euInvestmentDeductibleVat: b.box39,
    otherIspDeductibleVat: 0,
    baseExenta: b.baseExenta,
    baseIntracomDeliveries: b.box59,
    baseExport: b.box60,
    baseMarketplaceOss: b.box123,
  };
}

function mergeBreakdowns(parts: Model390VatBreakdown[]): Model390VatBreakdown {
  const sum = (fn: (p: Model390VatBreakdown) => number) =>
    round2(parts.reduce((s, p) => s + fn(p), 0));

  return {
    outputVat: sum((p) => p.outputVat),
    inputVat: sum((p) => p.inputVat),
    activityResult: sum((p) => p.activityResult),
    domesticQuota: {
      rate4: sum((p) => p.domesticQuota.rate4),
      rate10: sum((p) => p.domesticQuota.rate10),
      rate21: sum((p) => p.domesticQuota.rate21),
      other: sum((p) => p.domesticQuota.other),
    },
    euIntracomAccruedVat: sum((p) => p.euIntracomAccruedVat),
    otherIspAccruedVat: sum((p) => p.otherIspAccruedVat),
    domesticDeductibleVat: sum((p) => p.domesticDeductibleVat),
    investmentDomesticVat: sum((p) => p.investmentDomesticVat),
    importCurrentBase: sum((p) => p.importCurrentBase),
    importCurrentVat: sum((p) => p.importCurrentVat),
    importInvestmentBase: sum((p) => p.importInvestmentBase),
    importInvestmentVat: sum((p) => p.importInvestmentVat),
    taxableBaseDomestic: sum((p) => p.taxableBaseDomestic),
    euCurrentDeductibleVat: sum((p) => p.euCurrentDeductibleVat),
    euInvestmentDeductibleVat: sum((p) => p.euInvestmentDeductibleVat),
    otherIspDeductibleVat: sum((p) => p.otherIspDeductibleVat),
    baseExenta: sum((p) => p.baseExenta),
    baseIntracomDeliveries: sum((p) => p.baseIntracomDeliveries),
    baseExport: sum((p) => p.baseExport),
    baseMarketplaceOss: sum((p) => p.baseMarketplaceOss),
  };
}

export function quarter303FromResult(
  quarter: FiscalQuarter,
  result: Model303Result,
  source: "PRESENTED" | "DRAFT"
): Model390Quarter303 {
  const b = result.boxes;
  return {
    quarter,
    source,
    provisional: source === "DRAFT",
    outputVat: b.box27,
    inputVat: b.box45,
    activityResult: b.box71,
    box110: b.box110,
    box78: b.box78,
    box87: b.box87,
    box71: b.box71,
  };
}

export function buildAnnualFromOperations(opts: {
  year: number;
  quarterResults: Model303Result[];
  quarterMeta: Model390Quarter303[];
}): Model390AnnualVatSummary {
  const breakdownParts = opts.quarterResults.map(breakdownFrom303);
  const breakdown = mergeBreakdowns(breakdownParts);

  const warnings = opts.quarterResults.flatMap((r) => r.warnings);

  return {
    outputVat: breakdown.outputVat,
    inputVat: breakdown.inputVat,
    activityNet: breakdown.activityResult,
    breakdown,
    quarters: opts.quarterMeta,
    warnings,
  };
}

export function aggregateModel303PeriodFor390(
  opts: Parameters<typeof aggregateModel303Period>[0]
): Model303Result {
  return aggregateModel303Period(opts).modelo303;
}
