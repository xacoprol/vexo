import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildModel303ChainFromRows,
  model303ResultToLegacyBoxes,
} from "../modelo-303";
import { model130ResultToModeloBoxes } from "../modelo-130/assemble";
import { assembleModel130Chain } from "../modelo-130/assemble";
import type { FiscalHealthContext } from "../fiscal-health/context";
import { runFiscalHealthChecks } from "../fiscal-health/checks";
import {
  run303CompensationChainChecks,
  run130YtdAndInvoicingChecks,
  runExpenses303Checks,
  run303349TraceChecks,
  runRectificationCrossChecks,
  runObligationChecks,
} from "../fiscal-health/extended-checks";
import { resolveHealthStatus } from "../fiscal-health/issue";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { INVOICE_FISCAL_TYPE } from "../invoice-rectification";
import type { Model349Result } from "../modelo-349";
import type { ModeloBoxes } from "../fiscal";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function quarterRange(year: number, q: 1 | 2 | 3 | 4) {
  const startMonth = (q - 1) * 3;
  return {
    from: new Date(year, startMonth, 1),
    to: new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
  };
}

function toModeloBoxes(
  r: ReturnType<typeof buildModel303ChainFromRows>[1]
): ModeloBoxes {
  const legacy = model303ResultToLegacyBoxes(r);
  return {
    boxes: legacy.boxes,
    result: legacy.result,
    carryForward: legacy.carryForward,
    trace303: legacy.trace,
    currentPeriodNegative: r.currentPeriodNegative,
    priorCompensationPending: r.priorCompensationPending,
  };
}

function emptyCtx(overrides: Partial<FiscalHealthContext> = {}): FiscalHealthContext {
  const base: FiscalHealthContext = {
    year: 2026,
    quarter: 2,
    mode: "quarter",
    queryCount: 0,
    settings: {
      nif: "B123",
      fiscalRegime: "130",
      verifactuMode: "VERIFACTU",
      simplifiedInvoiceMaxAmount: 400,
      paysProfessionalsSubjectToWithholding: "UNKNOWN",
      censusModel111: "UNKNOWN",
      model111Periodicity: "UNKNOWN",
      model115Periodicity: "UNKNOWN",
      censusModel130: "UNKNOWN",
      censusModel303: "UNKNOWN",
      censusModel115: "UNKNOWN",
      censusModel180: "UNKNOWN",
      censusModel190: "UNKNOWN",
      censusModel349: "UNKNOWN",
      censusModel347: "UNKNOWN",
      censusModel390: "UNKNOWN",
      hasEmployees: "UNKNOWN",
      rentsBusinessPremises: "UNKNOWN",
      businessRentSubjectToWithholding: "UNKNOWN",
      activityKind130: "UNKNOWN",
      priorYearWithholdingPct130: null,
      activityStartYear: null,
      vatPeriodicity: "UNKNOWN",
      vatUsesSii: "UNKNOWN",
      vatTerritory: "UNKNOWN",
      vatActivity390Scope: "UNKNOWN",
      lastVatPeriodFilingRequired: "UNKNOWN",
      censusSource: "UNKNOWN",
      censusLastUpdatedAt: null,
    },
    periodSummary: null,
    draft349: null,
    draft349Year: [],
    draft349All: [],
    chain303: null,
    chain130: null,
    presented303: null,
    presented130: null,
    presented349: null,
    presented111: null,
    presented115: null,
    presented180: null,
    presented190: null,
    model390: null,
    draft347: null,
    presented347: null,
    presented390: null,
    yearSummary: null,
    invoices: [],
    expenses: [],
    marketplace: [],
    invoicesYear: [],
    expensesYear: [],
    marketplaceYear: [],
    practicedWithholdingsYear: [],
    leasesActive: [],
    verifactu: {
      checkedAt: new Date(),
      invoiceCount: 0,
      sealedCount: 0,
      unsealedCount: 0,
      annulledWithoutEvent: 0,
      issues: [],
    },
    filingsYear: [],
  };
  const ctx = { ...base, ...overrides };
  if (overrides.invoices) ctx.invoicesYear = overrides.invoices;
  return ctx;
}

