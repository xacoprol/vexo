import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildModelo390LegacyAdapter } from "../modelo-390/legacy-adapter";
import {
  buildAnnualFromOperations,
  quarter303FromResult,
} from "../modelo-390/annual-operations";
import { aggregateModel303Period } from "../modelo-303/aggregate";
import {
  buildLastPeriodAnnual303Info,
  lastPeriodAnnualInfoHeadline,
} from "../modelo-303/last-period-annual";
import { assess390FilingObligation } from "../modelo-390/obligation";
import type { Model390Result } from "../modelo-390/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function importExpense(
  duaBase: number,
  duaVat: number,
  opts?: { isInvestment?: boolean; vatDeductiblePct?: number }
) {
  return {
    id: "imp1",
    issueDate: new Date("2026-03-01"),
    subtotal: 800,
    vatAmount: 0,
    vatRate: 0,
    total: 800,
    vatOperationType: "IMPORTACION_BIENES",
    vatDeductiblePct: opts?.vatDeductiblePct ?? 100,
    irpfDeductiblePct: 100,
    isInvestment: opts?.isInvestment ?? false,
    supplierName: "Proveedor US",
    importDuaBase: duaBase,
    importDuaVat: duaVat,
  };
}

function mock390Result(
  overrides: Partial<Model390Result> = {}
): Model390Result {
  const annualFromOperations = overrides.annualFromOperations ?? {
    outputVat: 1000,
    inputVat: 600,
    activityNet: 400,
    breakdown: {
      outputVat: 1000,
      inputVat: 600,
      activityResult: 400,
      domesticQuota: { rate4: 0, rate10: 0, rate21: 1000, other: 0 },
      euIntracomAccruedVat: 0,
      otherIspAccruedVat: 0,
      domesticDeductibleVat: 500,
      investmentDomesticVat: 0,
      importCurrentBase: 500,
      importCurrentVat: 105,
      importInvestmentBase: 0,
      importInvestmentVat: 0,
      taxableBaseDomestic: 4000,
      euCurrentDeductibleVat: 0,
      euInvestmentDeductibleVat: 0,
      otherIspDeductibleVat: 0,
      baseExenta: 0,
      baseIntracomDeliveries: 0,
      baseExport: 0,
      baseMarketplaceOss: 0,
    },
    warnings: [],
  };

  return {
    year: 2026,
    filingObligation: {
      status: "EXEMPT",
      reasons: [],
      warnings: [],
      requiresLastPeriodAnnualInfo: true,
    },
    annualFromOperations,
    annualFrom303: annualFromOperations,
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
      applicable: true,
      status: "COMPLETE",
      lastPeriodLabel: "4T 2026",
      fields: [],
      warnings: [],
    },
    ...overrides,
  };
}

