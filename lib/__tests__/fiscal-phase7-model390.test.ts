import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quarterRange } from "../fiscal";
import {
  aggregateModel303Period,
  buildModel303ChainFromRows,
} from "../modelo-303/aggregate";
import {
  buildAnnualFromOperations,
  quarter303FromResult,
} from "../modelo-390/annual-operations";
import { buildAnnualFrom303 } from "../modelo-390/annual-303";
import { assess390FilingObligation } from "../modelo-390/obligation";
import type { Model390CompanyVatConfig } from "../modelo-390/vat-config";
import {
  build390PresentedSnapshot,
  parse390PresentedSnapshot,
} from "../modelo-390/presentation";
import { reconcileAnnualVat } from "../modelo-390/reconcile";
import type { Model390AnnualVatSummary } from "../modelo-390/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function invoice(subtotal: number, vatAmount: number, rate = 21) {
  return {
    id: "i1",
    fullNumber: "F2026-001",
    issueDate: new Date("2026-02-01"),
    subtotal,
    vatAmount,
    irpfAmount: 0,
    status: "PAGADA",
    fiscalStatus: "ISSUED",
    cashAccounting: false,
    vatOperationType: "SUJETA",
    lines: [{ vatRate: rate, lineSubtotal: subtotal, lineVat: vatAmount }],
  };
}

function expense(
  subtotal: number,
  opts?: {
    vatOperationType?: string;
    vatDeductiblePct?: number;
    isInvestment?: boolean;
    importDuaBase?: number;
    importDuaVat?: number;
  }
) {
  const vat = round2(subtotal * 0.21);
  return {
    id: "e1",
    issueDate: new Date("2026-02-15"),
    subtotal,
    vatAmount: vat,
    vatRate: 21,
    total: subtotal + vat,
    vatOperationType: opts?.vatOperationType ?? "INTERIOR",
    vatDeductiblePct: opts?.vatDeductiblePct ?? 100,
    irpfDeductiblePct: 100,
    isInvestment: opts?.isInvestment ?? false,
    supplierName: "Proveedor",
    importDuaBase: opts?.importDuaBase ?? null,
    importDuaVat: opts?.importDuaVat ?? null,
  };
}

function annualSummary(
  output: number,
  input: number,
  activity: number,
  quarters?: Model390AnnualVatSummary["quarters"]
): Model390AnnualVatSummary {
  return {
    outputVat: output,
    inputVat: input,
    activityNet: activity,
    breakdown: {
      outputVat: output,
      inputVat: input,
      activityResult: activity,
      domesticQuota: { rate4: 0, rate10: 0, rate21: output, other: 0 },
      euIntracomAccruedVat: 0,
      otherIspAccruedVat: 0,
      domesticDeductibleVat: input,
      investmentDomesticVat: 0,
      importCurrentBase: 0,
      importCurrentVat: 0,
      importInvestmentBase: 0,
      importInvestmentVat: 0,
      taxableBaseDomestic: 0,
      euCurrentDeductibleVat: 0,
      euInvestmentDeductibleVat: 0,
      otherIspDeductibleVat: 0,
      baseExenta: 0,
      baseIntracomDeliveries: 0,
      baseExport: 0,
      baseMarketplaceOss: 0,
    },
    quarters,
    warnings: [],
  };
}