describe("Fase 8 cierre — checks extendidos", () => {
  describe("Cadena 303", () => {
    it("cadena correcta Q1 negativo → Q2 box110 → pass", () => {
      const chain = buildModel303ChainFromRows({
        year: 2026,
        invoices: [],
        expenses: [
          {
            id: "e1",
            issueDate: new Date("2026-02-01"),
            subtotal: 5000,
            vatAmount: 1050,
            vatRate: 21,
            total: 6050,
            vatOperationType: "INTERIOR",
            vatDeductiblePct: 100,
            irpfDeductiblePct: 100,
            isInvestment: false,
            supplierName: "X",
          },
        ],
        marketplace: [],
        assets: [],
        priorYearCompensation: 0,
        quarterRange,
      });
      const chain303 = {
        1: toModeloBoxes(chain[1]),
        2: toModeloBoxes(chain[2]),
        3: toModeloBoxes(chain[3]),
        4: toModeloBoxes(chain[4]),
      };
      assert.equal(chain303[2].boxes.find((b) => b.code === "110")?.value, chain[1].carryForward);
      const { checks, issues } = run303CompensationChainChecks(
        emptyCtx({ chain303, mode: "annual", quarter: null })
      );
      assert.ok(checks.some((c) => c.id === "303_compensation_chain" && c.passed));
      assert.equal(issues.filter((i) => i.code === "MODEL303_CHAIN_CARRY_BREAK").length, 0);
    });

    it("box78 > box110 → issue", () => {
      const chain303 = {
        1: {
          boxes: [
            { code: "110", label: "", value: 100 },
            { code: "78", label: "", value: 150 },
            { code: "87", label: "", value: -50 },
            { code: "71", label: "", value: 0 },
            { code: "70", label: "", value: 0 },
          ],
          result: 0,
          carryForward: 0,
        },
        2: toModeloBoxes(
          buildModel303ChainFromRows({
            year: 2026,
            invoices: [],
            expenses: [],
            marketplace: [],
            assets: [],
            quarterRange,
          })[2]
        ),
        3: toModeloBoxes(
          buildModel303ChainFromRows({
            year: 2026,
            invoices: [],
            expenses: [],
            marketplace: [],
            assets: [],
            quarterRange,
          })[3]
        ),
        4: toModeloBoxes(
          buildModel303ChainFromRows({
            year: 2026,
            invoices: [],
            expenses: [],
            marketplace: [],
            assets: [],
            quarterRange,
          })[4]
        ),
      } as Record<1 | 2 | 3 | 4, ModeloBoxes>;

      const { issues } = run303CompensationChainChecks(
        emptyCtx({ chain303, mode: "annual", quarter: null })
      );
      assert.ok(issues.some((i) => i.code === "MODEL303_COMPENSATION_BOX78_EXCEEDS"));
    });

    it("box87 incorrecta → issue", () => {
      const chain303 = {
        1: {
          boxes: [
            { code: "110", label: "", value: 500 },
            { code: "78", label: "", value: 300 },
            { code: "87", label: "", value: 100 },
            { code: "71", label: "", value: -200 },
            { code: "70", label: "", value: 0 },
          ],
          result: 0,
          carryForward: 300,
          currentPeriodNegative: 200,
        },
        2: toModeloBoxes(
          buildModel303ChainFromRows({
            year: 2026,
            invoices: [],
            expenses: [],
            marketplace: [],
            assets: [],
            presentedCarryByQuarter: { 1: 300 },
            quarterRange,
          })[2]
        ),
        3: toModeloBoxes(
          buildModel303ChainFromRows({
            year: 2026,
            invoices: [],
            expenses: [],
            marketplace: [],
            assets: [],
            quarterRange,
          })[3]
        ),
        4: toModeloBoxes(
          buildModel303ChainFromRows({
            year: 2026,
            invoices: [],
            expenses: [],
            marketplace: [],
            assets: [],
            quarterRange,
          })[4]
        ),
      } as Record<1 | 2 | 3 | 4, ModeloBoxes>;
      chain303[1].boxes.find((b) => b.code === "87")!.value = 999;

      const { issues } = run303CompensationChainChecks(
        emptyCtx({ chain303, mode: "annual", quarter: null })
      );
      assert.ok(issues.some((i) => i.code === "MODEL303_COMPENSATION_BOX87_MISMATCH"));
    });
  });

  describe("130 YTD y facturación", () => {
    it("operación Q1 presente en Q2 → pass YTD", () => {
      const config = {
        irpfDirectEstimationMode: "DIRECT_NORMAL" as const,
        previousYearNetIncomeMode: "UNKNOWN" as const,
        previousYearNetIncomeFor130Reduction: null,
        irpf130HousingDeduction: "NONE" as const,
        agriculturalActivities130: "NONE" as const,
        irregularIncome130Status: "NONE" as const,
        fiscalRegime: "130" as const,
        activityKind130: "PROFESSIONAL" as const,
        priorYearWithholdingPct130: null,
        hasCashAccountingInvoices: false,
      };
      const invoices = [
        {
          id: "inv1",
          fullNumber: "F-1",
          issueDate: new Date("2026-02-15"),
          subtotal: 1000,
          irpfAmount: 0,
          status: "EMITIDA",
          fiscalStatus: "ISSUED",
        },
      ];
      const chain = assembleModel130Chain({
        year: 2026,
        config,
        invoices,
        expenses: [],
        marketplace: [],
        amortRows: [],
        presented: {},
      });
      const chain130 = {
        1: model130ResultToModeloBoxes(chain[1], config),
        2: model130ResultToModeloBoxes(chain[2], config),
        3: model130ResultToModeloBoxes(chain[3], config),
        4: model130ResultToModeloBoxes(chain[4], config),
      };
      const { checks } = run130YtdAndInvoicingChecks(
        emptyCtx({
          chain130,
          invoicesYear: [
            {
              id: "inv1",
              fullNumber: "F-1",
              issueDate: new Date("2026-02-15"),
              fiscalStatus: "ISSUED",
              status: "EMITIDA",
              verifactuHash: "h",
              invoiceKind: "FULL",
              invoiceFiscalType: null,
              rectificationType: null,
              rectificationMethod: null,
              rectifiesInvoiceId: null,
              seriesId: "s",
              subtotal: 1000,
              vatAmount: 210,
              total: 1210,
              clientNif: "B1",
              clientName: "C",
              irpfAmount: 0,
              vatOperationType: null,
              lineCount: 1,
            },
          ],
          mode: "annual",
          quarter: null,
        })
      );
      assert.ok(checks.some((c) => c.id === "130_ytd_coherent" && c.passed));
    });
  });

  describe("303 ↔ 349", () => {
    function mock349(q: 2, ops: Model349Result["operations"]): Model349Result {
      return {
        year: 2026,
        quarter: q,
        label: `${q}T`,
        periodicity: "QUARTERLY",
        monthlyRegimeReason: null,
        thresholdContext: {
          threshold: 50000,
          referenceQuarterKey: "2026-Q2",
          referenceQuarterAmount: 0,
          priorQuarterAmounts: [],
          monthlyRegimeReason: null,
          operationsIncluded: "",
        },
        filingPeriods: [],
        deadline: {
          dueDate: new Date(),
          dueLabel: "",
          periodicity: "QUARTERLY",
          periodLabel: "",
          scopeNote: "",
        },
        operations: ops,
        rectifications: [],
        warnings: [],
        totalsByKey: {},
        totalOperations: ops.length,
        hasOps: ops.length > 0,
        incompleteVatId: false,
        needsAttention: false,
        skippedMissingVatId: 0,
        skippedMissingVatIdEntregas: 0,
        skippedMissingVatIdAdquisiciones: 0,
      };
    }

    it("EU_GOODS en 303 y 349 A → pass", () => {
      const chain = buildModel303ChainFromRows({
        year: 2026,
        invoices: [],
        expenses: [
          {
            id: "eu1",
            issueDate: new Date("2026-04-10"),
            subtotal: 500,
            vatAmount: 105,
            vatRate: 21,
            total: 500,
            vatOperationType: "INTRACOMUNITARIA",
            vatDeductiblePct: 100,
            irpfDeductiblePct: 100,
            isInvestment: false,
            supplierName: "Adobe",
          },
        ],
        marketplace: [],
        assets: [],
        quarterRange,
      });
      const chain303 = {
        1: toModeloBoxes(chain[1]),
        2: toModeloBoxes(chain[2]),
        3: toModeloBoxes(chain[3]),
        4: toModeloBoxes(chain[4]),
      };
      const draft349All = [
        mock349(2, [
          {
            vatId: "IE123",
            country: "IE",
            operatorName: "Adobe",
            key: "A",
            amount: 500,
            trace: [
              {
                sourceType: "expense",
                sourceId: "eu1",
                label: "Adobe",
                issueDate: "2026-04-10",
                base: 500,
              },
            ],
          },
        ]),
      ];
      const { checks } = run303349TraceChecks(
        emptyCtx({ chain303, draft349All, quarter: 2 })
      );
      assert.ok(checks.some((c) => c.id === "303_349_eu_reconciled" && c.passed));
    });

    it("303 sí / 349 no → issue", () => {
      const chain = buildModel303ChainFromRows({
        year: 2026,
        invoices: [],
        expenses: [
          {
            id: "eu2",
            issueDate: new Date("2026-05-01"),
            subtotal: 300,
            vatAmount: 63,
            vatRate: 21,
            total: 300,
            vatOperationType: "SERVICIO_INTRACOMUNITARIO",
            vatDeductiblePct: 100,
            irpfDeductiblePct: 100,
            isInvestment: false,
            supplierName: "SaaS",
          },
        ],
        marketplace: [],
        assets: [],
        quarterRange,
      });
      const { issues } = run303349TraceChecks(
        emptyCtx({
          chain303: {
            1: toModeloBoxes(chain[1]),
            2: toModeloBoxes(chain[2]),
            3: toModeloBoxes(chain[3]),
            4: toModeloBoxes(chain[4]),
          },
          draft349All: [mock349(2, [])],
          quarter: 2,
        })
      );
      assert.ok(issues.some((i) => i.code === "EU_OPERATION_MISSING_349"));
    });

    it("OSS legítimo → warning no ERROR", () => {
      const chain = buildModel303ChainFromRows({
        year: 2026,
        invoices: [
          {
            id: "inv-eu",
            fullNumber: "2026-EU",
            issueDate: new Date("2026-04-01"),
            subtotal: 200,
            vatAmount: 0,
            vatRate: 0,
            irpfAmount: 0,
            status: "EMITIDA",
            fiscalStatus: "ISSUED",
            vatOperationType: "INTRACOM",
            invoiceFiscalType: null,
            lines: [{ vatRate: 0, lineSubtotal: 200, lineVat: 0 }],
          },
        ],
        expenses: [],
        marketplace: [],
        assets: [],
        quarterRange,
      });
      const draft349All = [
        mock349(2, []),
        {
          ...mock349(2, []),
          warnings: [
            {
              code: "MARKETPLACE_349_REVIEW_REQUIRED",
              message: "OSS",
              sourceId: "inv-eu",
            },
          ],
        },
      ];
      const { issues } = run303349TraceChecks(
        emptyCtx({
          chain303: {
            1: toModeloBoxes(chain[1]),
            2: toModeloBoxes(chain[2]),
            3: toModeloBoxes(chain[3]),
            4: toModeloBoxes(chain[4]),
          },
          draft349All,
          quarter: 2,
        })
      );
      assert.ok(
        !issues.some((i) => i.code === "EU_OPERATION_MISSING_349" && i.blocksFiling)
      );
    });
  });

  describe("Rectificativas", () => {
    it("rectificativa en 303 → pass", () => {
      const chain = buildModel303ChainFromRows({
        year: 2026,
        invoices: [
          {
            id: "orig",
            fullNumber: "O-1",
            issueDate: new Date("2026-01-15"),
            subtotal: 1000,
            vatAmount: 210,
            vatRate: 21,
            irpfAmount: 0,
            status: "EMITIDA",
            fiscalStatus: "ISSUED",
            vatOperationType: null,
            invoiceFiscalType: null,
            lines: [{ vatRate: 21, lineSubtotal: 1000, lineVat: 210 }],
          },
          {
            id: "rect",
            fullNumber: "R-1",
            issueDate: new Date("2026-04-01"),
            subtotal: -200,
            vatAmount: -42,
            vatRate: 21,
            irpfAmount: 0,
            status: "EMITIDA",
            fiscalStatus: "ISSUED",
            vatOperationType: null,
            invoiceFiscalType: INVOICE_FISCAL_TYPE.RECTIFYING,
            rectificationType: "R1",
            rectificationMethod: "I",
            rectifiesInvoiceId: "orig",
            lines: [{ vatRate: 21, lineSubtotal: -200, lineVat: -42 }],
          },
        ],
        expenses: [],
        marketplace: [],
        assets: [],
        quarterRange,
      });
      const { checks } = runRectificationCrossChecks(
        emptyCtx({
          chain303: {
            1: toModeloBoxes(chain[1]),
            2: toModeloBoxes(chain[2]),
            3: toModeloBoxes(chain[3]),
            4: toModeloBoxes(chain[4]),
          },
          invoicesYear: [
            {
              id: "orig",
              fullNumber: "O-1",
              issueDate: new Date("2026-01-15"),
              fiscalStatus: "ISSUED",
              status: "EMITIDA",
              verifactuHash: "a",
              invoiceKind: "FULL",
              invoiceFiscalType: null,
              rectificationType: null,
              rectificationMethod: null,
              rectifiesInvoiceId: null,
              seriesId: "s",
              subtotal: 1000,
              vatAmount: 210,
              total: 1210,
              clientNif: "B",
              clientName: "C",
              irpfAmount: 0,
              vatOperationType: null,
              lineCount: 1,
            },
            {
              id: "rect",
              fullNumber: "R-1",
              issueDate: new Date("2026-04-01"),
              fiscalStatus: "ISSUED",
              status: "EMITIDA",
              verifactuHash: "b",
              invoiceKind: "FULL",
              invoiceFiscalType: INVOICE_FISCAL_TYPE.RECTIFYING,
              rectificationType: "R1",
              rectificationMethod: "I",
              rectifiesInvoiceId: "orig",
              seriesId: "s",
              subtotal: -200,
              vatAmount: -42,
              total: -242,
              clientNif: "B",
              clientName: "C",
              irpfAmount: 0,
              vatOperationType: null,
              lineCount: 1,
            },
          ],
        })
      );
      assert.ok(checks.some((c) => c.id === "rectifications_303_390" && c.passed));
    });
  });

  describe("Obligaciones y gate", () => {
    it("EXEMPT 390 → obligation EXEMPT", () => {
      const statuses = runObligationChecks(
        emptyCtx({
          mode: "annual",
          quarter: null,
          model390: {
            filingObligation: { status: "EXEMPT", reasons: [], warnings: [], requiresLastPeriodAnnualInfo: false },
          } as FiscalHealthContext["model390"],
        }),
        []
      ).modelStatuses;
      assert.ok(statuses.some((s) => s.model === "390" && s.obligation === "EXEMPT"));
    });

    it("blocker cadena 303 bloquea gate", () => {
      const blocker = {
        code: "MODEL303_CHAIN_CARRY_BREAK",
        fingerprint: "x",
        severity: "ERROR" as const,
        blocksFiling: true,
        title: "Cadena rota",
        description: "",
        model: "303" as const,
        year: 2026,
        quarter: 2 as const,
      };
      const { status } = resolveHealthStatus([blocker]);
      const gate = evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "303"
      );
      assert.equal(gate.allowed, false);
    });
  });

  describe("Gastos ↔ 303", () => {
    it("investment double count → issue", () => {
      const trace303 = {
        box28: [
          {
            sourceType: "expense" as const,
            sourceId: "e1",
            description: "X",
            vatKind: "DOMESTIC" as const,
            base: 100,
            boxCodes: ["28", "29"],
          },
        ],
        box30: [
          {
            sourceType: "expense" as const,
            sourceId: "e1",
            description: "X",
            vatKind: "DOMESTIC" as const,
            base: 100,
            boxCodes: ["30", "31"],
          },
        ],
      };
      const chain303 = {
        1: { boxes: [], result: 0, trace303: {} },
        2: { boxes: [], result: 0, trace303 },
        3: { boxes: [], result: 0, trace303: {} },
        4: { boxes: [], result: 0, trace303: {} },
      } as Record<1 | 2 | 3 | 4, ModeloBoxes>;
      const { issues } = runExpenses303Checks(
        emptyCtx({
          chain303,
          quarter: 2,
          expensesYear: [
            {
              id: "e1",
              issueDate: new Date("2026-04-01"),
              supplierName: "X",
              supplierNif: null,
              category: "OTROS",
              vatOperationType: "INTERIOR",
              subtotal: 100,
              vatAmount: 21,
              total: 121,
              vatDeductiblePct: 100,
              irpfDeductiblePct: 100,
              isInvestment: false,
              practicedWithholdingStatus: "UNKNOWN",
              documentId: null,
              importDuaBase: null,
              importDuaVat: null,
              importDuaNumber: null,
              importDuaDate: null,
              importDuaDocumentId: null,
              invoiceNumber: null,
            },
          ],
        })
      );
      assert.ok(issues.some((i) => i.code === "EXPENSE_INVESTMENT_DOUBLE_303"));
    });
  });
});
