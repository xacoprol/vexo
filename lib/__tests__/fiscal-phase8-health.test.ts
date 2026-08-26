import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runFiscalHealthChecks } from "../fiscal-health/checks";
import type { FiscalHealthContext } from "../fiscal-health/context";
import {
  createHealthIssue,
  healthFingerprint,
  resolveHealthStatus,
} from "../fiscal-health/issue";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { INVOICE_FISCAL_TYPE } from "../invoice-rectification";
import type { Model390Result } from "../modelo-390/types";
import type { Model347Result } from "../modelo-347";
import type { Model349Result } from "../modelo-349";
import type { FiscalPeriodSummary } from "../fiscal";

function emptyVerifactu() {
  return {
    checkedAt: new Date(),
    invoiceCount: 0,
    sealedCount: 0,
    unsealedCount: 0,
    annulledWithoutEvent: 0,
    issues: [],
  };
}

function baseContext(
  overrides: Partial<FiscalHealthContext> = {}
): FiscalHealthContext {
  const base = {
    year: 2026,
    quarter: 2,
    mode: "quarter" as const,
    queryCount: 0,
    settings: {
      nif: "B12345678",
      fiscalRegime: "130",
      verifactuMode: "VERIFACTU",
      simplifiedInvoiceMaxAmount: 400,
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
    verifactu: emptyVerifactu(),
    filingsYear: [],
  };
  const ctx = { ...base, ...overrides };
  if (overrides.invoices) ctx.invoicesYear = overrides.invoices;
  if (overrides.expenses) ctx.expensesYear = overrides.expenses;
  if (overrides.marketplace) ctx.marketplaceYear = overrides.marketplace;
  if (overrides.invoicesYear) ctx.invoices = overrides.invoicesYear;
  return ctx;
}

function mock390(overrides: Partial<Model390Result> = {}): Model390Result {
  const annual = {
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
      status: "REQUIRED",
      reasons: [],
      warnings: [],
      requiresLastPeriodAnnualInfo: false,
    },
    annualFromOperations: annual,
    annualFrom303: annual,
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
      status: "NOT_APPLICABLE",
      lastPeriodLabel: "",
      fields: [],
      warnings: [],
    },
    ...overrides,
  };
}

