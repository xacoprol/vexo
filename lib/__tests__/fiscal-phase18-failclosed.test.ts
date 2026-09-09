/**
 * Fase 2 CORE — fail-closed: 303 EU_SERVICE, 130 negativos, censo↔libros,
 * UNKNOWN, 349 VAT ID, DUA, deducibilidad, CLOSED+drift, anuales, OVERDUE, invariantes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExpenseDeductibility } from "../expense-deductibility";
import { resolveCensusNoAgainstBooks } from "../fiscal-obligations/census-contradiction";
import { adapt303Obligation } from "../fiscal-obligations/adapters/model-303";
import { adapt349Obligation } from "../fiscal-obligations/adapters/model-349";
import { adapt347Obligation } from "../fiscal-obligations/adapters/model-347";
import { adapt111Obligation } from "../fiscal-obligations/adapters/model-111";
import { adapt115Obligation } from "../fiscal-obligations/adapters/model-115";
import {
  buildFiscalCensusProfileFromSettings,
  type CensusSettingsRow,
} from "../fiscal-obligations";
import { resolveHealthStatus, createHealthIssue } from "../fiscal-health/issue";
import { normalizeMotorWarning } from "../fiscal-health/checks";
import {
  buildFiscalPeriodValidationFromParts,
  resolveCloseLifecycle,
  resolvePeriodReadiness,
} from "../fiscal-validation";
import { evaluateSubmissionGate, FISCAL_ENGINE_VERSION } from "../fiscal-close/pre-filing";
import { buildModel130Chain } from "../modelo-130/engine";
import type { Model130Config, Model130TraceLine } from "../modelo-130/types";
import { aggregateModel303Period } from "../modelo-303";
import {
  collect349InvoiceLines,
} from "../modelo-349/aggregate";
import { resolveEuVatId } from "../modelo-349/vat-id";
import {
  makeObligation,
  makeObligationsResult,
} from "./fixtures/fiscal-real-period";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const empty303 = { marketplace: [] as never[], assets: [] as never[] };

function inv303(opts: {
  id?: string;
  subtotal: number;
  vatAmount: number;
  vatRate?: number;
  vatOperationType?: string;
}) {
  const rate = opts.vatRate ?? 21;
  return {
    id: opts.id ?? "i1",
    fullNumber: "F-TEST-001",
    issueDate: new Date("2026-02-01"),
    subtotal: opts.subtotal,
    vatAmount: opts.vatAmount,
    irpfAmount: 0,
    status: "PAGADA",
    fiscalStatus: "ISSUED",
    cashAccounting: false,
    vatOperationType: opts.vatOperationType ?? "SUJETA",
    lines: [
      {
        vatRate: rate,
        lineSubtotal: opts.subtotal,
        lineVat: opts.vatAmount,
      },
    ],
  };
}

function periodQ1() {
  return { from: new Date("2026-01-01"), to: new Date("2026-03-31") };
}

function censusSettings(
  overrides: Partial<CensusSettingsRow> = {}
): CensusSettingsRow {
  return {
    fiscalRegime: "130",
    irpfDirectEstimationMode: "SIMPLIFIED",
    activityKind130: "BUSINESS",
    priorYearWithholdingPct130: 20,
    activityStartYear: 2020,
    vatPeriodicity: "QUARTERLY",
    vatUsesSii: "NO",
    vatTerritory: "COMMON_ONLY",
    vatActivity390Scope: "GENERAL",
    lastVatPeriodFilingRequired: "YES",
    paysProfessionalsSubjectToWithholding: "NO",
    hasEmployees: "NO",
    rentsBusinessPremises: "NO",
    businessRentSubjectToWithholding: "NO",
    censusModel130: "YES",
    censusModel303: "YES",
    censusModel111: "NO",
    censusModel115: "NO",
    censusModel180: "NO",
    censusModel190: "NO",
    censusModel349: "YES",
    censusModel347: "YES",
    censusModel390: "YES",
    censusSource: "MANUAL",
    censusLastUpdatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function profile(overrides: Partial<CensusSettingsRow> = {}) {
  return buildFiscalCensusProfileFromSettings(censusSettings(overrides));
}

const base130Config: Model130Config = {
  irpfDirectEstimationMode: "NORMAL",
  previousYearNetIncomeMode: "KNOWN",
  previousYearNetIncomeFor130Reduction: 0,
  irpf130HousingDeduction: "NO",
  agriculturalActivities130: "NONE",
  irregularIncome130Status: "NONE",
  fiscalRegime: "130",
  activityKind130: "BUSINESS",
  priorYearWithholdingPct130: 20,
  hasCashAccountingInvoices: false,
};

const emptyLines: Model130TraceLine[] = [];

function q130(income: number, expenses: number) {
  return {
    incomeBase: income,
    ordinaryExpenseBase: expenses,
    amortizationYtd: 0,
    irpfWithheld: 0,
    incomeLines: emptyLines,
    expenseLines: emptyLines,
    amortizationLines: emptyLines,
    withholdingLines: emptyLines,
  };
}

function determinedQuarterObs() {
  return makeObligationsResult([
    makeObligation({
      model: "130",
      quarter: 1,
      obligationStatus: "REQUIRED",
    }),
    makeObligation({
      model: "303",
      quarter: 1,
      obligationStatus: "REQUIRED",
    }),
    makeObligation({
      model: "111",
      quarter: 1,
      obligationStatus: "NOT_APPLICABLE",
    }),
    makeObligation({
      model: "115",
      quarter: 1,
      obligationStatus: "NOT_APPLICABLE",
    }),
    makeObligation({
      model: "349",
      quarter: 1,
      obligationStatus: "NOT_APPLICABLE",
    }),
  ]);
}

describe("Fase 2 — Modelo 303 EU_SERVICE / clasificaciones venta", () => {
  it("venta interior 21% → 07/08/09", () => {
    const r = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [inv303({ subtotal: 1000, vatAmount: 210, vatRate: 21 })],
    });
    assert.equal(r.modelo303.boxes.box07, 1000);
    assert.equal(r.modelo303.boxes.box09, 210);
    assert.equal(r.modelo303.boxes.box59, 0);
  });

  it("EU_DELIVERY → casilla 59, no 01–09", () => {
    const r = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [
        inv303({
          subtotal: 500,
          vatAmount: 0,
          vatOperationType: "EU_DELIVERY",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box59, 500);
    assert.equal(r.modelo303.boxes.box07, 0);
    assert.equal(r.modelo303.boxes.box09, 0);
    assert.equal(r.issued.quotaRepercutida, 0);
  });

  it("EU_SERVICE → casilla 59, nunca en IVA interior 01–09", () => {
    const r = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [
        inv303({
          subtotal: 800,
          vatAmount: 0,
          vatOperationType: "EU_SERVICE",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box59, 800);
    assert.equal(r.modelo303.boxes.box01, 0);
    assert.equal(r.modelo303.boxes.box04, 0);
    assert.equal(r.modelo303.boxes.box07, 0);
    assert.equal(r.modelo303.boxes.box09, 0);
    assert.equal(r.issued.quotaRepercutida, 0);
  });

  it("exportación → casilla 60 (no interior)", () => {
    const r = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [
        inv303({
          subtotal: 1200,
          vatAmount: 0,
          vatOperationType: "EXPORTACION",
        }),
      ],
    });
    assert.equal(r.issued.baseExport, 1200);
    assert.equal(r.modelo303.boxes.box60, 1200);
    assert.equal(r.modelo303.boxes.box07, 0);
    assert.equal(r.modelo303.boxes.box09, 0);
  });

  it("mezcla interior + EU_SERVICE: interior en 07–09, UE en 59", () => {
    const r = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [
        inv303({
          id: "dom",
          subtotal: 1000,
          vatAmount: 210,
          vatOperationType: "SUJETA",
        }),
        inv303({
          id: "eu",
          subtotal: 400,
          vatAmount: 0,
          vatOperationType: "EU_SERVICE",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box07, 1000);
    assert.equal(r.modelo303.boxes.box09, 210);
    assert.equal(r.modelo303.boxes.box59, 400);
    assert.equal(r.issued.quotaRepercutida, 210);
  });

  it("EU_SERVICE no altera IVA repercutido interior aunque traiga cuota errónea", () => {
    const r = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [
        inv303({
          subtotal: 300,
          vatAmount: 63,
          vatOperationType: "EU_SERVICE",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box09, 0);
    assert.equal(r.modelo303.boxes.box59, 300);
    assert.ok(
      r.modelo303.warnings.some((w) => w.code === "EU_SERVICE_UNEXPECTED_VAT")
    );
  });

  it("coherencia 303 ↔ 349 B2B UE servicios (base 59 = base clave S)", () => {
    const subtotal = 750;
    const r303 = aggregateModel303Period({
      ...empty303,
      expenses: [],
      ...periodQ1(),
      invoices: [
        inv303({
          subtotal,
          vatAmount: 0,
          vatOperationType: "EU_SERVICE",
        }),
      ],
    });
    const warnings: { code: string; message: string; sourceId?: string }[] = [];
    const { lines } = collect349InvoiceLines(
      [
        {
          id: "i1",
          fullNumber: "F-TEST-001",
          issueDate: new Date("2026-02-01"),
          subtotal,
          vatOperationType: "EU_SERVICE",
          invoiceFiscalType: "NORMAL",
          rectifiesInvoiceId: null,
          rectificationMethod: null,
          substitutionCorrectSubtotal: null,
          client: {
            name: "Cliente DE",
            nif: "DE123456789",
            countryCode: "DE",
          },
        },
      ],
      periodQ1().from,
      periodQ1().to,
      warnings
    );
    assert.equal(r303.modelo303.boxes.box59, subtotal);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].key, "S");
    assert.equal(lines[0].base, subtotal);
  });
});

describe("Fase 2 — Modelo 130 cadena negativos multi-T", () => {
  it("Q1 negativo → Q2 positivo: box15 consume |box19| de Q1", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {},
      quarters: {
        1: q130(1000, 5000),
        2: q130(20000, 2000),
        3: q130(5000, 1000),
        4: q130(5000, 1000),
      },
    });
    assert.ok(chain[1].boxes.box19 < 0);
    const negQ1 = Math.abs(chain[1].boxes.box19);
    assert.equal(chain[1].unusedNegativeResultsAfter, negQ1);
    assert.equal(chain[2].boxes.box15, negQ1);
    assert.equal(chain[2].unusedNegativeResultsAfter, 0);
  });

  it("Q1 negativo → Q2 negativo → Q3 positivo: acumulación sin doble conteo", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {},
      quarters: {
        1: q130(500, 4000),
        2: q130(500, 3000),
        3: q130(50000, 1000),
        4: q130(1000, 500),
      },
    });
    assert.ok(chain[1].boxes.box19 < 0);
    assert.ok(chain[2].boxes.box19 < 0);
    const poolAfterQ2 = chain[2].unusedNegativeResultsAfter;
    assert.equal(
      poolAfterQ2,
      round2(Math.abs(chain[1].boxes.box19) + Math.abs(chain[2].boxes.box19))
    );
    assert.equal(chain[3].boxes.box15, poolAfterQ2);
    assert.equal(chain[3].unusedNegativeResultsAfter, 0);
  });

  it("Q1 positivo → Q2 negativo → Q3 positivo", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {},
      quarters: {
        1: q130(10000, 1000),
        2: q130(500, 8000),
        3: q130(20000, 1000),
        4: q130(1000, 500),
      },
    });
    assert.ok(chain[1].boxes.box19 > 0);
    assert.equal(chain[1].unusedNegativeResultsAfter, 0);
    assert.ok(chain[2].boxes.box19 < 0);
    assert.equal(
      chain[2].unusedNegativeResultsAfter,
      Math.abs(chain[2].boxes.box19)
    );
    assert.equal(chain[3].boxes.box15, Math.abs(chain[2].boxes.box19));
    assert.equal(chain[3].unusedNegativeResultsAfter, 0);
  });

  it("Q1/Q2/Q3 negativos → Q4 positivo: consume pool acumulado", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {},
      quarters: {
        1: q130(100, 2000),
        2: q130(100, 2000),
        3: q130(100, 2000),
        4: q130(80000, 1000),
      },
    });
    const poolQ3 = chain[3].unusedNegativeResultsAfter;
    assert.equal(poolQ3, 300);
    assert.equal(chain[4].boxes.box15, 300);
    assert.equal(chain[4].unusedNegativeResultsAfter, 0);
  });

  it("negativo parcialmente consumido (pool presentado grande)", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {
        1: {
          quarter: 1,
          presented: true,
          box07: 0,
          box15: 0,
          box16: 0,
          box19: -5000,
        },
      },
      quarters: {
        1: q130(0, 10000),
        2: q130(3000, 0),
        3: q130(1000, 0),
        4: q130(1000, 0),
      },
    });
    assert.ok(chain[2].boxes.box14 < 5000);
    assert.equal(chain[2].boxes.box15, chain[2].boxes.box14);
    assert.equal(
      chain[2].unusedNegativeResultsAfter,
      round2(5000 - chain[2].boxes.box15)
    );
  });

  it("negativo totalmente consumido", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {},
      quarters: {
        1: q130(0, 2000),
        2: q130(50000, 0),
        3: q130(1000, 0),
        4: q130(1000, 0),
      },
    });
    assert.ok(chain[1].boxes.box19 < 0);
    assert.equal(chain[2].boxes.box15, Math.abs(chain[1].boxes.box19));
    assert.equal(chain[2].unusedNegativeResultsAfter, 0);
  });

  it("saldo pendiente tras Q4 si el positivo no agota el pool", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {
        1: {
          quarter: 1,
          presented: true,
          box07: 0,
          box15: 0,
          box16: 0,
          box19: -20000,
        },
        2: {
          quarter: 2,
          presented: true,
          box07: 0,
          box15: 0,
          box16: 0,
          box19: 0,
        },
        3: {
          quarter: 3,
          presented: true,
          box07: 0,
          box15: 0,
          box16: 0,
          box19: 0,
        },
      },
      quarters: {
        1: q130(0, 50000),
        2: q130(100, 100),
        3: q130(100, 100),
        4: q130(5000, 0),
      },
    });
    assert.ok(chain[4].boxes.box15 > 0);
    assert.ok(chain[4].unusedNegativeResultsAfter > 0);
    assert.equal(
      round2(chain[4].boxes.box15 + chain[4].unusedNegativeResultsAfter),
      20000
    );
  });

  it("presentado: no doble suma de |box19| sobre el pool", () => {
    const provisional = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {},
      quarters: {
        1: q130(0, 5000),
        2: q130(20000, 0),
        3: q130(1000, 0),
        4: q130(1000, 0),
      },
    });
    const withPresented = buildModel130Chain({
      year: 2026,
      config: base130Config,
      presented: {
        1: {
          quarter: 1,
          presented: true,
          box07: provisional[1].boxes.box07,
          box15: provisional[1].boxes.box15,
          box16: 0,
          box19: provisional[1].boxes.box19,
        },
      },
      quarters: {
        1: q130(0, 5000),
        2: q130(20000, 0),
        3: q130(1000, 0),
        4: q130(1000, 0),
      },
    });
    assert.equal(withPresented[2].boxes.box15, provisional[2].boxes.box15);
    assert.equal(
      withPresented[2].unusedNegativeResultsAfter,
      provisional[2].unusedNegativeResultsAfter
    );
  });
});

describe("Fase 2 — Censo contradice libros", () => {
  it("helper: census NO + HAS_OPS → contradicción", () => {
    const r = resolveCensusNoAgainstBooks({
      model: "349",
      census: "NO",
      hasOps: true,
    });
    assert.ok(r);
    assert.equal(r!.contradicts, true);
    assert.equal(r!.obligationStatus, "UNKNOWN");
    assert.ok(r!.reasonCodes.includes("CENSUS_CONTRADICTS_BOOKS"));
  });

  it("349: census NO + ops UE → BLOCK (UNKNOWN + mismatch CRITICAL)", () => {
    const { entry, mismatch } = adapt349Obligation({
      profile: profile({ censusModel349: "NO" }),
      year: 2026,
      quarter: 1,
      hasOps: true,
      filed: false,
      filingId: null,
      now: new Date("2026-04-01"),
    });
    assert.equal(entry.obligationStatus, "UNKNOWN");
    assert.ok(entry.reasonCodes.includes("CENSUS_CONTRADICTS_BOOKS"));
    assert.equal(mismatch?.code, "CENSUS_CONTRADICTS_BOOKS");
    assert.equal(mismatch?.severity, "CRITICAL");
  });

  it("347: census NO + ops umbral → BLOCK", () => {
    const { entry, mismatch } = adapt347Obligation({
      profile: profile({ censusModel347: "NO" }),
      year: 2026,
      hasDeclarableOps: true,
      filed: false,
      filingId: null,
      now: new Date("2027-03-01"),
    });
    assert.equal(entry.obligationStatus, "UNKNOWN");
    assert.ok(entry.reasonCodes.includes("CENSUS_CONTRADICTS_BOOKS"));
    assert.equal(mismatch?.code, "CENSUS_CONTRADICTS_BOOKS");
  });

  it("111: census NO + retenciones → BLOCK", () => {
    const { entry, mismatch } = adapt111Obligation({
      profile: profile({ censusModel111: "NO" }),
      year: 2026,
      quarter: 1,
      hasRelevantPayments: true,
      totalWithholdingAmount: 150,
      filed: false,
      filingId: null,
      now: new Date("2026-04-01"),
    });
    assert.equal(entry.obligationStatus, "UNKNOWN");
    assert.ok(entry.reasonCodes.includes("CENSUS_CONTRADICTS_BOOKS"));
    assert.equal(mismatch?.code, "CENSUS_CONTRADICTS_BOOKS");
  });

  it("115: census NO + alquiler con retención → BLOCK", () => {
    const { entry, mismatch } = adapt115Obligation({
      profile: profile({ censusModel115: "NO" }),
      year: 2026,
      quarter: 1,
      hasRelevantPayments: true,
      totalWithholdingAmount: 200,
      filed: false,
      filingId: null,
      now: new Date("2026-04-01"),
    });
    assert.equal(entry.obligationStatus, "UNKNOWN");
    assert.ok(entry.reasonCodes.includes("CENSUS_CONTRADICTS_BOOKS"));
    assert.equal(mismatch?.code, "CENSUS_CONTRADICTS_BOOKS");
  });

  it("303: census NO + actividad IVA → BLOCK", () => {
    const { entry, mismatch } = adapt303Obligation({
      profile: profile({ censusModel303: "NO", vatPeriodicity: "QUARTERLY" }),
      year: 2026,
      quarter: 1,
      filed: false,
      filingId: null,
      now: new Date("2026-04-01"),
      hasVatActivity: true,
    });
    assert.equal(entry.obligationStatus, "UNKNOWN");
    assert.ok(entry.reasonCodes.includes("CENSUS_CONTRADICTS_BOOKS"));
    assert.equal(mismatch?.code, "CENSUS_CONTRADICTS_BOOKS");
  });
});

describe("Fase 2 — UNKNOWN fail-closed / READY positivos", () => {
  it("UNKNOWN 130 → no READY", () => {
    const obs = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 1,
        obligationStatus: "UNKNOWN",
      }),
      makeObligation({
        model: "303",
        quarter: 1,
        obligationStatus: "REQUIRED",
      }),
      makeObligation({
        model: "111",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
    ]);
    const r = resolvePeriodReadiness({
      health: { status: "READY", blockers: [], issues: [] },
      obligations: obs,
      quarter: 1,
    });
    assert.equal(r.status, "NOT_READY");
  });

  it("UNKNOWN 303 → no READY", () => {
    const obs = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 1,
        obligationStatus: "REQUIRED",
      }),
      makeObligation({
        model: "303",
        quarter: 1,
        obligationStatus: "UNKNOWN",
      }),
      makeObligation({
        model: "111",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
    ]);
    assert.equal(
      resolvePeriodReadiness({
        health: { status: "READY", blockers: [], issues: [] },
        obligations: obs,
        quarter: 1,
      }).status,
      "NOT_READY"
    );
  });

  it("UNKNOWN 349 → no READY", () => {
    const obs = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 1,
        obligationStatus: "REQUIRED",
      }),
      makeObligation({
        model: "303",
        quarter: 1,
        obligationStatus: "REQUIRED",
      }),
      makeObligation({
        model: "111",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 1,
        obligationStatus: "UNKNOWN",
      }),
    ]);
    assert.equal(
      resolvePeriodReadiness({
        health: { status: "READY", blockers: [], issues: [] },
        obligations: obs,
        quarter: 1,
      }).status,
      "NOT_READY"
    );
  });

  it("UNKNOWN 111 con posibilidad relevante → no READY", () => {
    const obs = makeObligationsResult([
      ...determinedQuarterObs().obligations.filter((o) => o.model !== "111"),
      makeObligation({
        model: "111",
        quarter: 1,
        obligationStatus: "UNKNOWN",
        operationsSignal: "HAS_OPS",
      }),
    ]);
    assert.equal(
      resolvePeriodReadiness({
        health: { status: "READY", blockers: [], issues: [] },
        obligations: obs,
        quarter: 1,
      }).status,
      "NOT_READY"
    );
  });

  it("UNKNOWN 115 con posibilidad relevante → no READY", () => {
    const obs = makeObligationsResult([
      ...determinedQuarterObs().obligations.filter((o) => o.model !== "115"),
      makeObligation({
        model: "115",
        quarter: 1,
        obligationStatus: "UNKNOWN",
        operationsSignal: "HAS_OPS",
      }),
    ]);
    assert.equal(
      resolvePeriodReadiness({
        health: { status: "READY", blockers: [], issues: [] },
        obligations: obs,
        quarter: 1,
      }).status,
      "NOT_READY"
    );
  });

  it("NOT_APPLICABLE demostrado → sí puede READY", () => {
    const r = resolvePeriodReadiness({
      health: { status: "READY", blockers: [], issues: [] },
      obligations: determinedQuarterObs(),
      quarter: 1,
    });
    assert.equal(r.status, "READY");
  });

  it("REQUIRED calculado + sin blockers → READY / READY_TO_FILE", () => {
    const obs = determinedQuarterObs();
    const readiness = resolvePeriodReadiness({
      health: { status: "READY", blockers: [], issues: [] },
      obligations: obs,
      quarter: 1,
    });
    assert.equal(readiness.status, "READY");
    const life = resolveCloseLifecycle({
      readinessStatus: readiness.status,
      quarterObligations: obs.obligations.filter((o) => o.period.quarter === 1),
    });
    assert.equal(life.status, "READY_TO_FILE");
    assert.equal(life.readyToFile, true);
  });
});

describe("Fase 2 — 349 NIF-IVA inválido/ausente", () => {
  it("operación válida incluida", () => {
    const warnings: { code: string; message: string; sourceId?: string }[] = [];
    const { lines, skippedMissingVatId } = collect349InvoiceLines(
      [
        {
          id: "ok",
          fullNumber: "F1",
          issueDate: new Date("2026-02-01"),
          subtotal: 100,
          vatOperationType: "EU_SERVICE",
          invoiceFiscalType: "NORMAL",
          rectifiesInvoiceId: null,
          rectificationMethod: null,
          substitutionCorrectSubtotal: null,
          client: { name: "DE Co", nif: "DE123456789", countryCode: "DE" },
        },
      ],
      periodQ1().from,
      periodQ1().to,
      warnings
    );
    assert.equal(lines.length, 1);
    assert.equal(skippedMissingVatId, 0);
    assert.equal(warnings.length, 0);
  });

  it("VAT ID ausente → skip + warning + no en totales oficiales", () => {
    const warnings: { code: string; message: string; sourceId?: string }[] = [];
    const { lines, skippedMissingVatId } = collect349InvoiceLines(
      [
        {
          id: "miss",
          fullNumber: "F2",
          issueDate: new Date("2026-02-01"),
          subtotal: 200,
          vatOperationType: "EU_DELIVERY",
          invoiceFiscalType: "NORMAL",
          rectifiesInvoiceId: null,
          rectificationMethod: null,
          substitutionCorrectSubtotal: null,
          client: { name: "FR Co", nif: "", countryCode: "FR" },
        },
      ],
      periodQ1().from,
      periodQ1().to,
      warnings
    );
    assert.equal(lines.length, 0);
    assert.equal(skippedMissingVatId, 1);
    assert.equal(warnings[0]?.code, "EU_VAT_ID_MISSING");
    assert.equal(resolveEuVatId("", "FR").ok, false);
  });

  it("VAT ID inválido → skip + warning", () => {
    const warnings: { code: string; message: string; sourceId?: string }[] = [];
    const { lines, skippedMissingVatId } = collect349InvoiceLines(
      [
        {
          id: "bad",
          fullNumber: "F3",
          issueDate: new Date("2026-02-01"),
          subtotal: 300,
          vatOperationType: "EU_SERVICE",
          invoiceFiscalType: "NORMAL",
          rectifiesInvoiceId: null,
          rectificationMethod: null,
          substitutionCorrectSubtotal: null,
          client: { name: "X", nif: "XX", countryCode: "DE" },
        },
      ],
      periodQ1().from,
      periodQ1().to,
      warnings
    );
    assert.equal(lines.length, 0);
    assert.equal(skippedMissingVatId, 1);
    assert.ok(
      warnings.some(
        (w) =>
          w.code === "EU_VAT_ID_INVALID" || w.code === "EU_VAT_ID_PLACEHOLDER"
      )
    );
  });

  it("mezcla: válida + inválida → solo válida en líneas; inválida visible", () => {
    const warnings: { code: string; message: string; sourceId?: string }[] = [];
    const { lines, skippedMissingVatId } = collect349InvoiceLines(
      [
        {
          id: "ok",
          fullNumber: "Fok",
          issueDate: new Date("2026-02-01"),
          subtotal: 100,
          vatOperationType: "EU_SERVICE",
          invoiceFiscalType: "NORMAL",
          rectifiesInvoiceId: null,
          rectificationMethod: null,
          substitutionCorrectSubtotal: null,
          client: { name: "DE", nif: "DE123456789", countryCode: "DE" },
        },
        {
          id: "bad",
          fullNumber: "Fbad",
          issueDate: new Date("2026-02-02"),
          subtotal: 999,
          vatOperationType: "EU_SERVICE",
          invoiceFiscalType: "NORMAL",
          rectifiesInvoiceId: null,
          rectificationMethod: null,
          substitutionCorrectSubtotal: null,
          client: { name: "Bad", nif: "", countryCode: "FR" },
        },
      ],
      periodQ1().from,
      periodQ1().to,
      warnings
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0].base, 100);
    assert.equal(skippedMissingVatId, 1);
    assert.equal(warnings[0]?.sourceId, "bad");
  });

  it("VAT ID gap bloquea filing (normalizeMotorWarning)", () => {
    const issue = normalizeMotorWarning(
      {
        code: "EU_VAT_ID_MISSING",
        message: "Falta NIF-IVA",
        sourceId: "inv-1",
      },
      "349",
      2026,
      1
    );
    assert.equal(issue.blocksFiling, true);
    assert.equal(issue.severity, "ERROR");
  });

  it("tipo IVA no estándar bloquea filing (normalizeMotorWarning)", () => {
    const issue = normalizeMotorWarning(
      {
        code: "NON_STANDARD_VAT_RATE_REVIEW_REQUIRED",
        message: "Tipo 23 % no mapea a 01–09",
        sourceId: "m-pt",
      },
      "303",
      2026,
      2
    );
    assert.equal(issue.blocksFiling, true);
    assert.equal(issue.severity, "ERROR");
  });

  it("ninguna operación inválida permite READY del periodo (issue blocks)", () => {
    const issues = [
      createHealthIssue({
        code: "MODEL349_INCOMPLETE_VAT_ID",
        severity: "ERROR",
        blocksFiling: true,
        title: "349 incompleto",
        description: "NIF-IVA ausente",
        model: "349",
        year: 2026,
        quarter: 1,
        sourceId: "bad",
      }),
    ];
    const { status, blockers } = resolveHealthStatus(issues);
    assert.equal(status, "NOT_READY");
    assert.ok(blockers.length > 0);
    const readiness = resolvePeriodReadiness({
      health: { status, blockers, issues },
      obligations: determinedQuarterObs(),
      quarter: 1,
    });
    assert.equal(readiness.status, "NOT_READY");
  });
});

describe("Fase 2 — Import sin DUA + deducibilidad", () => {
  it("import sin DUA → warning IMPORT_DOCUMENT_MISSING y cuota import 0 (no inventada)", () => {
    const r = aggregateModel303Period({
      ...empty303,
      invoices: [],
      ...periodQ1(),
      expenses: [
        {
          id: "imp1",
          issueDate: new Date("2026-02-15"),
          subtotal: 1000,
          vatAmount: 210,
          vatRate: 21,
          total: 1210,
          vatOperationType: "IMPORTACION_BIENES",
          vatDeductiblePct: 100,
          irpfDeductiblePct: 100,
          isInvestment: false,
          supplierName: "China Co",
          importDuaBase: null,
          importDuaVat: null,
        },
      ],
    });
    assert.ok(
      r.modelo303.warnings.some((w) => w.code === "IMPORT_DOCUMENT_MISSING")
    );
    assert.equal(r.modelo303.boxes.box32, 0);
    assert.equal(r.modelo303.boxes.box33, 0);
    const issue = normalizeMotorWarning(
      { code: "IMPORT_DOCUMENT_MISSING", message: "sin DUA", sourceId: "imp1" },
      "303",
      2026,
      1
    );
    assert.equal(issue.blocksFiling, true);
  });

  it("deducibilidad ausente ambigua → unresolved, no 100% silencioso", () => {
    const ded = computeExpenseDeductibility({
      subtotal: 100,
      vatAmount: 21,
      deductible: null,
      vatDeductiblePct: null,
      irpfDeductiblePct: null,
    });
    assert.equal(ded.unresolvedDeductibility, true);
    assert.equal(ded.irpfComputable, 0);
    assert.equal(ded.vatDeductiblePct, 0);
  });

  it("campos omitidos (undefined) → default histórico 100", () => {
    const ded = computeExpenseDeductibility({
      subtotal: 100,
      vatAmount: 21,
    });
    assert.equal(ded.unresolvedDeductibility, false);
    assert.equal(ded.irpfComputable, 100);
  });

  it("histórico con default Prisma 100 se respeta", () => {
    const ded = computeExpenseDeductibility({
      subtotal: 100,
      vatAmount: 21,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    assert.equal(ded.unresolvedDeductibility, false);
    assert.equal(ded.irpfComputable, 100);
  });

  it("gasto unresolved en 303 → warning bloqueante", () => {
    const r = aggregateModel303Period({
      ...empty303,
      invoices: [],
      ...periodQ1(),
      expenses: [
        {
          id: "u1",
          issueDate: new Date("2026-02-10"),
          subtotal: 50,
          vatAmount: 10.5,
          vatRate: 21,
          total: 60.5,
          vatOperationType: "INTERIOR",
          deductible: null,
          vatDeductiblePct: null,
          irpfDeductiblePct: null,
          isInvestment: false,
          supplierName: "Sin clasificar",
        },
      ],
    });
    assert.ok(
      r.modelo303.warnings.some(
        (w) => w.code === "EXPENSE_DEDUCTIBILITY_UNRESOLVED"
      )
    );
    assert.equal(r.expenses.vatDeductible, 0);
  });
});

describe("Fase 2 — CLOSED drift / anuales / OVERDUE", () => {
  it("CLOSED + mismo hash → CLOSED limpio", () => {
    const filed = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 1,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "f130",
      }),
      makeObligation({
        model: "303",
        quarter: 1,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "f303",
      }),
      makeObligation({
        model: "111",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
    ]);
    const v = buildFiscalPeriodValidationFromParts({
      year: 2026,
      quarter: 1,
      health: {
        status: "READY",
        statusLabel: "LISTO",
        summary: { critical: 0, error: 0, warning: 0, info: 0 },
        blockers: [],
        issues: [],
        checks: [],
        queryCount: 0,
      },
      obligations: filed,
      models: [
        {
          model: "303",
          domain: "AEAT",
          obligationStatus: "REQUIRED",
          operationsSignal: "HAS_OPS",
          filingStatus: "FILED",
          dueDate: null,
          dueDateReliable: true,
          engineResult: 100,
          presentedResult: 100,
          difference: 0,
          differenceKind: "none",
          reconciliationStatus: "MATCH",
          snapshotAvailable: true,
          presentedAt: "2026-04-10",
          filingId: "f303",
          warnings: [],
          blockers: [],
          readyToFile: false,
          href: "/fiscal/303",
          notes: [],
        },
      ],
    });
    assert.equal(v.lifecycle.status, "CLOSED");
    assert.equal(v.lifecycle.closed, true);
    assert.notEqual(v.lifecycle.status, "AMENDMENT_REVIEW_REQUIRED");
  });

  it("CLOSED + books modificados → AMENDMENT_REVIEW_REQUIRED", () => {
    const filed = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 1,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "f130",
      }),
      makeObligation({
        model: "303",
        quarter: 1,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "f303",
      }),
      makeObligation({
        model: "111",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 1,
        obligationStatus: "NOT_APPLICABLE",
      }),
    ]);
    const v = buildFiscalPeriodValidationFromParts({
      year: 2026,
      quarter: 1,
      health: {
        status: "READY",
        statusLabel: "LISTO",
        summary: { critical: 0, error: 0, warning: 0, info: 0 },
        blockers: [],
        issues: [],
        checks: [],
        queryCount: 0,
      },
      obligations: filed,
      models: [
        {
          model: "303",
          domain: "AEAT",
          obligationStatus: "REQUIRED",
          operationsSignal: "HAS_OPS",
          filingStatus: "FILED",
          dueDate: null,
          dueDateReliable: true,
          engineResult: 150,
          presentedResult: 100,
          difference: 50,
          differenceKind: "post_presentation_change",
          reconciliationStatus: "CURRENT_BOOK_CHANGED_AFTER_FILING",
          snapshotAvailable: true,
          presentedAt: "2026-04-10",
          filingId: "f303",
          warnings: [],
          blockers: [],
          readyToFile: false,
          href: "/fiscal/303",
          notes: ["filing histórico intacto"],
          bookDrift: {
            addedCount: 1,
            removedCount: 0,
            filedResult: 100,
            currentResult: 150,
            delta: 50,
            evidenceCodes: ["CURRENT_BOOK_CHANGED_AFTER_FILING"],
          },
        },
      ],
    });
    assert.equal(v.lifecycle.status, "AMENDMENT_REVIEW_REQUIRED");
    assert.equal(v.lifecycle.closed, false);
    assert.equal(v.models[0].presentedResult, 100);
    assert.equal(v.models[0].filingId, "f303");
  });

  it("cierre trimestral ≠ ejercicio completo con anuales pendientes", () => {
    const filed = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 4,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "f130",
      }),
      makeObligation({
        model: "303",
        quarter: 4,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "f303",
      }),
      makeObligation({
        model: "111",
        quarter: 4,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 4,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 4,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "390",
        quarter: null,
        obligationStatus: "REQUIRED",
        filingStatus: "DUE",
      }),
      makeObligation({
        model: "347",
        quarter: null,
        obligationStatus: "REQUIRED",
        filingStatus: "UPCOMING",
      }),
    ]);
    const v = buildFiscalPeriodValidationFromParts({
      year: 2026,
      quarter: 4,
      health: {
        status: "READY",
        statusLabel: "LISTO",
        summary: { critical: 0, error: 0, warning: 0, info: 0 },
        blockers: [],
        issues: [],
        checks: [],
        queryCount: 0,
      },
      obligations: filed,
      models: [],
    });
    assert.equal(v.lifecycle.status, "CLOSED");
    assert.equal(v.fiscalYear?.periodClosed, true);
    assert.equal(v.fiscalYear?.fiscalYearComplete, false);
    assert.ok(v.fiscalYear?.pendingAnnualModels.includes("390"));
    assert.ok(v.fiscalYear?.pendingAnnualModels.includes("347"));
  });

  it("OVERDUE REQUIRED → Health no sano; no CLOSED", () => {
    const issues = [
      createHealthIssue({
        code: "REQUIRED_FILING_OVERDUE",
        severity: "CRITICAL",
        blocksFiling: false,
        title: "303 fuera de plazo",
        description: "Vencido sin filing",
        model: "303",
        year: 2026,
        quarter: 1,
      }),
    ];
    const { status } = resolveHealthStatus(issues);
    assert.equal(status, "NOT_READY");
    const life = resolveCloseLifecycle({
      readinessStatus: "NOT_READY",
      quarterObligations: [
        makeObligation({
          model: "303",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "OVERDUE",
        }),
        makeObligation({
          model: "130",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "x",
        }),
      ],
    });
    assert.notEqual(life.status, "CLOSED");
    assert.equal(life.closed, false);
  });
});

describe("Fase 2 — Invariantes globales fail-closed", () => {
  it("A) UNKNOWN relevante → NOT READY", () => {
    const r = resolvePeriodReadiness({
      health: { status: "READY", blockers: [], issues: [] },
      obligations: makeObligationsResult([
        makeObligation({
          model: "303",
          quarter: 1,
          obligationStatus: "UNKNOWN",
        }),
      ]),
      quarter: 1,
    });
    assert.equal(r.status, "NOT_READY");
  });

  it("B) CENSUS CONTRADICTS BOOKS → NOT READY", () => {
    const issues = [
      createHealthIssue({
        code: "CENSUS_CONTRADICTS_BOOKS",
        severity: "CRITICAL",
        blocksFiling: true,
        title: "Censo vs libros",
        description: "349",
        model: "349",
        year: 2026,
        quarter: 1,
      }),
    ];
    const hs = resolveHealthStatus(issues);
    assert.equal(hs.status, "NOT_READY");
    assert.equal(
      resolvePeriodReadiness({
        health: { status: hs.status, blockers: hs.blockers, issues },
        obligations: determinedQuarterObs(),
        quarter: 1,
      }).status,
      "NOT_READY"
    );
  });

  it("C) MISSING REQUIRED TAX DATA → NOT READY", () => {
    const issues = [
      createHealthIssue({
        code: "IMPORT_DOCUMENT_MISSING",
        severity: "ERROR",
        blocksFiling: true,
        title: "Sin DUA",
        description: "Import",
        model: "303",
        year: 2026,
        quarter: 1,
      }),
    ];
    assert.equal(resolveHealthStatus(issues).status, "NOT_READY");
  });

  it("D) INVALID 349 VAT ID → NOT READY", () => {
    const issues = [
      createHealthIssue({
        code: "MODEL349_INCOMPLETE_VAT_ID",
        severity: "ERROR",
        blocksFiling: true,
        title: "VAT ID",
        description: "missing",
        model: "349",
        year: 2026,
        quarter: 1,
      }),
    ];
    assert.equal(resolveHealthStatus(issues).status, "NOT_READY");
  });

  it("E) IMPORT WITHOUT DUA → NOT READY", () => {
    const issue = normalizeMotorWarning(
      { code: "IMPORT_DOCUMENT_MISSING", message: "DUA", sourceId: "e1" },
      "303",
      2026,
      1
    );
    assert.equal(issue.blocksFiling, true);
    assert.equal(resolveHealthStatus([issue]).status, "NOT_READY");
  });

  it("F) Datos completos + obligaciones determinadas → READY permitido", () => {
    assert.equal(
      resolvePeriodReadiness({
        health: { status: "READY", blockers: [], issues: [] },
        obligations: determinedQuarterObs(),
        quarter: 1,
      }).status,
      "READY"
    );
  });

  it("G) READY → FREEZE permitido (gate sin blockers)", () => {
    const gate = evaluateSubmissionGate({
      review: {
        id: "rev1",
        periodKey: "2026-Q1",
        year: 2026,
        quarter: 1,
        payload: {},
        sourceHash: "abc",
        censusHash: "def",
        engineVersion: FISCAL_ENGINE_VERSION,
        healthStatus: "READY",
        readyToFile: true,
        createdAt: new Date("2026-04-01"),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: "abc",
      currentCensusHash: "def",
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.status, "READY_FOR_SUBMISSION");
  });

  it("H) NOT READY → FREEZE imposible", () => {
    const gate = evaluateSubmissionGate({
      review: {
        id: "rev1",
        periodKey: "2026-Q1",
        year: 2026,
        quarter: 1,
        payload: {},
        sourceHash: "abc",
        censusHash: "def",
        engineVersion: FISCAL_ENGINE_VERSION,
        healthStatus: "READY",
        readyToFile: true,
        createdAt: new Date("2026-04-01"),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: "abc",
      currentCensusHash: "def",
      readyToFile: false,
      hasBlockers: true,
    });
    assert.notEqual(gate.status, "READY_FOR_SUBMISSION");
  });

  it("I) CLOSED + book drift → amendment review required", () => {
    const v = buildFiscalPeriodValidationFromParts({
      year: 2026,
      quarter: 1,
      health: {
        status: "READY",
        statusLabel: "LISTO",
        summary: { critical: 0, error: 0, warning: 0, info: 0 },
        blockers: [],
        issues: [],
        checks: [],
        queryCount: 0,
      },
      obligations: makeObligationsResult([
        makeObligation({
          model: "130",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "a",
        }),
        makeObligation({
          model: "303",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "b",
        }),
        makeObligation({
          model: "111",
          quarter: 1,
          obligationStatus: "NOT_APPLICABLE",
        }),
        makeObligation({
          model: "115",
          quarter: 1,
          obligationStatus: "NOT_APPLICABLE",
        }),
        makeObligation({
          model: "349",
          quarter: 1,
          obligationStatus: "NOT_APPLICABLE",
        }),
      ]),
      models: [
        {
          model: "303",
          domain: "AEAT",
          obligationStatus: "REQUIRED",
          operationsSignal: "HAS_OPS",
          filingStatus: "FILED",
          dueDate: null,
          dueDateReliable: true,
          engineResult: 200,
          presentedResult: 100,
          difference: 100,
          differenceKind: "post_presentation_change",
          reconciliationStatus: "POTENTIAL_AMENDMENT_REQUIRED",
          snapshotAvailable: true,
          presentedAt: "2026-04-10",
          filingId: "b",
          warnings: [],
          blockers: [],
          readyToFile: false,
          href: "/fiscal/303",
          notes: [],
        },
      ],
    });
    assert.equal(v.lifecycle.status, "AMENDMENT_REVIEW_REQUIRED");
  });
});
