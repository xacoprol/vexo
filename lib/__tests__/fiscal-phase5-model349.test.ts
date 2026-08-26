import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregate349Period,
  collect349ExpenseLines,
  collect349InvoiceLines,
  collect349MarketplaceLines,
  group349Operations,
  type Model349ExpenseRow,
  type Model349InvoiceRow,
  type Model349MarketplaceRow,
} from "../modelo-349/aggregate";
import {
  purchaseKindTo349Key,
  resolve349KeyFromPurchase,
  resolve349KeyFromSale,
  salesKindTo349Key,
} from "../modelo-349/keys";
import {
  MODEL349_PERIODICITY_THRESHOLD,
  resolve349Periodicity,
} from "../modelo-349/periodicity";
import { resolve349Deadline } from "../modelo-349/deadlines";
import { resolve349FilingPeriods } from "../modelo-349/filing-periods";
import {
  build349Rectifications,
  build349PresentedSnapshot,
  parse349PresentedSnapshot,
} from "../modelo-349/rectifications";
import { resolveEuVatId } from "../modelo-349/vat-id";
import { compare349PresentedVsDraft } from "../modelo-349/presentation";
import type { Model349Result } from "../modelo-349/types";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function invoiceRow(opts: Partial<Model349InvoiceRow> & { subtotal: number }): Model349InvoiceRow {
  return {
    id: opts.id ?? "inv1",
    fullNumber: opts.fullNumber ?? "F2026-001",
    issueDate: opts.issueDate ?? new Date("2026-02-10"),
    subtotal: opts.subtotal,
    vatOperationType: opts.vatOperationType ?? "INTRACOMUNITARIA",
    invoiceFiscalType: opts.invoiceFiscalType ?? "NORMAL",
    rectifiesInvoiceId: opts.rectifiesInvoiceId ?? null,
    rectificationMethod: opts.rectificationMethod ?? null,
    substitutionCorrectSubtotal: opts.substitutionCorrectSubtotal ?? null,
    client: opts.client ?? {
      name: "Cliente FR",
      nif: "FR12345678901",
      countryCode: "FR",
    },
  };
}

function expenseRow(opts: Partial<Model349ExpenseRow> & { subtotal: number }): Model349ExpenseRow {
  return {
    id: opts.id ?? "exp1",
    issueDate: opts.issueDate ?? new Date("2026-02-12"),
    subtotal: opts.subtotal,
    vatOperationType: opts.vatOperationType ?? "SERVICIO_INTRACOMUNITARIO",
    supplierName: opts.supplierName ?? "Adobe Ireland",
    supplierNif: opts.supplierNif ?? "IE6364992H",
    description: opts.description ?? null,
  };
}

