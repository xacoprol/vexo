import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildModel130Chain } from "../modelo-130/engine";
import { computeHardToJustifyExpense } from "../modelo-130/simplified-hard-to-justify";
import { assess130FilingObligation } from "../modelo-130/filing-obligation";
import type { Model130Config, Model130TraceLine } from "../modelo-130/types";
import { runPracticedWithholdingChecks } from "../fiscal-health/withholding-checks";
import type { FiscalHealthContext } from "../fiscal-health/context";
import { PRACTICED_WITHHOLDING_STATUS } from "../fiscal-withholding/types";
import { parsePurchaseVatKind } from "../modelo-303/vat-classification";
import { resolve349KeyFromPurchase } from "../modelo-349/keys";
import {
  normalizeShipToCountry,
  parseShopifyIvaSummaryDraft,
  marketplaceRowHasInvalidCountry,
} from "../shopify-sales-report";
import { aggregateModel303Period } from "../modelo-303/aggregate";
import { parseExpenseVatOperationType } from "../fiscal";

const emptyLines: Model130TraceLine[] = [];

const simplifiedBusinessConfig: Model130Config = {
  irpfDirectEstimationMode: "SIMPLIFIED",
  previousYearNetIncomeMode: "UNKNOWN",
  previousYearNetIncomeFor130Reduction: null,
  irpf130HousingDeduction: "NO",
  agriculturalActivities130: "NONE",
  irregularIncome130Status: "NONE",
  fiscalRegime: "130",
  activityKind130: "BUSINESS",
  priorYearWithholdingPct130: 0,
  activityStartYear: 2024,
  hasCashAccountingInvoices: false,
  paymentRate: 0.2,
};

function quarterData(opts: { income: number; expenses: number }) {
  return {
    incomeBase: opts.income,
    ordinaryExpenseBase: opts.expenses,
    amortizationYtd: 0,
    irpfWithheld: 0,
    incomeLines: emptyLines,
    expenseLines: emptyLines,
    amortizationLines: emptyLines,
    withholdingLines: emptyLines,
  };
}

function emptyHealthCtx(
  over: Partial<FiscalHealthContext> = {}
): FiscalHealthContext {
  return {
    year: 2026,
    settings: {} as FiscalHealthContext["settings"],
    census: {} as FiscalHealthContext["census"],
    invoicesYear: [],
    expensesYear: [],
    marketplaceYear: [],
    practicedWithholdingsYear: [],
    sufferedWithholdingsYear: [],
    leases: [],
    assets: [],
    filings: [],
    ...over,
  } as FiscalHealthContext;
}

describe("Fase 4.1B — SIMPLIFIED HTJ YTD", () => {
  it("coeficiente YTD 5 % cuadra con evidencia gestoría (no hardcode en motor)", () => {
    const income = 21785.72;
    const ordinary = 14096.19;
    const htj = computeHardToJustifyExpense({
      incomeBase: income,
      ordinaryExpenseBase: ordinary,
      amortizationYtd: 0,
      hardToJustifyUsedEarlierInYear: 2000,
    });
    assert.equal(htj.amount, 384.48);
    assert.equal(
      Math.round((income - ordinary - htj.amount) * 100) / 100,
      7305.05
    );
  });

  it("tras tocar tope anual, T posteriores conservan HTJ YTD en cas.02", () => {
    const chain = buildModel130Chain({
      year: 2026,
      config: simplifiedBusinessConfig,
      presented: {},
      quarters: {
        1: quarterData({ income: 50000, expenses: 0 }),
        2: quarterData({ income: 60000, expenses: 0 }),
        3: quarterData({ income: 70000, expenses: 0 }),
        4: quarterData({ income: 80000, expenses: 0 }),
      },
    });
    assert.equal(chain[1].hardToJustifyAmount, 2000);
    assert.equal(chain[2].hardToJustifyAmount, 2000);
    assert.equal(chain[2].boxes.box02, 2000);
    assert.equal(chain[3].hardToJustifyAmount, 2000);
  });
});

describe("Fase 4.1B — BUSINESS vs PROFESSIONAL filing", () => {
  it("BUSINESS + inicio de actividad → REQUIRED (no UNKNOWN por tipo)", () => {
    const o = assess130FilingObligation({
      fiscalRegime: "130",
      incomeBaseYtd: 10000,
      incomeWithWithholdingYtd: 0,
      isProfessionalActivity: false,
      priorYearWithholdingPct: 0,
      activityStartYear: 2026,
      currentYear: 2026,
    });
    assert.equal(o.status, "REQUIRED");
    assert.ok(!o.reasons.some((r) => /falta confirmar tipo/i.test(r)));
  });

  it("SIMPLIFIED + BUSINESS se representan sin confundirse", () => {
    assert.equal(simplifiedBusinessConfig.irpfDirectEstimationMode, "SIMPLIFIED");
    assert.equal(simplifiedBusinessConfig.activityKind130, "BUSINESS");
  });
});

