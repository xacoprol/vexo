import {
  IRPF_130_PAYMENT_RATE_NORMAL,
  parseIrpfDirectEstimationMode,
} from "@/lib/modelo-130/constants";
import { computeModel130Liquidation } from "@/lib/modelo-130/liquidation";
import {
  assess130FilingObligation,
  type FilingObligation,
} from "@/lib/modelo-130/filing-obligation";
import {
  collectModel130PreWarnings,
  computeHousingDeductionBox16,
} from "@/lib/modelo-130/pre-checks";
import { computeReduction110_3c } from "@/lib/modelo-130/reduction-110-3c";
import { computeHardToJustifyExpense } from "@/lib/modelo-130/simplified-hard-to-justify";
import type {
  FiscalQuarter,
  Model130BoxListItem,
  Model130Config,
  Model130QuarterInput,
  Model130QuarterResult,
  Model130TraceLine,
  Model130Warning,
  PresentedQuarter130,
} from "@/lib/modelo-130/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function positiveOnly(n: number): number {
  return round2(Math.max(0, n));
}

const SCOPE_NOTE =
  "VEXO calcula el apartado I (actividades en estimación directa, no agrícolas). Casillas 08–11 = 0 salvo configuración contraria.";

function defaultFilingObligation(config: Model130Config): FilingObligation {
  return (
    config.filingObligation ?? {
      status: "UNKNOWN",
      reasons: ["Obligación de presentación no evaluada."],
    }
  );
}

export function buildModel130Quarter(
  input: Model130QuarterInput
): Model130QuarterResult {
  const warnings: Model130Warning[] = [
    ...collectModel130PreWarnings({
      fiscalRegime: input.config.fiscalRegime,
      agriculturalActivities130: input.config.agriculturalActivities130,
      irregularIncome130Status: input.config.irregularIncome130Status,
      hasCashAccountingInvoices: input.config.hasCashAccountingInvoices,
      irpf130HousingDeduction: input.config.irpf130HousingDeduction,
    }),
  ];

  const mode = parseIrpfDirectEstimationMode(
    input.config.irpfDirectEstimationMode
  );

  let hardToJustify = 0;
  const expenseLines = [...input.expenseLines];

  if (mode === "SIMPLIFIED") {
    const htj = computeHardToJustifyExpense({
      incomeBase: input.incomeBase,
      ordinaryExpenseBase: input.ordinaryExpenseBase,
      amortizationYtd: input.amortizationYtd,
      hardToJustifyUsedEarlierInYear: input.hardToJustifyUsedEarlierInYear,
    });
    hardToJustify = htj.amount;
    if (hardToJustify > 0) {
      expenseLines.push({
        sourceType: "hard_to_justify",
        description: `Gastos difícil justificación (${htj.rateApplied * 100} % s/ rend. previo ${htj.rendimientoPrevio} €)`,
        amount: hardToJustify,
      });
    }
    if (htj.cappedByAnnualMax) {
      warnings.push({
        code: "HTJ_ANNUAL_CAP",
        message: "Gasto difícil justificación limitado al máximo anual.",
      });
    }
    warnings.push({
      code: "HTJ_INCOMPATIBILITIES",
      message:
        "Estimación simplificada: VEXO no verifica incompatibilidades del art. 30. Requiere revisión si aplica.",
    });
  }

  const box02 = round2(
    input.ordinaryExpenseBase + input.amortizationYtd + hardToJustify
  );
  const box01 = round2(input.incomeBase);
  const box03 = round2(box01 - box02);
  const rate = input.config.paymentRate ?? IRPF_130_PAYMENT_RATE_NORMAL;
  const box04 = round2(box03 > 0 ? box03 * rate : 0);
  const box05 = round2(Math.max(0, input.priorPayments));
  const box06 = round2(Math.max(0, input.irpfWithheld));
  const box07 = round2(box04 - box05 - box06);

  const box08 = 0;
  const box09 = 0;
  const box10 = 0;
  const box11 = 0;

  const reduction = computeReduction110_3c({
    mode: input.config.previousYearNetIncomeMode,
    knownNetIncome: input.config.previousYearNetIncomeFor130Reduction,
    fiscalRegime131: input.config.fiscalRegime === "131",
  });
  if (reduction.warning) {
    warnings.push({ code: "REDUCTION_110_3C", message: reduction.warning });
  }
  const box13Lines: Model130TraceLine[] =
    reduction.amount > 0
      ? [
          {
            sourceType: "reduction_110_3c",
            description: `Minoración art. 110.3.c (RN anterior ${reduction.priorYearNetIncomeUsed} €, modo ${reduction.mode})`,
            amount: reduction.amount,
          },
        ]
      : [];

  const liquidation = computeModel130Liquidation({
    box07,
    box11,
    box13: reduction.amount,
    box13Lines,
    unusedNegativeResults: input.unusedNegativeResults,
    box18: input.complementaryPriorPayment ?? 0,
  });

  const housingFinal = computeHousingDeductionBox16({
    housing: input.config.irpf130HousingDeduction,
    box03,
    box14: liquidation.boxes.box14,
    box15: liquidation.boxes.box15,
    q1IncomeBase: input.q1IncomeBase,
    housingDeductionUsedEarlierInYear: input.housingDeductionUsedEarlierInYear,
  });
  if (housingFinal.warning) {
    warnings.push(housingFinal.warning);
  }

  const withHousing =
    housingFinal.amount > 0
      ? computeModel130Liquidation({
          box07,
          box11,
          box13: reduction.amount,
          box13Lines,
          unusedNegativeResults: input.unusedNegativeResults,
          box16: housingFinal.amount,
          box16Lines: [
            {
              sourceType: "prior_housing_deduction",
              description: "Deducción vivienda habitual (2 % cas. 03, elegibilidad confirmada)",
              amount: housingFinal.amount,
            },
          ],
          box18: input.complementaryPriorPayment ?? 0,
        })
      : liquidation;

  if (input.priorPaymentsProvisional) {
    warnings.push({
      code: "PROVISIONAL_PRIOR_PAYMENTS",
      message:
        "Casilla 05 incluye pagos de trimestres anteriores no presentados (provisional).",
    });
  }

  return {
    year: input.year,
    quarter: input.quarter,
    boxes: {
      box01,
      box02,
      box03,
      box04,
      box05,
      box06,
      box07,
      box08,
      box09,
      box10,
      box11,
      box12: withHousing.boxes.box12,
      box13: withHousing.boxes.box13,
      box14: withHousing.boxes.box14,
      box15: withHousing.boxes.box15,
      box16: withHousing.boxes.box16,
      box17: withHousing.boxes.box17,
      box18: withHousing.boxes.box18,
      box19: withHousing.boxes.box19,
    },
    result: withHousing.boxes.box19,
    warnings,
    filingObligation: defaultFilingObligation(input.config),
    trace: {
      box01: input.incomeLines,
      box02: [...expenseLines, ...input.amortizationLines],
      box06: input.withholdingLines,
      box05: input.priorPaymentLines,
      box13: withHousing.trace.box13,
      box15: withHousing.trace.box15,
      box16: withHousing.trace.box16,
    },
    unusedNegativeResultsAfter: withHousing.unusedNegativeResultsAfter,
    hardToJustifyAmount: hardToJustify,
    priorPaymentsProvisional: input.priorPaymentsProvisional,
    scopeNote: SCOPE_NOTE,
  };
}