describe("Fase 5 — Modelo 349", () => {
  describe("Claves E/A/S/I", () => {
    it("EU_GOODS venta → E", () => {
      assert.equal(resolve349KeyFromSale("INTRACOMUNITARIA"), "E");
      assert.equal(salesKindTo349Key("EU_DELIVERY"), "E");
    });

    it("EU_GOODS compra → A", () => {
      assert.equal(resolve349KeyFromPurchase("INTRACOMUNITARIA"), "A");
      assert.equal(purchaseKindTo349Key("EU_GOODS"), "A");
    });

    it("EU_SERVICES venta → S", () => {
      assert.equal(resolve349KeyFromSale("SERVICIO_INTRACOMUNITARIO"), "S");
      assert.equal(salesKindTo349Key("EU_SERVICE"), "S");
    });

    it("EU_SERVICES compra → I", () => {
      assert.equal(resolve349KeyFromPurchase("SERVICIO_INTRACOMUNITARIO"), "I");
      assert.equal(purchaseKindTo349Key("EU_SERVICES"), "I");
    });
  });

  describe("Agrupación operador + clave", () => {
    it("3 gastos mismo operador + I → 1 registro agregado", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      const warnings: import("../modelo-349/types").Model349Warning[] = [];
      const rows = [
        expenseRow({ id: "e1", subtotal: 100 }),
        expenseRow({ id: "e2", subtotal: 200 }),
        expenseRow({ id: "e3", subtotal: 50 }),
      ];
      const { lines } = collect349ExpenseLines(rows, from, to, warnings);
      const ops = group349Operations(lines);
      assert.equal(ops.length, 1);
      assert.equal(ops[0].key, "I");
      assert.equal(ops[0].amount, 350);
      assert.equal(ops[0].trace.length, 3);
    });

    it("mismo operador A + I → 2 registros diferentes", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      const warnings: import("../modelo-349/types").Model349Warning[] = [];
      const goods = expenseRow({
        id: "g1",
        subtotal: 500,
        vatOperationType: "INTRACOMUNITARIA",
        supplierNif: "DE123456789",
        supplierName: "Proveedor X",
      });
      const services = expenseRow({
        id: "s1",
        subtotal: 860,
        vatOperationType: "SERVICIO_INTRACOMUNITARIO",
        supplierNif: "DE123456789",
        supplierName: "Proveedor X",
      });
      const { lines: l1 } = collect349ExpenseLines([goods], from, to, warnings);
      const { lines: l2 } = collect349ExpenseLines([services], from, to, warnings);
      const ops = group349Operations([...l1, ...l2]);
      assert.equal(ops.length, 2);
      assert.deepEqual(
        ops.map((o) => o.key).sort(),
        ["A", "I"]
      );
    });
  });

  describe("VAT ID", () => {
    it("sin VAT ID necesario → warning EU_VAT_ID_MISSING", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      const warnings: import("../modelo-349/types").Model349Warning[] = [];
      const row = expenseRow({ subtotal: 100, supplierNif: "" });
      const { lines, skippedMissingVatId } = collect349ExpenseLines(
        [row],
        from,
        to,
        warnings
      );
      assert.equal(lines.length, 0);
      assert.equal(skippedMissingVatId, 1);
      assert.equal(warnings[0]?.code, "EU_VAT_ID_MISSING");
    });

    it("resolveEuVatId normaliza y conserva país", () => {
      const r = resolveEuVatId("ie 6364992h");
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.vatId, "IE6364992H");
        assert.equal(r.country, "IE");
      }
    });
  });

  describe("Exclusiones", () => {
    it("servicio no UE → fuera", () => {
      const agg = aggregate349Period({
        invoices: [],
        expenses: [
          expenseRow({
            subtotal: 900,
            vatOperationType: "SERVICIO_EXTRACOMUNITARIO",
            supplierNif: "US123",
          }),
        ],
        marketplace: [],
        year: 2026,
        quarter: 1,
      });
      assert.equal(agg.operations.length, 0);
    });

    it("export venta → fuera", () => {
      const agg = aggregate349Period({
        invoices: [
          invoiceRow({
            subtotal: 500,
            vatOperationType: "EXPORTACION",
            client: { name: "US Co", nif: "US999", countryCode: "US" },
          }),
        ],
        expenses: [],
        marketplace: [],
        year: 2026,
        quarter: 1,
      });
      assert.equal(agg.operations.length, 0);
    });

    it("venta B2C OSS marketplace → no se incluye silenciosamente", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-03-31");
      const warnings: import("../modelo-349/types").Model349Warning[] = [];
      const mkt: Model349MarketplaceRow = {
        id: "m1",
        issueDate: new Date("2026-02-01"),
        subtotal: 120,
        vatStatus: "MARKETPLACE_COLLECTED",
        shipToCountry: "FR",
        channel: "AMAZON",
        orderId: "ORD-1",
        invoiceId: null,
      };
      const lines = collect349MarketplaceLines([mkt], from, to, warnings);
      assert.equal(lines.length, 0);
      assert.ok(
        warnings.some((w) => w.code === "MARKETPLACE_349_REVIEW_REQUIRED")
      );
    });
  });

  describe("Periodicidad umbral 50k (solo E+S)", () => {
    it("histórico bajo 50.000 → trimestral", () => {
      const map = new Map<string, number>([
        ["2026:1", 10000],
        ["2025:4", 20000],
        ["2025:3", 15000],
        ["2025:2", 5000],
        ["2025:1", 8000],
      ]);
      const r = resolve349Periodicity({
        referenceYear: 2026,
        referenceQuarter: 1,
        quarterTotals: map,
      });
      assert.equal(r.periodicity, "QUARTERLY");
      assert.equal(r.monthlyRegimeReason, null);
    });

    it("E=30k + S=15k (=45k) con A/I altas → trimestral (A/I no computan)", () => {
      const map = new Map<string, number>([["2026:1", 45000]]);
      const r = resolve349Periodicity({
        referenceYear: 2026,
        referenceQuarter: 1,
        quarterTotals: map,
      });
      assert.equal(r.periodicity, "QUARTERLY");
      assert.ok(r.thresholdContext.operationsIncluded.includes("E+S"));
      assert.ok(r.thresholdContext.operationsIncluded.includes("A/I no computan"));
    });

    it("A/I altas con E/S=0 → no supera umbral", () => {
      const map = new Map<string, number>([["2026:1", 0]]);
      const r = resolve349Periodicity({
        referenceYear: 2026,
        referenceQuarter: 1,
        quarterTotals: map,
      });
      assert.equal(r.periodicity, "QUARTERLY");
    });

    it("E=40k + S=11k (=51k) → mensual", () => {
      const map = new Map<string, number>([["2026:1", 51000]]);
      const r = resolve349Periodicity({
        referenceYear: 2026,
        referenceQuarter: 1,
        quarterTotals: map,
      });
      assert.equal(r.periodicity, "MONTHLY");
      assert.equal(r.monthlyRegimeReason, "REFERENCE_QUARTER_EXCEEDED");
    });

    it("trimestre actual supera 50.000 → mensual", () => {
      const map = new Map<string, number>([
        ["2026:2", MODEL349_PERIODICITY_THRESHOLD + 1],
        ["2026:1", 1000],
        ["2025:4", 1000],
        ["2025:3", 1000],
        ["2025:2", 1000],
      ]);
      const r = resolve349Periodicity({
        referenceYear: 2026,
        referenceQuarter: 2,
        quarterTotals: map,
      });
      assert.equal(r.periodicity, "MONTHLY");
    });

    it("uno de los cuatro trimestres anteriores supera → mensual", () => {
      const map = new Map<string, number>([
        ["2026:1", 1000],
        ["2025:4", 1000],
        ["2025:3", MODEL349_PERIODICITY_THRESHOLD + 500],
        ["2025:2", 1000],
        ["2025:1", 1000],
      ]);
      const r = resolve349Periodicity({
        referenceYear: 2026,
        referenceQuarter: 1,
        quarterTotals: map,
      });
      assert.equal(r.periodicity, "MONTHLY");
      assert.equal(r.monthlyRegimeReason, "PRIOR_QUARTER_EXCEEDED");
    });
  });

  describe("Trimestre truncado", () => {
    it("supera en enero → truncado ene + mensual feb + mensual mar", () => {
      const periods = resolve349FilingPeriods({
        year: 2026,
        quarter: 1,
        periodicity: "MONTHLY",
        monthlyRegimeReason: "REFERENCE_QUARTER_EXCEEDED",
        monthlyOutputAmounts: [51000, 0, 0],
      });
      assert.equal(periods.length, 3);
      assert.equal(periods[0].kind, "QUARTERLY_TRUNCATED");
      assert.equal(periods[0].endMonth, 1);
      assert.equal(periods[1].kind, "MONTHLY");
      assert.equal(periods[1].endMonth, 2);
      assert.equal(periods[2].kind, "MONTHLY");
      assert.equal(periods[2].endMonth, 3);
    });

    it("supera en febrero → truncado ene–feb + mensual mar", () => {
      const periods = resolve349FilingPeriods({
        year: 2026,
        quarter: 1,
        periodicity: "MONTHLY",
        monthlyRegimeReason: "REFERENCE_QUARTER_EXCEEDED",
        monthlyOutputAmounts: [30000, 22000, 0],
      });
      assert.equal(periods.length, 2);
      assert.equal(periods[0].kind, "QUARTERLY_TRUNCATED");
      assert.equal(periods[0].startMonth, 1);
      assert.equal(periods[0].endMonth, 2);
      assert.equal(periods[1].kind, "MONTHLY");
      assert.equal(periods[1].endMonth, 3);
    });

    it("supera en marzo → truncado ene–mar (único periodo)", () => {
      const periods = resolve349FilingPeriods({
        year: 2026,
        quarter: 1,
        periodicity: "MONTHLY",
        monthlyRegimeReason: "REFERENCE_QUARTER_EXCEEDED",
        monthlyOutputAmounts: [20000, 20000, 15000],
      });
      assert.equal(periods.length, 1);
      assert.equal(periods[0].kind, "QUARTERLY_TRUNCATED");
      assert.equal(periods[0].endMonth, 3);
    });

    it("mensual por trimestre anterior → 3 mensuales sin truncado", () => {
      const periods = resolve349FilingPeriods({
        year: 2026,
        quarter: 1,
        periodicity: "MONTHLY",
        monthlyRegimeReason: "PRIOR_QUARTER_EXCEEDED",
        monthlyOutputAmounts: [10000, 10000, 10000],
      });
      assert.equal(periods.length, 3);
      assert.ok(periods.every((p) => p.kind === "MONTHLY"));
    });
  });

  describe("Plazos 349", () => {
    function dueParts(d: Date) {
      return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear() };
    }

    it("1T trimestral → 20 abril", () => {
      const d = resolve349Deadline({
        kind: "QUARTERLY",
        year: 2026,
        quarter: 1,
        startMonth: 1,
        endMonth: 3,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 20);
      assert.equal(p.month, 3);
      assert.equal(p.year, 2026);
    });

    it("2T trimestral → 20 julio", () => {
      const d = resolve349Deadline({
        kind: "QUARTERLY",
        year: 2026,
        quarter: 2,
        startMonth: 4,
        endMonth: 6,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 20);
      assert.equal(p.month, 6);
    });

    it("3T trimestral → 20 octubre", () => {
      const d = resolve349Deadline({
        kind: "QUARTERLY",
        year: 2026,
        quarter: 3,
        startMonth: 7,
        endMonth: 9,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 20);
      assert.equal(p.month, 9);
    });

    it("4T trimestral → 30 enero año siguiente", () => {
      const d = resolve349Deadline({
        kind: "QUARTERLY",
        year: 2029,
        quarter: 4,
        startMonth: 10,
        endMonth: 12,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 30);
      assert.equal(p.month, 0);
      assert.equal(p.year, 2030);
    });

    it("mensual normal (febrero) → 20 marzo", () => {
      const d = resolve349Deadline({
        kind: "MONTHLY",
        year: 2026,
        quarter: 1,
        startMonth: 2,
        endMonth: 2,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 20);
      assert.equal(p.month, 2);
    });

    it("julio mensual → 20 septiembre", () => {
      const d = resolve349Deadline({
        kind: "MONTHLY",
        year: 2024,
        quarter: 3,
        startMonth: 7,
        endMonth: 7,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 20);
      assert.equal(p.month, 8);
    });

    it("diciembre mensual → 30 enero año siguiente", () => {
      const d = resolve349Deadline({
        kind: "MONTHLY",
        year: 2029,
        quarter: 4,
        startMonth: 12,
        endMonth: 12,
      });
      const p = dueParts(d.dueDate);
      assert.equal(p.day, 30);
      assert.equal(p.month, 0);
      assert.equal(p.year, 2030);
    });

    it("incluye scopeNote sobre inhábiles AEAT", () => {
      const d = resolve349Deadline({
        kind: "QUARTERLY",
        year: 2026,
        quarter: 1,
        startMonth: 1,
        endMonth: 3,
      });
      assert.ok(d.scopeNote.includes("inhábiles"));
    });
  });

  describe("Rectificaciones 349", () => {
    it("operación 1000, rectificación -200 → registro con importe correcto 800", () => {
      const original = invoiceRow({
        id: "orig",
        subtotal: 1000,
        issueDate: new Date("2026-01-15"),
      });
      const rectifier = invoiceRow({
        id: "rect",
        subtotal: -200,
        invoiceFiscalType: "RECTIFYING",
        rectifiesInvoiceId: "orig",
        rectificationMethod: "DIFFERENCES",
        issueDate: new Date("2026-04-05"),
      });
      const warnings: import("../modelo-349/types").Model349Warning[] = [];
      const snapshot = build349PresentedSnapshot({
        periodicity: "QUARTERLY",
        operations: [
          {
            vatId: "FR12345678901",
            country: "FR",
            operatorName: "Cliente FR",
            key: "E",
            amount: 1000,
            trace: [],
          },
        ],
        rectifications: [],
      });
      const rects = build349Rectifications({
        rectifyingInvoices: [rectifier],
        originalsById: new Map([["orig", original]]),
        presentedFilings: [
          {
            year: 2026,
            quarter: 1,
            boxes: [{ code: "E", value: 1000 }],
            rawExtract: { model349Snapshot: snapshot },
          },
        ],
        filingPeriodYear: 2026,
        filingPeriodQuarter: 2,
        warnings,
      });
      assert.equal(rects.length, 1);
      assert.equal(rects[0].previousAmount, 1000);
      assert.equal(rects[0].correctedAmount, 800);
      assert.equal(rects[0].delta, -200);
      assert.equal(rects[0].needsReview, false);
      assert.equal(rects[0].originalPeriod, "1T 2026");
      assert.equal(rects[0].filingPeriod, "2T 2026");
    });

    it("sin histórico → PRIOR_349_DATA_MISSING", () => {
      const original = invoiceRow({
        id: "orig",
        subtotal: 1000,
        issueDate: new Date("2026-01-15"),
      });
      const rectifier = invoiceRow({
        id: "rect",
        subtotal: -200,
        invoiceFiscalType: "RECTIFYING",
        rectifiesInvoiceId: "orig",
        issueDate: new Date("2026-04-05"),
      });
      const warnings: import("../modelo-349/types").Model349Warning[] = [];
      const rects = build349Rectifications({
        rectifyingInvoices: [rectifier],
        originalsById: new Map([["orig", original]]),
        presentedFilings: [],
        filingPeriodYear: 2026,
        filingPeriodQuarter: 2,
        warnings,
      });
      assert.equal(rects[0].needsReview, true);
      assert.equal(rects[0].reviewCode, "PRIOR_349_DATA_MISSING");
      assert.ok(warnings.some((w) => w.code === "PRIOR_349_DATA_MISSING"));
    });
  });

  describe("Histórico filing presentado", () => {
    it("snapshot parseado no cambia al recalcular motor distinto", () => {
      const snapshot = build349PresentedSnapshot({
        periodicity: "QUARTERLY",
        operations: [
          {
            vatId: "IE6364992H",
            country: "IE",
            operatorName: "Adobe",
            key: "I",
            amount: 860,
            trace: [],
          },
        ],
        rectifications: [],
      });
      const parsed = parse349PresentedSnapshot({ model349Snapshot: snapshot });
      assert.ok(parsed);
      assert.equal(parsed?.operations[0].amount, 860);

      const presented = {
        result: 860,
        incomeBase: null,
        expensesBase: null,
        vatRepercutida: null,
        vatDeductible: null,
        boxes: [{ code: "I", label: "Servicios", value: 860 }],
        sourceFileName: null,
        notes: null,
        year: 2026,
        quarter: 1,
        modelType: "349",
        rawExtract: { model349Snapshot: snapshot },
      };

      const draftEngine: Model349Result = {
        year: 2026,
        quarter: 1,
        label: "1T 2026",
        periodicity: "QUARTERLY",
        monthlyRegimeReason: null,
        thresholdContext: {
          threshold: 50000,
          referenceQuarterKey: "2026:1",
          referenceQuarterAmount: 9999,
          priorQuarterAmounts: [],
          monthlyRegimeReason: null,
          operationsIncluded: "test",
        },
        filingPeriods: [],
        deadline: {
          dueDate: new Date(),
          dueLabel: "test",
          periodicity: "QUARTERLY",
          periodLabel: "1T 2026",
          scopeNote: "test",
        },
        operations: [
          {
            vatId: "IE6364992H",
            country: "IE",
            operatorName: "Adobe",
            key: "I",
            amount: 999,
            trace: [],
          },
        ],
        rectifications: [],
        warnings: [],
        totalsByKey: { I: 999 },
        totalOperations: 999,
        hasOps: true,
        incompleteVatId: false,
        needsAttention: true,
        skippedMissingVatId: 0,
        skippedMissingVatIdEntregas: 0,
        skippedMissingVatIdAdquisiciones: 0,
      };

      const cmp = compare349PresentedVsDraft(draftEngine, presented);
      assert.equal(cmp.presentedHasDetail, true);
      const row = cmp.rows.find((r) => r.vatId === "IE6364992H");
      assert.equal(row?.presentedAmount, 860);
      assert.equal(row?.draftAmount, 999);
      assert.equal(row?.status, "amount_diff");
      assert.equal(parsed?.operations[0].amount, 860);
    });
  });

  describe("Trazabilidad Adobe Ireland 860 € clave I", () => {
    it("responde con desglose de facturas", () => {
      const agg = aggregate349Period({
        invoices: [],
        expenses: [
          expenseRow({ id: "a1", subtotal: 100, supplierName: "Adobe Ireland" }),
          expenseRow({ id: "a2", subtotal: 200, supplierName: "Adobe Ireland" }),
          expenseRow({ id: "a3", subtotal: 560, supplierName: "Adobe Ireland" }),
        ],
        marketplace: [],
        year: 2026,
        quarter: 1,
      });
      const op = agg.operations.find((o) => o.key === "I");
      assert.ok(op);
      assert.equal(op?.amount, 860);
      assert.equal(op?.trace.length, 3);
      assert.equal(round2(op!.trace.reduce((s, t) => s + t.base, 0)), 860);
    });
  });
});