describe("Fase 4.1B — PROFESIONALES ≠ retención 111", () => {
  it("categoría PROFESIONALES + UNKNOWN no emite MODEL111_OBLIGATION_REVIEW_REQUIRED", () => {
    const { issues } = runPracticedWithholdingChecks(
      emptyHealthCtx({
        expensesYear: [
          {
            id: "e-mhg",
            issueDate: new Date("2026-05-01"),
            supplierName: "MHG CONSULTORIA",
            supplierNif: "B56902828",
            category: "PROFESIONALES",
            practicedWithholdingStatus: PRACTICED_WITHHOLDING_STATUS.UNKNOWN,
            vatOperationType: "INTERIOR",
            subtotal: 100,
            vatAmount: 21,
            total: 121,
            vatDeductiblePct: 100,
            irpfDeductiblePct: 100,
            deductible: true,
            isInvestment: false,
            leaseId: null,
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
    assert.ok(
      !issues.some((i) => i.code === "MODEL111_OBLIGATION_REVIEW_REQUIRED")
    );
  });
});

describe("Fase 4.1B — EU service vs goods", () => {
  it("SERVICIO_INTRACOMUNITARIO → EU_SERVICES / 349 I (no A)", () => {
    const op = parseExpenseVatOperationType("SERVICIO_INTRACOMUNITARIO");
    assert.equal(op, "SERVICIO_INTRACOMUNITARIO");
    assert.equal(parsePurchaseVatKind(op), "EU_SERVICES");
    assert.equal(resolve349KeyFromPurchase(op), "I");
  });

  it("INTRACOMUNITARIA bienes → EU_GOODS / 349 A", () => {
    assert.equal(parsePurchaseVatKind("INTRACOMUNITARIA"), "EU_GOODS");
    assert.equal(resolve349KeyFromPurchase("INTRACOMUNITARIA"), "A");
  });
});

describe("Fase 4.1B — Shopify SUMMARY metadata", () => {
  it('normalizeShipToCountry("IVA") → null (no es país)', () => {
    assert.equal(normalizeShipToCountry("IVA"), null);
    assert.equal(normalizeShipToCountry("Portugal"), "PT");
    assert.equal(normalizeShipToCountry("ES"), "ES");
  });

  it("Informe IVA agregado marca IMPORT_DATA_INVALID y no inventa país", () => {
    const parsed = parseShopifyIvaSummaryDraft({
      periodYear: 2026,
      periodMonth: 5,
      netSales: 578.89,
      shipping: 0,
      taxes: 136.44,
      totalSales: 715.33,
      grossSales: 578.89,
      discounts: 0,
      returns: 0,
    });
    const row = parsed.rows[0];
    assert.equal(row.shipToCountry, null);
    assert.ok(row.importFlags?.includes("IMPORT_DATA_INVALID"));
    assert.notEqual(row.shipToCountry, "IVA");
    assert.equal(parsed.summary.taxableBase, 0);
    assert.ok(marketplaceRowHasInvalidCountry(row));
  });

  it("fila TAXABLE con país IVA no entra en buckets 303", () => {
    const r = aggregateModel303Period({
      invoices: [],
      expenses: [],
      assets: [],
      marketplace: [
        {
          id: "m-iva",
          issueDate: new Date("2026-05-31"),
          subtotal: 578.89,
          vatAmount: 136.44,
          vatRate: 23,
          vatStatus: "TAXABLE",
          channel: "SHOPIFY",
          shipToCountry: "IVA",
          notes: "IMPORT_DATA_INVALID",
        },
      ],
      from: new Date("2026-04-01"),
      to: new Date("2026-06-30"),
    });
    assert.equal(r.modelo303.boxes.otherBase, 0);
    assert.equal(r.modelo303.boxes.otherQuota, 0);
    assert.equal(r.modelo303.boxes.box07, 0);
    assert.ok(
      r.modelo303.warnings.some((w) => w.code === "IMPORT_DATA_INVALID")
    );
  });

  it("23 % con país ISO PT sigue en otherQuota (no se infiere OSS aquí)", () => {
    const r = aggregateModel303Period({
      invoices: [],
      expenses: [],
      assets: [],
      marketplace: [
        {
          id: "m-pt",
          issueDate: new Date("2026-04-15"),
          subtotal: 578.89,
          vatAmount: 136.44,
          vatRate: 23,
          vatStatus: "TAXABLE",
          channel: "SHOPIFY",
          shipToCountry: "PT",
        },
      ],
      from: new Date("2026-04-01"),
      to: new Date("2026-06-30"),
    });
    assert.equal(r.modelo303.boxes.otherBase, 578.89);
    assert.equal(r.modelo303.boxes.otherQuota, 136.44);
  });
});
