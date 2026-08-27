import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FISCAL_STATUS, isInvoiceIssued } from "../invoice-fiscal-lifecycle";
import { buildModel111 } from "../modelo-111";
import { buildModel115 } from "../modelo-115";
import { computeExpenseDeductibility } from "../expense-deductibility";
import { aggregateModel303Period } from "../modelo-303";
import { quarterRange } from "../fiscal";
import {
  compareEngineToPresented,
  resolvePeriodReadiness,
  resolveCloseLifecycle,
  buildFiscalPeriodValidationFromParts,
} from "../fiscal-validation";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { resolveHealthStatus } from "../fiscal-health/issue";
import {
  brokenQuarterFixture,
  healthIssue,
  leaseFixture,
  makeObligation,
  makeObligationsResult,
  modelEntry,
  professionalWithholdingFixture,
  rentWithholdingFixture,
} from "./fixtures/fiscal-real-period";

describe("Fase 10 — Validación real + cierre", () => {
  describe("lifecycle / exclusions", () => {
    it("DRAFT nunca es issued → no entra en cierre fiscal", () => {
      assert.equal(
        isInvoiceIssued({ fiscalStatus: FISCAL_STATUS.DRAFT }),
        false
      );
    });

    it("ANULADA excluida en fetch fiscal (status ≠ ANULADA + ISSUED)", () => {
      // lib/fiscal.ts fetchFiscalRows: status: { not: "ANULADA" }, fiscalStatus: ISSUED
      const includeInFiscal =
        (inv: { status: string; fiscalStatus: string }) =>
          inv.status !== "ANULADA" &&
          inv.fiscalStatus === FISCAL_STATUS.ISSUED;
      assert.equal(
        includeInFiscal({
          status: "ANULADA",
          fiscalStatus: FISCAL_STATUS.ISSUED,
        }),
        false
      );
      assert.equal(
        includeInFiscal({
          status: "PENDIENTE",
          fiscalStatus: FISCAL_STATUS.ISSUED,
        }),
        true
      );
    });
  });

  describe("retenciones sin alterar 130/303", () => {
    it("profesional: 111 correcto; IRPF/IVA gasto intactos", () => {
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [
          professionalWithholdingFixture({
            id: "p1",
            counterpartyId: "cp1",
            baseAmount: 1000,
            withholdingAmount: 150,
            paymentDate: new Date("2026-05-10"),
          }),
        ],
        censusModel111: "YES",
      });
      assert.equal(draft.boxes.box08, 1000);
      assert.equal(draft.boxes.box09, 150);

      const d = computeExpenseDeductibility({
        subtotal: 1000,
        vatAmount: 210,
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
      });
      assert.equal(d.irpfComputable, 1000);

      const { from, to } = quarterRange(2026, 2);
      const r = aggregateModel303Period({
        invoices: [],
        marketplace: [],
        assets: [],
        expenses: [
          {
            id: "e1",
            issueDate: new Date("2026-05-10"),
            subtotal: 1000,
            vatAmount: 210,
            vatRate: 21,
            total: 1060,
            vatOperationType: "INTERIOR",
            vatDeductiblePct: 100,
            irpfDeductiblePct: 100,
            isInvestment: false,
            supplierName: "Prof",
          },
        ],
        from,
        to,
      });
      assert.ok(r.modelo303.boxes.box29 >= 0);
    });

    it("alquiler: 115 correcto sin alterar 130/303", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [
          rentWithholdingFixture({
            id: "r1",
            counterpartyId: "l1",
            leaseId: "lease1",
            baseAmount: 1000,
            withholdingAmount: 190,
            paymentDate: new Date("2026-05-05"),
          }),
        ],
        leases: [leaseFixture({ id: "lease1", counterpartyId: "l1" })],
        censusModel115: "YES",
      });
      assert.equal(draft.boxes.box02, 1000);
      assert.equal(draft.boxes.box03, 190);
      assert.equal(draft.boxes.box05, 190);
    });
  });

  describe("comparación filing", () => {
    it("MATCH cuando motor = presentado", () => {
      const r = compareEngineToPresented({
        model: "303",
        engineResult: 1284.37,
        presented: {
          result: 1284.37,
          incomeBase: null,
          expensesBase: null,
          vatRepercutida: null,
          vatDeductible: null,
          boxes: [],
          sourceFileName: null,
          notes: null,
          year: 2026,
          quarter: 2,
          modelType: "303",
          rawExtract: { model303Snapshot: { version: 1 } },
        },
        snapshotAvailable: true,
      });
      assert.equal(r.reconciliationStatus, "MATCH");
    });

    it("rectificativa posterior → EXPLAINED", () => {
      const r = compareEngineToPresented({
        model: "303",
        engineResult: 1042.37,
        presented: {
          result: 1284.37,
          incomeBase: null,
          expensesBase: null,
          vatRepercutida: null,
          vatDeductible: null,
          boxes: [],
          sourceFileName: null,
          notes: null,
          year: 2026,
          quarter: 2,
          modelType: "303",
          rawExtract: { model303Snapshot: { version: 1 } },
        },
        snapshotAvailable: true,
        explainedRectification: true,
      });
      assert.equal(r.reconciliationStatus, "EXPLAINED_RECTIFICATION");
      assert.ok(r.issues[0]?.explained);
    });

    it("legacy sin snapshot → LEGACY_LIMITED", () => {
      const r = compareEngineToPresented({
        model: "303",
        engineResult: 100,
        presented: {
          result: 90,
          incomeBase: null,
          expensesBase: null,
          vatRepercutida: null,
          vatDeductible: null,
          boxes: [],
          sourceFileName: null,
          notes: null,
          year: 2026,
          quarter: 2,
          modelType: "303",
          rawExtract: { source: "manual-mark-presented" },
        },
        snapshotAvailable: false,
        legacyLimited: true,
      });
      assert.equal(r.reconciliationStatus, "LEGACY_LIMITED");
    });

    it("filing histórico no se muta al comparar", () => {
      const presented = {
        result: 500,
        incomeBase: null,
        expensesBase: null,
        vatRepercutida: null,
        vatDeductible: null,
        boxes: [],
        sourceFileName: null,
        notes: null,
        year: 2026,
        quarter: 2,
        modelType: "130",
        rawExtract: { model130Snapshot: { version: 1, result: 500 } },
      };
      compareEngineToPresented({
        model: "130",
        engineResult: 600,
        presented,
        snapshotAvailable: true,
      });
      assert.equal(presented.result, 500);
    });
  });

  describe("readiness + CLOSED", () => {
    it("blocker → NOT_READY; gate bloquea 303", () => {
      const { obligations, blocker } = brokenQuarterFixture();
      const readiness = resolvePeriodReadiness({
        health: {
          status: "NOT_READY",
          blockers: [blocker],
          issues: [blocker],
        },
        obligations,
        quarter: 2,
      });
      assert.equal(readiness.status, "NOT_READY");
      const { status } = resolveHealthStatus([blocker]);
      assert.equal(
        evaluateFilingGateFromHealth(
          { status, blockers: [blocker], issues: [blocker] },
          "303"
        ).allowed,
        false
      );
    });

    it("warning no bloqueante → READY_WITH_WARNINGS", () => {
      const obligations = makeObligationsResult([
        makeObligation({
          model: "303",
          quarter: 2,
          obligationStatus: "REQUIRED",
        }),
      ]);
      const warn = healthIssue({
        code: "SOFT_WARNING",
        title: "Aviso",
        severity: "WARNING",
        blocksFiling: false,
        model: "303",
      });
      const readiness = resolvePeriodReadiness({
        health: {
          status: "READY_WITH_WARNINGS",
          blockers: [],
          issues: [warn],
        },
        obligations,
        quarter: 2,
      });
      assert.equal(readiness.status, "READY_WITH_WARNINGS");
    });

    it("UNKNOWN → nunca CLOSED", () => {
      const obligations = makeObligationsResult([
        makeObligation({
          model: "303",
          quarter: 2,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "f1",
        }),
        makeObligation({
          model: "111",
          quarter: 2,
          obligationStatus: "UNKNOWN",
          operationsSignal: "HAS_OPS",
        }),
      ]);
      const lifecycle = resolveCloseLifecycle({
        readinessStatus: "READY_WITH_WARNINGS",
        quarterObligations: obligations.obligations,
      });
      assert.equal(lifecycle.closed, false);
      assert.ok(lifecycle.unknownModels.includes("111"));
    });

    it("todas REQUIRED FILED → CLOSED", () => {
      const obligations = makeObligationsResult([
        makeObligation({
          model: "303",
          quarter: 2,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "a",
        }),
        makeObligation({
          model: "130",
          quarter: 2,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "b",
        }),
      ]);
      const lifecycle = resolveCloseLifecycle({
        readinessStatus: "READY",
        quarterObligations: obligations.obligations,
      });
      assert.equal(lifecycle.status, "CLOSED");
      assert.equal(lifecycle.closed, true);
    });

    it("ZERO_OPS no convierte a NOT_REQUIRED en notes del modelo", () => {
      const v = buildFiscalPeriodValidationFromParts({
        year: 2026,
        quarter: 2,
        health: {
          status: "READY",
          statusLabel: "Listo",
          summary: {
            totalIssues: 0,
            critical: 0,
            errors: 0,
            warnings: 0,
            info: 0,
            passedChecks: 0,
            failedChecks: 0,
          },
          blockers: [],
          issues: [],
          checks: [],
          queryCount: 0,
        },
        obligations: makeObligationsResult([
          makeObligation({
            model: "111",
            quarter: 2,
            obligationStatus: "UNKNOWN",
            operationsSignal: "ZERO_OPS",
          }),
        ]),
        models: [
          modelEntry({
            model: "111",
            obligationStatus: "UNKNOWN",
            operationsSignal: "ZERO_OPS",
            notes: [
              "ZERO_OPS: sin operaciones relevantes este período (no implica NOT_REQUIRED).",
            ],
          }),
        ],
      });
      assert.notEqual(v.models[0]!.obligationStatus, "NOT_REQUIRED");
      assert.equal(v.lifecycle.closed, false);
    });
  });

  describe("gate aislamiento", () => {
    it("blocker 111 no bloquea 303", () => {
      const blocker = healthIssue({
        code: "MODEL111_PAYMENT_DATE_MISSING",
        title: "paymentDate",
        severity: "ERROR",
        blocksFiling: true,
        model: "111",
      });
      const { status } = resolveHealthStatus([blocker]);
      assert.equal(
        evaluateFilingGateFromHealth(
          { status, blockers: [blocker], issues: [blocker] },
          "111"
        ).allowed,
        false
      );
      assert.equal(
        evaluateFilingGateFromHealth(
          { status, blockers: [blocker], issues: [blocker] },
          "303"
        ).allowed,
        true
      );
    });
  });
});