describe("Fase 8 — Fiscal Health Check", () => {
  describe("Estados generales", () => {
    it("sin issues → READY", () => {
      const { status } = resolveHealthStatus([]);
      assert.equal(status, "READY");
    });

    it("warning no bloqueante → READY_WITH_WARNINGS", () => {
      const { status } = resolveHealthStatus([
        createHealthIssue({
          code: "DOC",
          severity: "WARNING",
          blocksFiling: false,
          title: "Aviso",
          description: "Revisar",
        }),
      ]);
      assert.equal(status, "READY_WITH_WARNINGS");
    });

    it("error bloqueante → NOT_READY", () => {
      const { status, blockers } = resolveHealthStatus([
        createHealthIssue({
          code: "BLOCK",
          severity: "ERROR",
          blocksFiling: true,
          title: "Bloqueo",
          description: "No listo",
        }),
      ]);
      assert.equal(status, "NOT_READY");
      assert.equal(blockers.length, 1);
    });

    it("dato esencial ausente → INCOMPLETE", () => {
      const { status } = resolveHealthStatus([
        createHealthIssue({
          code: "FISCAL_DATA_INCOMPLETE",
          severity: "WARNING",
          blocksFiling: false,
          title: "NIF",
          description: "Falta NIF",
        }),
      ]);
      assert.equal(status, "INCOMPLETE");
    });
  });

  describe("Fingerprints", () => {
    it("es estable por code + source + periodo", () => {
      const a = healthFingerprint({
        code: "X",
        sourceType: "expense",
        sourceId: "e1",
        year: 2026,
        quarter: 2,
      });
      const b = healthFingerprint({
        code: "X",
        sourceType: "expense",
        sourceId: "e1",
        year: 2026,
        quarter: 2,
      });
      assert.equal(a, b);
      assert.notEqual(
        a,
        healthFingerprint({
          code: "X",
          sourceType: "expense",
          sourceId: "e2",
          year: 2026,
          quarter: 2,
        })
      );
    });
  });

  describe("Facturación", () => {
    it("ISSUED sin hash → CRITICAL", () => {
      const ctx = baseContext({
        invoices: [
          {
            id: "inv1",
            fullNumber: "2026-001",
            issueDate: new Date("2026-04-01"),
            fiscalStatus: "ISSUED",
            status: "EMITIDA",
            verifactuHash: null,
            invoiceKind: "FULL",
            invoiceFiscalType: null,
            rectificationType: null,
            rectificationMethod: null,
            rectifiesInvoiceId: null,
            seriesId: "s1",
            subtotal: 100,
            vatAmount: 21,
            total: 121,
            clientNif: "B111",
            clientName: "Cliente",
            lineCount: 1,
          },
        ],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      const hash = issues.find((i) => i.code === "ISSUED_MISSING_VERIFACTU_HASH");
      assert.ok(hash);
      assert.equal(hash!.severity, "CRITICAL");
      assert.equal(hash!.blocksFiling, true);
    });

    it("DRAFT no aparece en modelos — regresión CRITICAL", () => {
      const summary = {
        modelo303: {
          trace303: {
            box01: [
              {
                sourceType: "invoice" as const,
                sourceId: "draft-inv",
              },
            ],
          },
        },
      } as unknown as FiscalPeriodSummary;
      const ctx = baseContext({
        periodSummary: summary,
        invoices: [
          {
            id: "draft-inv",
            fullNumber: "",
            issueDate: new Date("2026-04-01"),
            fiscalStatus: "DRAFT",
            status: "BORRADOR",
            verifactuHash: null,
            invoiceKind: "FULL",
            invoiceFiscalType: null,
            rectificationType: null,
            rectificationMethod: null,
            rectifiesInvoiceId: null,
            seriesId: null,
            subtotal: 0,
            vatAmount: 0,
            total: 0,
            clientNif: null,
            clientName: null,
            lineCount: 0,
          },
        ],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      assert.ok(issues.some((i) => i.code === "DRAFT_IN_MODEL_303"));
    });

    it("rectificativa sin original → ERROR", () => {
      const ctx = baseContext({
        invoices: [
          {
            id: "r1",
            fullNumber: "2026-R1",
            issueDate: new Date("2026-05-01"),
            fiscalStatus: "ISSUED",
            status: "EMITIDA",
            verifactuHash: "abc",
            invoiceKind: "FULL",
            invoiceFiscalType: INVOICE_FISCAL_TYPE.RECTIFYING,
            rectificationType: "R1",
            rectificationMethod: "I",
            rectifiesInvoiceId: null,
            seriesId: "s1",
            subtotal: -100,
            vatAmount: -21,
            total: -121,
            clientNif: "B111",
            clientName: "Cliente",
            lineCount: 1,
          },
        ],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      assert.ok(issues.some((i) => i.code === "RECTIFYING_WITHOUT_ORIGINAL"));
    });
  });

  describe("Modelos cruzados", () => {
    it("303 = 390 → check pass", () => {
      const ctx = baseContext({
        mode: "annual",
        quarter: null,
        model390: mock390(),
      });
      const { checks } = runFiscalHealthChecks(ctx);
      assert.ok(checks.some((c) => c.id === "390_303_reconcile" && c.passed));
    });

    it("303 ≠ 390 → issue", () => {
      const ops = mock390().annualFromOperations;
      const ctx = baseContext({
        mode: "annual",
        quarter: null,
        model390: mock390({
          reconciliation: {
            status: "DIFFERENCES",
            differences: [
              {
                field: "outputVat",
                label: "IVA devengado",
                operationsAmount: 1000,
                from303Amount: 900,
                delta: 100,
              },
            ],
          },
          annualFromOperations: ops,
          annualFrom303: {
            ...ops,
            outputVat: 900,
          },
        }),
      });
      const { issues } = runFiscalHealthChecks(ctx);
      assert.ok(issues.some((i) => i.code === "MODEL390_RECONCILIATION_DIFF"));
    });

    it("operación 347 también 349 → issue", () => {
      const draft347 = {
        declarableOperators: [
          {
            operatorId: "op1",
            taxId: "IE123",
            name: "Adobe Ireland",
            country: "IE",
            operationType: "A" as const,
            annualAmount: 5000,
            quarters: { q1: 0, q2: 5000, q3: 0, q4: 0 },
            trace: [
              {
                sourceType: "expense" as const,
                sourceId: "exp-ue",
                label: "Adobe",
                issueDate: "2026-04-01",
                amount: 5000,
                quarter: 2 as const,
                href: "/fiscal/expenses/exp-ue/edit",
              },
            ],
            declarable: true,
          },
        ],
        warnings: [],
        requiresReview: false,
      } as Model347Result;

      const draft349: Model349Result = {
        year: 2026,
        quarter: 2,
        hasOps: true,
        operations: [
          {
            vatId: "IE123",
            country: "IE",
            operatorName: "Adobe Ireland",
            key: "A",
            amount: 5000,
            trace: [
              {
                sourceType: "expense",
                sourceId: "exp-ue",
                label: "Adobe",
                issueDate: "2026-04-01",
                base: 5000,
              },
            ],
          },
        ],
        warnings: [],
        incompleteVatId: false,
        rectifications: [],
        filingPeriod: {
          kind: "QUARTERLY",
          year: 2026,
          quarter: 2,
          startMonth: 4,
          endMonth: 6,
          label: "2T 2026",
          deadline: { date: "2026-07-20", label: "20 jul" },
        },
        periodicity: "QUARTERLY",
        monthlyRegimeReason: null,
        needsAttention: true,
      };

      const ctx = baseContext({
        mode: "annual",
        quarter: null,
        draft347,
        draft349Year: [draft349],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      assert.ok(issues.some((i) => i.code === "MODEL347_349_DUPLICATE"));
    });

    it("DUA 303 = 390 → pass", () => {
      const ctx = baseContext({
        mode: "annual",
        quarter: null,
        model390: mock390(),
      });
      const { checks } = runFiscalHealthChecks(ctx);
      assert.ok(checks.some((c) => c.id === "dua_303_390_match" && c.passed));
    });
  });

  describe("Marketplace", () => {
    it("invoiceId vinculado a ISSUED → doble cómputo ERROR", () => {
      const ctx = baseContext({
        marketplace: [
          {
            id: "mp1",
            issueDate: new Date("2026-04-01"),
            channel: "amazon",
            subtotal: 100,
            vatStatus: "DOMESTIC",
            invoiceId: "inv-linked",
            orderId: "ORD-1",
          },
        ],
        invoices: [
          {
            id: "inv-linked",
            fullNumber: "2026-010",
            issueDate: new Date("2026-04-01"),
            fiscalStatus: "ISSUED",
            status: "EMITIDA",
            verifactuHash: "hash",
            invoiceKind: "FULL",
            invoiceFiscalType: null,
            rectificationType: null,
            rectificationMethod: null,
            rectifiesInvoiceId: null,
            seriesId: "s1",
            subtotal: 100,
            vatAmount: 21,
            total: 121,
            clientNif: null,
            clientName: "Amazon",
            lineCount: 1,
          },
        ],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      assert.ok(issues.some((i) => i.code === "MARKETPLACE_DOUBLE_COUNT"));
    });

    it("fila sin clasificación → warning", () => {
      const ctx = baseContext({
        marketplace: [
          {
            id: "mp2",
            issueDate: new Date("2026-04-01"),
            channel: "shopify",
            subtotal: 50,
            vatStatus: null,
            invoiceId: null,
            orderId: null,
          },
        ],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      const w = issues.find((i) => i.code === "MARKETPLACE_UNCLASSIFIED");
      assert.ok(w);
      assert.equal(w!.severity, "WARNING");
    });
  });

  describe("Filings", () => {
    it("legacy sin snapshot → INFO no crítico", () => {
      const ctx = baseContext({
        filingsYear: [
          {
            id: "f1",
            modelType: "347",
            year: 2026,
            quarter: null,
            rawExtract: { source: "manual" },
          },
        ] as FiscalHealthContext["filingsYear"],
      });
      const { issues } = runFiscalHealthChecks(ctx);
      const leg = issues.find((i) => i.code === "LEGACY_FILING_LIMITED_AUDIT");
      assert.ok(leg);
      assert.equal(leg!.severity, "INFO");
      assert.equal(leg!.blocksFiling, false);
    });
  });

  describe("Pre-filing gate", () => {
    it("READY → allowed", () => {
      const gate = evaluateFilingGateFromHealth(
        { status: "READY", blockers: [], issues: [] },
        "303"
      );
      assert.equal(gate.allowed, true);
    });

    it("READY_WITH_WARNINGS → allowed", () => {
      const gate = evaluateFilingGateFromHealth(
        {
          status: "READY_WITH_WARNINGS",
          blockers: [],
          issues: [
            createHealthIssue({
              code: "W",
              severity: "WARNING",
              blocksFiling: false,
              title: "Aviso",
              description: "",
            }),
          ],
        },
        "303"
      );
      assert.equal(gate.allowed, true);
    });

    it("NOT_READY con blocker → not allowed", () => {
      const blocker = createHealthIssue({
        code: "BLOCK",
        severity: "ERROR",
        blocksFiling: true,
        title: "Bloqueo 303",
        description: "",
        model: "303",
      });
      const gate = evaluateFilingGateFromHealth(
        {
          status: "NOT_READY",
          blockers: [blocker],
          issues: [blocker],
        },
        "303"
      );
      assert.equal(gate.allowed, false);
    });

    it("INCOMPLETE → not allowed", () => {
      const gate = evaluateFilingGateFromHealth(
        { status: "INCOMPLETE", blockers: [], issues: [] },
        "303"
      );
      assert.equal(gate.allowed, false);
    });
  });
});