describe("Fase 7 cierre — DUA e IVA único", () => {
  describe("Importaciones 303", () => {
    it("importación corriente con DUA → 32/33", () => {
      const r = aggregateModel303Period({
        invoices: [],
        expenses: [importExpense(500, 105)],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
        priorCompensation: 0,
        priorCompensationProvisional: false,
      });
      assert.equal(r.modelo303.boxes.box32, 500);
      assert.equal(r.modelo303.boxes.box33, 105);
      assert.equal(r.modelo303.boxes.box34, 0);
    });

    it("importación inversión con DUA → 34/35", () => {
      const r = aggregateModel303Period({
        invoices: [],
        expenses: [importExpense(2000, 420, { isInvestment: true })],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
        priorCompensation: 0,
        priorCompensationProvisional: false,
      });
      assert.equal(r.modelo303.boxes.box34, 2000);
      assert.equal(r.modelo303.boxes.box35, 420);
    });

    it("DUA con vatDeductiblePct = 50 → cuota deducible parcial", () => {
      const r = aggregateModel303Period({
        invoices: [],
        expenses: [importExpense(1000, 210, { vatDeductiblePct: 50 })],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
        priorCompensation: 0,
        priorCompensationProvisional: false,
      });
      assert.equal(r.modelo303.boxes.box33, 105);
      assert.equal(r.modelo303.boxes.box32, 500);
    });

    it("IMPORT_GOODS sin DUA → warning, sin cuota inventada", () => {
      const r = aggregateModel303Period({
        invoices: [],
        expenses: [
          {
            ...importExpense(0, 0),
            importDuaBase: null,
            importDuaVat: null,
            subtotal: 999,
            vatAmount: 209.79,
          },
        ],
        marketplace: [],
        assets: [],
        from: new Date("2026-01-01"),
        to: new Date("2026-03-31"),
        priorCompensation: 0,
        priorCompensationProvisional: false,
      });
      assert.equal(r.modelo303.boxes.box33, 0);
      assert.ok(
        r.modelo303.warnings.some((w) => w.code === "IMPORT_DOCUMENT_MISSING")
      );
    });
  });

  describe("390 reutiliza 303", () => {
    it("390 agrega mismos importes que 303 trimestral", () => {
      const q = aggregateModel303Period({
        invoices: [],
        expenses: [importExpense(300, 63)],
        marketplace: [],
        assets: [],
        from: new Date("2026-02-01"),
        to: new Date("2026-03-31"),
        priorCompensation: 0,
        priorCompensationProvisional: false,
      }).modelo303;

      const annual = buildAnnualFromOperations({
        year: 2026,
        quarterResults: [q, q, q, q],
        quarterMeta: [1, 2, 3, 4].map((n) =>
          quarter303FromResult(n as 1 | 2 | 3 | 4, q, "DRAFT")
        ),
      });

      assert.equal(annual.breakdown.importCurrentVat, round2(q.boxes.box33 * 4));
      assert.equal(annual.breakdown.importCurrentBase, round2(q.boxes.box32 * 4));
    });
  });

  describe("Motor 390 único", () => {
    it("legacy adapter delega en motor nuevo (activityNet)", () => {
      const result = mock390Result();
      const legacy = buildModelo390LegacyAdapter(result);
      assert.equal(legacy.result, result.annualFromOperations.activityNet);
      assert.equal(
        legacy.boxes.find((b) => b.code === "33")?.value,
        result.annualFromOperations.breakdown.importCurrentVat
      );
    });

    it("buildModelo390 eliminado de lib/fiscal.ts", () => {
      const src = readFileSync(
        new URL("../fiscal.ts", import.meta.url),
        "utf8"
      );
      assert.ok(!src.includes("function buildModelo390("));
      assert.ok(src.includes("buildModel390Result"));
      assert.ok(src.includes("buildModelo390LegacyAdapter"));
    });
  });

  describe("Exonerado + último 303", () => {
    it("EXEMPT + datos suficientes → lastPeriodAnnualInfo COMPLETE", () => {
      const result = mock390Result();
      const info = buildLastPeriodAnnual303Info({
        year: 2026,
        filingObligation: result.filingObligation,
        annualFromOperations: result.annualFromOperations,
        requiresReview: false,
        vatPeriodicity: "QUARTERLY",
        vatTerritory: "COMMON_ONLY",
        presentedLast303: null,
      });
      assert.equal(info.applicable, true);
      assert.equal(info.status, "COMPLETE");
      assert.equal(lastPeriodAnnualInfoHeadline(info.status), "COMPLETA");
    });

    it("EXEMPT + prorrata pendiente → REQUIRES_REVIEW", () => {
      const result = mock390Result({
        annualFromOperations: {
          ...mock390Result().annualFromOperations,
          warnings: [
            {
              code: "VAT_PRORATA_ANNUAL_REVIEW_REQUIRED",
              message: "prorrata",
            },
          ],
        },
        requiresReview: true,
      });
      const info = buildLastPeriodAnnual303Info({
        year: 2026,
        filingObligation: result.filingObligation,
        annualFromOperations: result.annualFromOperations,
        requiresReview: true,
        vatPeriodicity: "QUARTERLY",
        vatTerritory: "COMMON_ONLY",
        presentedLast303: null,
      });
      assert.equal(info.status, "REQUIRES_REVIEW");
    });

    it("REQUIRED → bloque exonerado no aplica", () => {
      const info = buildLastPeriodAnnual303Info({
        year: 2026,
        filingObligation: assess390FilingObligation({
          vatUsesSii: "NO",
          vatPeriodicity: "QUARTERLY",
          vatTerritory: "COMMON_ONLY",
          vatActivity390Scope: "GENERAL",
          lastVatPeriodFilingRequired: "YES",
        }),
        annualFromOperations: mock390Result().annualFromOperations,
        requiresReview: false,
        vatPeriodicity: "QUARTERLY",
        vatTerritory: "COMMON_ONLY",
        presentedLast303: null,
      });
      assert.equal(info.applicable, false);
    });

    it("último 303 presentado divergente → diferencia visible", () => {
      const result = mock390Result();
      const info = buildLastPeriodAnnual303Info({
        year: 2026,
        filingObligation: result.filingObligation,
        annualFromOperations: result.annualFromOperations,
        requiresReview: false,
        vatPeriodicity: "QUARTERLY",
        vatTerritory: "COMMON_ONLY",
        presentedLast303: {
          id: "f1",
          modelType: "303",
          year: 2026,
          quarter: 4,
          result: 0,
          boxes: [
            { code: "27", label: "Devengado", value: 500 },
            { code: "45", label: "Deducible", value: 200 },
          ],
          filedAt: null,
          sourceFileName: null,
        },
      });
      assert.ok(info.presented?.divergesFromCurrent);
      assert.ok(info.warnings.some((w) => w.code === "LAST_303_ANNUAL_DIVERGENCE"));
    });
  });
});