export function model130BoxesToList(
  boxes: Model130QuarterResult["boxes"],
  mode: ReturnType<typeof parseIrpfDirectEstimationMode>
): Model130BoxListItem[] {
  return [
    { code: "01", label: "Ingresos computables (desde 1 de enero)", value: boxes.box01 },
    {
      code: "02",
      label:
        "Gastos deducibles (corrientes + amortizaciones" +
        (mode === "SIMPLIFIED" ? " + difícil justificación" : "") +
        ", desde 1 de enero)",
      value: boxes.box02,
    },
    { code: "03", label: "Rendimiento neto (01 − 02)", value: boxes.box03 },
    { code: "04", label: "20 % del rendimiento neto positivo", value: boxes.box04 },
    { code: "05", label: "Pagos fraccionados anteriores del ejercicio", value: boxes.box05 },
    { code: "06", label: "Retenciones e ingresos a cuenta (desde 1 de enero)", value: boxes.box06 },
    { code: "07", label: "Resultado sección I (04 − 05 − 06)", value: boxes.box07 },
    { code: "08", label: "Volumen ingresos agrícolas (no implementado)", value: boxes.box08 },
    { code: "09", label: "2 % volumen agrícola (no implementado)", value: boxes.box09 },
    { code: "10", label: "Retenciones agrícolas (no implementado)", value: boxes.box10 },
    { code: "11", label: "Resultado sección II agrícola", value: boxes.box11 },
    { code: "12", label: "Total liquidación max(0, 07 + 11)", value: boxes.box12 },
    { code: "13", label: "Minoración art. 110.3.c", value: boxes.box13 },
    { code: "14", label: "Resultado (12 − 13)", value: boxes.box14 },
    { code: "15", label: "Resultados negativos trimestres anteriores", value: boxes.box15 },
    { code: "16", label: "Deducción vivienda habitual (art. 110.3.d)", value: boxes.box16 },
    { code: "17", label: "Resultado (14 − 15 − 16)", value: boxes.box17 },
    { code: "18", label: "Pagos anteriores (complementaria)", value: boxes.box18 },
    { code: "19", label: "Resultado autoliquidación (17 − 18)", value: boxes.box19 },
  ];
}

