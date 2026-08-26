import type { FiscalQuarter } from "@/lib/fiscal";
import { buildModel303 } from "@/lib/modelo-303/engine";
import type { Model303Boxes, Model303Result } from "@/lib/modelo-303/types";
import {
  carryFromPresented303,
  parseFilingBoxes,
} from "@/lib/modelo-303/compensation";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import {
  buildAnnualFromOperations,
  quarter303FromResult,
} from "@/lib/modelo-390/annual-operations";
import type {
  Model390AnnualVatSummary,
  Model390Quarter303,
} from "@/lib/modelo-390/types";
import { round2 } from "@/lib/modelo-390/money";

function boxVal(boxes: { code: string; value: number }[], code: string): number {
  const row = boxes.find((b) => b.code === code);
  return row ? round2(Number(row.value)) : 0;
}

function presentedTo303Result(presented: PresentedFilingView): Model303Result {
  const boxes = parseFilingBoxes(presented.boxes);
  const b: Model303Boxes = {
    box01: boxVal(boxes, "01"),
    box02: boxVal(boxes, "02"),
    box03: boxVal(boxes, "03"),
    box04: boxVal(boxes, "04"),
    box05: boxVal(boxes, "05"),
    box06: boxVal(boxes, "06"),
    box07: boxVal(boxes, "07"),
    box08: boxVal(boxes, "08"),
    box09: boxVal(boxes, "09"),
    box10: boxVal(boxes, "10"),
    box11: boxVal(boxes, "11"),
    box12: boxVal(boxes, "12"),
    box13: boxVal(boxes, "13"),
    box16: boxVal(boxes, "16"),
    box17: boxVal(boxes, "17"),
    box27: boxVal(boxes, "27"),
    box28: boxVal(boxes, "28"),
    box29: boxVal(boxes, "29"),
    box30: boxVal(boxes, "30"),
    box31: boxVal(boxes, "31"),
    box32: boxVal(boxes, "32"),
    box33: boxVal(boxes, "33"),
    box34: boxVal(boxes, "34"),
    box35: boxVal(boxes, "35"),
    box36: boxVal(boxes, "36"),
    box37: boxVal(boxes, "37"),
    box38: boxVal(boxes, "38"),
    box39: boxVal(boxes, "39"),
    box41: boxVal(boxes, "41"),
    box42: boxVal(boxes, "42"),
    box43: boxVal(boxes, "43"),
    box44: boxVal(boxes, "44"),
    box45: boxVal(boxes, "45"),
    box46: boxVal(boxes, "46"),
    box59: boxVal(boxes, "59"),
    box60: boxVal(boxes, "60"),
    box66: boxVal(boxes, "66"),
    box68: boxVal(boxes, "68"),
    box69: boxVal(boxes, "69"),
    box70: boxVal(boxes, "70"),
    box71: presented.result != null ? round2(Number(presented.result)) : boxVal(boxes, "71"),
    box77: boxVal(boxes, "77"),
    box78: boxVal(boxes, "78"),
    box87: boxVal(boxes, "87"),
    box108: boxVal(boxes, "108"),
    box109: boxVal(boxes, "109"),
    box110: boxVal(boxes, "110"),
    box123: boxVal(boxes, "123"),
    baseExenta: 0,
    otherBase: 0,
    otherQuota: 0,
  };

  if (b.box27 === 0 && presented.vatRepercutida != null) {
    b.box27 = round2(Number(presented.vatRepercutida));
  }
  if (b.box45 === 0 && presented.vatDeductible != null) {
    b.box45 = round2(Number(presented.vatDeductible));
  }

  const carry = carryFromPresented303(presented);
  return {
    boxes: b,
    boxList: [],
    result: b.box71,
    carryForward: carry.totalAvailableNextPeriod,
    currentPeriodNegative: carry.newNegativeBalance,
    priorCompensationPending: b.box87,
    outcome: b.box71 > 0 ? "TO_PAY" : b.box71 < 0 ? "TO_COMPENSATE" : "ZERO",
    trace: {},
    warnings: carry.legacyEstimate
      ? [
          {
            code: "LEGACY_303_FILING_DETAIL",
            message: "303 presentado sin casillas estructuradas — importes aproximados.",
          },
        ]
      : [],
    scopeNote: "",
  };
}

export function buildAnnualFrom303(opts: {
  draftQuarterResults: Record<FiscalQuarter, Model303Result>;
  presentedByQuarter: Partial<Record<FiscalQuarter, PresentedFilingView>>;
}): Model390AnnualVatSummary {
  const quarterResults: Model303Result[] = [];
  const quarterMeta: Model390Quarter303[] = [];
  const warnings: Model390AnnualVatSummary["warnings"] = [];

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const presented = opts.presentedByQuarter[q];
    if (presented) {
      const result = presentedTo303Result(presented);
      quarterResults.push(result);
      quarterMeta.push(quarter303FromResult(q, result, "PRESENTED"));
      warnings.push(...result.warnings);
    } else {
      const draft = opts.draftQuarterResults[q];
      quarterResults.push(draft);
      quarterMeta.push(quarter303FromResult(q, draft, "DRAFT"));
      warnings.push({
        code: "PROVISIONAL_303_QUARTER",
        message: `${q}T — borrador actual (303 no presentado).`,
      });
      warnings.push(...draft.warnings);
    }
  }

  const annual = buildAnnualFromOperations({
    year: 0,
    quarterResults,
    quarterMeta,
  });

  return {
    ...annual,
    warnings: [...warnings, ...annual.warnings],
  };
}

/** Reconstruye resultado mínimo desde casillas legacy si faltan detalles. */
export function minimal303FromBoxes(
  boxes: Model303Boxes,
  result: number
): Model303Result {
  return buildModel303({
    vatBuckets: [],
    euIntracomAccruedBase: 0,
    euIntracomAccruedVat: 0,
    otherIspAccruedBase: 0,
    otherIspAccruedVat: 0,
    importCurrentBase: 0,
    importCurrentVat: 0,
    importInvestmentBase: 0,
    importInvestmentVat: 0,
    domesticDeductibleBase: 0,
    domesticDeductibleVat: 0,
    otherIspDeductibleVat: 0,
    investmentDomesticBase: 0,
    investmentDomesticVat: 0,
    euCurrentDeductibleBase: 0,
    euCurrentDeductibleVat: 0,
    euInvestmentDeductibleBase: 0,
    euInvestmentDeductibleVat: 0,
    baseExenta: 0,
    baseIntracomDeliveries: 0,
    baseExport: 0,
    baseCanarias: 0,
    baseMarketplaceCollected: 0,
    priorCompensation: 0,
    trace: {},
    warnings: [],
  });
}
