import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExpenseDeductibility } from "../expense-deductibility";
import { assembleModel130Chain, model130ResultToModeloBoxes } from "../modelo-130/assemble";
import {
  buildModel130Chain,
  buildModel130Quarter,
  computeModel130Liquidation,
  presentedQuarterFromFiling,
} from "../modelo-130/engine";
import { assess130FilingObligation } from "../modelo-130/filing-obligation";
import { aggregateIrpfWithholdings } from "../modelo-130/irpf-withholdings";
import { IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL } from "../modelo-130/constants";
import { computeHardToJustifyExpense } from "../modelo-130/simplified-hard-to-justify";
import { computeReduction110_3c, reduction110_3cAmount } from "../modelo-130/reduction-110-3c";
import {
  computeHousingDeductionBox16,
  HOUSING_DEDUCTION_ANNUAL_MAX,
  HOUSING_PREDICTABLE_INCOME_ANNUAL_MAX,
} from "../modelo-130/pre-checks";
import type { Model130Config, Model130TraceLine } from "../modelo-130/types";

const baseConfig: Model130Config = {
  irpfDirectEstimationMode: "NORMAL",
  previousYearNetIncomeMode: "UNKNOWN",
  previousYearNetIncomeFor130Reduction: null,
  irpf130HousingDeduction: "NO",
  agriculturalActivities130: "NONE",
  irregularIncome130Status: "NONE",
  fiscalRegime: "130",
  activityKind130: "UNKNOWN",
  priorYearWithholdingPct130: null,
  hasCashAccountingInvoices: false,
};

const emptyLines: Model130TraceLine[] = [];

function quarterData(opts: { income: number; expenses: number; withheld?: number }) {
  return {
    incomeBase: opts.income,
    ordinaryExpenseBase: opts.expenses,
    amortizationYtd: 0,
    irpfWithheld: opts.withheld ?? 0,
    incomeLines: emptyLines,
    expenseLines: emptyLines,
    amortizationLines: emptyLines,
    withholdingLines: emptyLines,
  };
}

function quarterInput(overrides: Partial<Parameters<typeof buildModel130Quarter>[0]> = {}) {
  return {
    year: 2026,
    quarter: 1 as const,
    incomeBase: 20000,
    ordinaryExpenseBase: 10000,
    amortizationYtd: 0,
    irpfWithheld: 300,
    config: {
      ...baseConfig,
      previousYearNetIncomeMode: "KNOWN" as const,
      previousYearNetIncomeFor130Reduction: 8500,
    },
    priorPayments: 500,
    priorHousingDeductionsIn05: 0,
    unusedNegativeResults: 200,
    incomeLines: emptyLines,
    expenseLines: emptyLines,
    amortizationLines: emptyLines,
    withholdingLines: emptyLines,
    priorPaymentLines: emptyLines,
    priorPaymentsProvisional: false,
    ...overrides,
  };
}

describe("Model 130 — casilla 12", () => {
  it("07 = -500, 11 = 0 → 12 = 0", () => {
    const liq = computeModel130Liquidation({ box07: -500, box11: 0, box13: 0, unusedNegativeResults: 0 });
    assert.equal(liq.boxes.box12, 0);
  });

  it("07 = 500, 11 = 0 → 12 = 500", () => {
    const liq = computeModel130Liquidation({ box07: 500, box11: 0, box13: 0, unusedNegativeResults: 0 });
    assert.equal(liq.boxes.box12, 500);
  });
});

describe("Model 130 — fórmula oficial encadenada", () => {
  it("ejemplo completo AEAT", () => {
    const liq = computeModel130Liquidation({
      box07: 1200,
      box11: 0,
      box13: 100,
      unusedNegativeResults: 200,
      box16: 0,
      box18: 0,
    });
    assert.equal(liq.boxes.box12, 1200);
    assert.equal(liq.boxes.box14, 1100);
    assert.equal(liq.boxes.box15, 200);
    assert.equal(liq.boxes.box17, 900);
    assert.equal(liq.boxes.box19, 900);
  });

  it("13 provoca 14 negativo", () => {
    const liq = computeModel130Liquidation({ box07: 50, box13: 100, unusedNegativeResults: 0 });
    assert.equal(liq.boxes.box14, -50);
    assert.equal(liq.boxes.box15, 0);
  });

  it("15 nunca supera 14 positiva", () => {
    const liq = computeModel130Liquidation({ box07: 500, box13: 0, unusedNegativeResults: 9999 });
    assert.equal(liq.boxes.box15, 500);
  });

  it("negativo 19 acumula pool y 15 consume una vez", () => {
    const liq1 = computeModel130Liquidation({ box07: 50, box13: 100, unusedNegativeResults: 0 });
    assert.equal(liq1.boxes.box19, -50);
    assert.equal(liq1.unusedNegativeResultsAfter, 50);
    const liq2 = computeModel130Liquidation({ box07: 800, box13: 0, unusedNegativeResults: 50 });
    assert.equal(liq2.boxes.box15, 50);
    assert.equal(liq2.unusedNegativeResultsAfter, 0);
  });

  it("complementaria cas. 18", () => {
    const liq = computeModel130Liquidation({ box07: 900, box13: 0, unusedNegativeResults: 0, box18: 200 });
    assert.equal(liq.boxes.box19, 700);
  });
});