describe("Fase 7 — Modelo 390", () => {
  describe("Obligación 390", () => {
    function vatFacts(
      overrides: Partial<Model390CompanyVatConfig> = {}
    ): Model390CompanyVatConfig {
      return {
        vatUsesSii: "UNKNOWN",
        vatPeriodicity: "UNKNOWN",
        vatTerritory: "UNKNOWN",
        vatActivity390Scope: "UNKNOWN",
        lastVatPeriodFilingRequired: "UNKNOWN",
        ...overrides,
      };
    }

    it("sin configuración → UNKNOWN", () => {
      const o = assess390FilingObligation(null);
      assert.equal(o.status, "UNKNOWN");
      assert.equal(o.requiresLastPeriodAnnualInfo, false);
    });

    it("SII confirmado + último período obligatorio → EXEMPT", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "YES",
          lastVatPeriodFilingRequired: "YES",
        })
      );
      assert.equal(o.status, "EXEMPT");
      assert.equal(o.requiresLastPeriodAnnualInfo, true);
    });

    it("legacy vat390ExemptionReason=SII migra a SII → EXEMPT", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vat390ExemptionReason: "SII",
          lastVatPeriodFilingRequired: "YES",
        })
      );
      assert.equal(o.status, "EXEMPT");
    });

    it("legacy REDEME no migra a exoneración automática → UNKNOWN", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vat390ExemptionReason: "REDEME",
          vat390FilingObligation: "EXEMPT",
          vatPeriodicity: "QUARTERLY",
        })
      );
      assert.equal(o.status, "UNKNOWN");
    });

    it("trimestral + territorio común + régimen simplificado → EXEMPT", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "NO",
          vatPeriodicity: "QUARTERLY",
          vatTerritory: "COMMON_ONLY",
          vatActivity390Scope: "SIMPLIFIED",
          lastVatPeriodFilingRequired: "YES",
        })
      );
      assert.equal(o.status, "EXEMPT");
      assert.equal(o.requiresLastPeriodAnnualInfo, true);
    });

    it("trimestral + territorio común + alquiler urbano → EXEMPT", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "NO",
          vatPeriodicity: "QUARTERLY",
          vatTerritory: "COMMON_ONLY",
          vatActivity390Scope: "URBAN_RENTAL",
          lastVatPeriodFilingRequired: "YES",
        })
      );
      assert.equal(o.status, "EXEMPT");
    });

    it("trimestral + actividad general → REQUIRED", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "NO",
          vatPeriodicity: "QUARTERLY",
          vatTerritory: "COMMON_ONLY",
          vatActivity390Scope: "GENERAL",
          lastVatPeriodFilingRequired: "YES",
        })
      );
      assert.equal(o.status, "REQUIRED");
      assert.equal(o.requiresLastPeriodAnnualInfo, false);
    });

    it("mensual sin SII y sin otra exoneración → REQUIRED", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "NO",
          vatPeriodicity: "MONTHLY",
        })
      );
      assert.equal(o.status, "REQUIRED");
    });

    it("dato relevante UNKNOWN → UNKNOWN", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "NO",
          vatPeriodicity: "QUARTERLY",
          vatTerritory: "COMMON_ONLY",
          vatActivity390Scope: "UNKNOWN",
        })
      );
      assert.equal(o.status, "UNKNOWN");
    });

    it("supuesto exonerado pero último período no obligatorio → no EXEMPT", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "NO",
          vatPeriodicity: "QUARTERLY",
          vatTerritory: "COMMON_ONLY",
          vatActivity390Scope: "SIMPLIFIED",
          lastVatPeriodFilingRequired: "NO",
        })
      );
      assert.notEqual(o.status, "EXEMPT");
      assert.equal(o.requiresLastPeriodAnnualInfo, false);
    });

    it("SII + último período no obligatorio → no EXEMPT", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vatUsesSii: "YES",
          lastVatPeriodFilingRequired: "NO",
        })
      );
      assert.notEqual(o.status, "EXEMPT");
    });

    it("legacy REQUIRED manual no se usa como fuente de verdad → UNKNOWN", () => {
      const o = assess390FilingObligation(
        vatFacts({
          vat390FilingObligation: "REQUIRED",
          vatPeriodicity: "QUARTERLY",
        })
      );
      assert.equal(o.status, "UNKNOWN");
    });
  });

  describe("Conciliación anual", () => {
    it("4 trimestres iguales → MATCH", () => {
      const s = annualSummary(1000, 600, 400);
      const r = reconcileAnnualVat({
        operations: s,
        from303: s,
        requiresReview: false,
      });
      assert.equal(r.status, "MATCH");
    });

    it("1 trimestre borrador → PROVISIONAL", () => {
      const ops = annualSummary(1000, 600, 400);
      const from303 = annualSummary(1000, 600, 400, [
        {
          quarter: 1,
          source: "PRESENTED",
          provisional: false,
          outputVat: 250,
          inputVat: 150,
          activityResult: 100,
          box110: 0,
          box78: 0,
          box87: 0,
          box71: 100,
        },
        {
          quarter: 4,
          source: "DRAFT",
          provisional: true,
          outputVat: 250,
          inputVat: 150,
          activityResult: 100,
          box110: 0,
          box78: 0,
          box87: 0,
          box71: 100,
        },
      ]);
      const r = reconcileAnnualVat({
        operations: ops,
        from303,
        requiresReview: false,
      });
      assert.equal(r.status, "PROVISIONAL");
    });

    it("303 distinto de operaciones → DIFFERENCES", () => {
      const ops = annualSummary(1000, 600, 400);
      const from303 = annualSummary(1000, 558, 442);
      const r = reconcileAnnualVat({
        operations: ops,
        from303,
        requiresReview: false,
      });
      assert.equal(r.status, "DIFFERENCES");
      assert.ok(r.differences.some((d) => d.field === "inputVat"));
    });

    it("importación incompleta → REQUIRES_REVIEW", () => {
      const s = annualSummary(100, 50, 50);
      const r = reconcileAnnualVat({
        operations: s,
        from303: s,
        requiresReview: true,
      });
      assert.equal(r.status, "REQUIRES_REVIEW");
    });
  });

  describe("Anual desde operaciones (semántica 303)", () => {
    it("IVA 21 % + gasto interior → devengado/deducible", () => {
      const q = aggregateModel303Period({
        invoices: [invoice(1000, 210)],
        expenses: [expense(500)],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;

      const annual = buildAnnualFromOperations({
        year: 2026,
        quarterResults: [q, q, q, q],
        quarterMeta: [1, 2, 3, 4].map((n) =>
          quarter303FromResult(n as 1 | 2 | 3 | 4, q, "DRAFT")
        ),
      });

      assert.equal(annual.outputVat, 840);
      assert.equal(annual.inputVat, 420);
    });

    it("EU goods → casillas 10/11 devengado", () => {
      const q = aggregateModel303Period({
        invoices: [],
        expenses: [expense(1000, { vatOperationType: "INTRACOMUNITARIA" })],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;
      assert.equal(q.boxes.box10, 1000);
      assert.equal(q.boxes.box11, 210);
    });

    it("EU services → 10/11 (no confundir con AIB bienes)", () => {
      const q = aggregateModel303Period({
        invoices: [],
        expenses: [
          expense(800, { vatOperationType: "SERVICIO_INTRACOMUNITARIO" }),
        ],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;
      assert.equal(q.boxes.box10, 800);
      assert.equal(q.boxes.box11, 168);
    });

    it("vatDeductiblePct 50 % → mitad deducible", () => {
      const q = aggregateModel303Period({
        invoices: [],
        expenses: [expense(1000, { vatDeductiblePct: 50 })],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;
      assert.equal(q.boxes.box29, 105);
    });

    it("importación sin DUA → warning", () => {
      const q = aggregateModel303Period({
        invoices: [],
        expenses: [expense(1000, { vatOperationType: "IMPORTACION_BIENES" })],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;
      assert.ok(q.warnings.some((w) => w.code === "IMPORT_DOCUMENT_MISSING"));
    });

    it("prorrata potencial → warning", () => {
      const q = aggregateModel303Period({
        invoices: [
          invoice(1000, 210),
          {
            ...invoice(500, 0, 0),
            vatOperationType: "EXENTA",
            subtotal: 500,
            vatAmount: 0,
            lines: [{ vatRate: 0, lineSubtotal: 500, lineVat: 0 }],
          },
        ],
        expenses: [expense(200)],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;
      assert.ok(q.warnings.some((w) => w.code === "VAT_PRORATA_REVIEW_REQUIRED"));
    });
  });

  describe("Compensaciones anuales", () => {
    it("Q1 negativo → box110 Q2", () => {
      const chain = buildModel303ChainFromRows({
        year: 2026,
        invoices: [],
        expenses: [expense(5000)],
        marketplace: [],
        assets: [],
        quarterRange,
      });
      assert.equal(chain[1].boxes.box70, 0);
      assert.ok(chain[1].boxes.box71 < 0);
      assert.equal(chain[2].boxes.box110, chain[1].carryForward);
      assert.equal(chain[2].boxes.box110, chain[1].currentPeriodNegative);
    });
  });

  describe("Histórico snapshot", () => {
    it("390 presentado → snapshot inmutable", () => {
      const snap = build390PresentedSnapshot({
        year: 2026,
        filingObligation: {
          status: "REQUIRED",
          reasons: [],
          warnings: [],
          requiresLastPeriodAnnualInfo: false,
        },
        annualFromOperations: annualSummary(100, 50, 50),
        annualFrom303: annualSummary(100, 50, 50),
        reconciliation: { status: "MATCH", differences: [] },
        compensationSummary: {
          openingBalance: 0,
          appliedInYear: 0,
          pendingEndOfYear: 0,
          generatedInYear: 0,
          quarters: [],
        },
        warnings: [],
        requiresReview: false,
        lastPeriodAnnualInfo: {
          applicable: false,
          status: "INCOMPLETE",
          lastPeriodLabel: "",
          fields: [],
          warnings: [],
        },
      });
      const parsed = parse390PresentedSnapshot({ model390Snapshot: snap });
      assert.equal(parsed?.annualFromOperations.outputVat, 100);
    });
  });

  describe("Fuente 303 presentado vs borrador", () => {
    it("trimestre sin filing → PROVISIONAL_303_QUARTER", () => {
      const draft = aggregateModel303Period({
        invoices: [invoice(100, 21)],
        expenses: [],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
      }).modelo303;

      const chain = {
        1: draft,
        2: draft,
        3: draft,
        4: draft,
      };

      const annual = buildAnnualFrom303({
        draftQuarterResults: chain,
        presentedByQuarter: {},
      });

      assert.ok(
        annual.warnings.some((w) => w.code === "PROVISIONAL_303_QUARTER")
      );
    });
  });
});