export type Model130ChainInput = {
  year: number;
  config: Model130Config;
  quarters: Record<
    FiscalQuarter,
    {
      incomeBase: number;
      ordinaryExpenseBase: number;
      amortizationYtd: number;
      irpfWithheld: number;
      incomeLines: Model130TraceLine[];
      expenseLines: Model130TraceLine[];
      amortizationLines: Model130TraceLine[];
      withholdingLines: Model130TraceLine[];
    }
  >;
  presented: Partial<Record<FiscalQuarter, PresentedQuarter130>>;
};

export function buildModel130Chain(
  input: Model130ChainInput
): Record<FiscalQuarter, Model130QuarterResult> {
  const out = {} as Record<FiscalQuarter, Model130QuarterResult>;
  let priorPayments = 0;
  let priorHousingIn05 = 0;
  let unusedNegative = 0;
  let hardToJustifyUsed = 0;
  let housingDeductionUsed = 0;
  let anyProvisional = false;
  const q1IncomeBase = input.quarters[1]?.incomeBase ?? null;

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const data = input.quarters[q];
    const presented = input.presented[q];

    const priorLines: Model130TraceLine[] = [];
    if (priorPayments > 0) {
      priorLines.push({
        sourceType: "prior_payment",
        description: `Pagos fraccionados acumulados T1–T${q - 1}`,
        amount: priorPayments,
      });
    }

    const result = buildModel130Quarter({
      year: input.year,
      quarter: q,
      incomeBase: data.incomeBase,
      ordinaryExpenseBase: data.ordinaryExpenseBase,
      amortizationYtd: data.amortizationYtd,
      irpfWithheld: data.irpfWithheld,
      config: input.config,
      priorPayments,
      priorHousingDeductionsIn05: priorHousingIn05,
      unusedNegativeResults: unusedNegative,
      incomeLines: data.incomeLines,
      expenseLines: data.expenseLines,
      amortizationLines: data.amortizationLines,
      withholdingLines: data.withholdingLines,
      priorPaymentLines: priorLines,
      priorPaymentsProvisional: anyProvisional,
      hardToJustifyUsedEarlierInYear: hardToJustifyUsed,
      q1IncomeBase,
      housingDeductionUsedEarlierInYear: housingDeductionUsed,
    });

    out[q] = result;
    hardToJustifyUsed = round2(hardToJustifyUsed + result.hardToJustifyAmount);
    housingDeductionUsed = round2(housingDeductionUsed + result.boxes.box16);
    unusedNegative = result.unusedNegativeResultsAfter;

    if (q < 4) {
      if (presented?.presented) {
        priorPayments = round2(
          priorPayments +
            positiveOnly(presented.box07 ?? 0) -
            positiveOnly(presented.box16 ?? 0)
        );
        priorHousingIn05 = round2(
          priorHousingIn05 + positiveOnly(presented.box16 ?? 0)
        );
        if (presented.box19 != null && presented.box19 < 0) {
          unusedNegative = round2(unusedNegative + Math.abs(presented.box19));
        }
      } else {
        anyProvisional = true;
        priorPayments = round2(
          priorPayments + positiveOnly(result.boxes.box07)
        );
        if (result.boxes.box19 < 0) {
          unusedNegative = round2(
            unusedNegative + Math.abs(result.boxes.box19)
          );
        }
      }
    }
  }

  return out;
}

export function boxValueFromPresented(
  boxes: { code: string; value: number }[] | undefined,
  code: string
): number | null {
  if (!boxes?.length) return null;
  const hit = boxes.find((b) => b.code === code);
  return hit != null ? Number(hit.value) : null;
}

export function presentedQuarterFromFiling(opts: {
  quarter: FiscalQuarter;
  result: number;
  boxes: { code: string; value: number }[];
}): PresentedQuarter130 {
  const box07 = boxValueFromPresented(opts.boxes, "07");
  const box19 = boxValueFromPresented(opts.boxes, "19") ?? opts.result;
  return {
    quarter: opts.quarter,
    presented: true,
    // OCR gestoría a menudo omite cas. 07 cuando coincide con el resultado (19).
    // Sin fallback, el trimestre siguiente toma box05=0 pese a haber filing presentado.
    box07: box07 ?? box19,
    box16: boxValueFromPresented(opts.boxes, "16"),
    box19,
  };
}

export { computeModel130Liquidation } from "@/lib/modelo-130/liquidation";