describe("Model 130 — casilla 13", () => {
  it("sin actividad anterior → 100 €", () => {
    const r = computeReduction110_3c({ mode: "NO_ACTIVITY", knownNetIncome: null, fiscalRegime131: false });
    assert.equal(r.amount, 100);
  });

  it("UNKNOWN no asume 0", () => {
    const r = computeReduction110_3c({ mode: "UNKNOWN", knownNetIncome: null, fiscalRegime131: false });
    assert.equal(r.amount, 0);
    assert.ok(r.warning);
  });

  it("tabla tramos", () => {
    assert.equal(reduction110_3cAmount(0), 100);
    assert.equal(reduction110_3cAmount(15000), 0);
  });
});

describe("Model 130 — obligación y warnings", () => {
  it("filing UNKNOWN sin datos", () => {
    const o = assess130FilingObligation({
      fiscalRegime: "130",
      incomeBaseYtd: 10000,
      incomeWithWithholdingYtd: 0,
      currentYear: 2026,
    });
    assert.equal(o.status, "UNKNOWN");
  });

  it("housing NO sin warning", () => {
    const r = buildModel130Quarter(quarterInput({ config: { ...baseConfig, irpf130HousingDeduction: "NO" } }));
    assert.equal(r.boxes.box16, 0);
    assert.ok(!r.warnings.some((w) => w.code === "HOUSING_DEDUCTION_UNKNOWN"));
  });
});

describe("Model 130 — casilla 16", () => {
  const eligibleConfig: Model130Config = {
    ...baseConfig,
    irpf130HousingDeduction: "ELIGIBLE_CONFIRMED",
    previousYearNetIncomeMode: "NO_ACTIVITY",
    previousYearNetIncomeFor130Reduction: null,
  };

  it("UNKNOWN → box16 = 0 con warning", () => {
    const r = buildModel130Quarter(
      quarterInput({ config: { ...baseConfig, irpf130HousingDeduction: "UNKNOWN" } })
    );
    assert.equal(r.boxes.box16, 0);
    assert.ok(r.warnings.some((w) => w.code === "HOUSING_DEDUCTION_UNKNOWN"));
  });

  it("NO → box16 = 0 sin warning housing", () => {
    const r = computeHousingDeductionBox16({
      housing: "NO",
      box03: 50000,
      box14: 5000,
      box15: 0,
    });
    assert.equal(r.amount, 0);
    assert.equal(r.warning, undefined);
  });

  it("ELIGIBLE_CONFIRMED calcula 2 % con tope anual", () => {
    const r = computeHousingDeductionBox16({
      housing: "ELIGIBLE_CONFIRMED",
      box03: 50000,
      box14: 5000,
      box15: 0,
      q1IncomeBase: 5000,
      housingDeductionUsedEarlierInYear: 0,
    });
    assert.equal(r.amount, 660.14);
    assert.equal(r.warning, undefined);
  });

  it("limitada por box14 − box15", () => {
    const r = computeHousingDeductionBox16({
      housing: "ELIGIBLE_CONFIRMED",
      box03: 50000,
      box14: 300,
      box15: 100,
      q1IncomeBase: 5000,
    });
    assert.equal(r.amount, 200);
  });

  it("bloqueada por ingresos previsibles ≥ 33.007,20 €", () => {
    const r = computeHousingDeductionBox16({
      housing: "ELIGIBLE_CONFIRMED",
      box03: 20000,
      box14: 3000,
      box15: 0,
      q1IncomeBase: 9000,
    });
    assert.equal(r.amount, 0);
    assert.ok(r.warning?.code === "HOUSING_INELIGIBLE_INCOME_THRESHOLD");
    assert.equal(9000 * 4, 36000);
    assert.ok(36000 >= HOUSING_PREDICTABLE_INCOME_ANNUAL_MAX);
  });

  it("Q1→Q4: deducción anual acumulada ≤ 660,14 € vía box04/05/07/16", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: eligibleConfig,
      presented: {},
      quarters: {
        1: quarterData({ income: 8000, expenses: 1000 }),
        2: quarterData({ income: 100000, expenses: 20000 }),
        3: quarterData({ income: 150000, expenses: 30000 }),
        4: quarterData({ income: 200000, expenses: 40000 }),
      },
    });

    const totalBox16 =
      chain[1].boxes.box16 +
      chain[2].boxes.box16 +
      chain[3].boxes.box16 +
      chain[4].boxes.box16;

    assert.equal(totalBox16, HOUSING_DEDUCTION_ANNUAL_MAX);
    assert.ok(chain[1].boxes.box16 > 0);
    assert.ok(chain[2].boxes.box16 > 0);
    assert.equal(chain[3].boxes.box16, 0);
    assert.equal(chain[4].boxes.box16, 0);

    assert.ok(chain[1].boxes.box04 > 0);
    assert.ok(chain[2].boxes.box05 > 0);
    assert.ok(chain[2].boxes.box07 >= 0);
  });

  it("Q1→Q4 presentado: box05 resta box16 previas y mantiene tope anual", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: eligibleConfig,
      presented: {
        1: { quarter: 1, presented: true, box07: 1400, box16: 140, box19: 1260 },
      },
      quarters: {
        1: quarterData({ income: 8000, expenses: 1000 }),
        2: quarterData({ income: 100000, expenses: 20000 }),
        3: quarterData({ income: 150000, expenses: 30000 }),
        4: quarterData({ income: 200000, expenses: 40000 }),
      },
    });

    const totalBox16 =
      chain[1].boxes.box16 +
      chain[2].boxes.box16 +
      chain[3].boxes.box16 +
      chain[4].boxes.box16;

    assert.equal(totalBox16, HOUSING_DEDUCTION_ANNUAL_MAX);
    assert.equal(chain[1].boxes.box16, 140);
    assert.equal(chain[2].boxes.box05, 1260);
    assert.ok(chain[2].boxes.box16 > 0);
    assert.equal(chain[3].boxes.box16, 0);
  });

  it("OCR legacy sin cas.07: fallback a resultado para no anular box05 del trimestre siguiente", () => {
    const presented = presentedQuarterFromFiling({
      quarter: 1,
      result: 944.7,
      boxes: [
        { code: "01", value: 11471.59 },
        { code: "04", value: 944.7 },
        { code: "19", value: 944.7 },
      ],
    });
    assert.equal(presented.box07, 944.7);
    assert.equal(presented.box19, 944.7);

    const chain = buildModel130Chain({
      year: 2026,
      config: baseConfig,
      presented: { 1: presented },
      quarters: {
        1: quarterData({ income: 10000, expenses: 2000, withheld: 0 }),
        2: quarterData({ income: 20000, expenses: 5000, withheld: 235.2 }),
        3: quarterData({ income: 20000, expenses: 5000 }),
        4: quarterData({ income: 20000, expenses: 5000 }),
      },
    });

    assert.equal(chain[2].boxes.box05, 944.7);
    assert.equal(chain[2].priorPaymentsProvisional, false);
  });
});

describe("Model 130 — retenciones", () => {
  it("anulada excluida", () => {
    const r = aggregateIrpfWithholdings({
      from: new Date("2026-01-01"),
      to: new Date("2026-12-31"),
      invoices: [{ id: "i1", issueDate: new Date("2026-02-01"), irpfAmount: 100, status: "ANULADA", fiscalStatus: "ISSUED" }],
    });
    assert.equal(r.total, 0);
  });
});

describe("Model 130 — deducibilidad", () => {
  it("IVA nd en IRPF", () => {
    const d = computeExpenseDeductibility({ subtotal: 100, vatAmount: 21, vatDeductiblePct: 0, irpfDeductiblePct: 100 });
    assert.equal(d.irpfComputable, 121);
  });
});

describe("Model 130 — simplificada", () => {
  it("tope anual", () => {
    const r = computeHardToJustifyExpense({ incomeBase: 60000, ordinaryExpenseBase: 10000, amortizationYtd: 0 });
    assert.equal(r.amount, IRPF_SIMPLIFIED_HARD_TO_JUSTIFY_MAX_ANNUAL);
  });
});

describe("Model 130 — assemble", () => {
  it("01–19", () => {
    const chain = assembleModel130Chain({
      year: 2026,
      config: baseConfig,
      presented: {},
      invoices: [{ id: "i1", issueDate: new Date("2026-01-01"), subtotal: 1000, irpfAmount: 0, status: "PAGADA", fiscalStatus: "ISSUED" }],
      expenses: [],
      marketplace: [],
      amortRows: [],
    });
    assert.ok(model130ResultToModeloBoxes(chain[1], baseConfig).boxes.some((b) => b.code === "19"));
  });
});
