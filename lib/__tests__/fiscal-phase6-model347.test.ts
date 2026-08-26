import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregate347Year,
  collect347ExpenseLines,
  collect347InvoiceLines,
  type Model347ExpenseRow,
  type Model347InvoiceRow,
} from "../modelo-347/aggregate";
import {
  assess347PurchaseEligibility,
  assess347SaleEligibility,
} from "../modelo-347/eligibility";
import {
  compute347CashAccountingAmounts,
} from "../modelo-347/cash-accounting";
import { resolve347Deadline } from "../modelo-347/deadlines";
import { resolve347Operator } from "../modelo-347/operator";
import {
  compute347RectificationAmount,
} from "../modelo-347/rectification";
import {
  build347PresentedSnapshot,
  compare347PresentedVsDraft,
  parse347PresentedSnapshot,
} from "../modelo-347/presentation";
import {
  exceeds347Threshold,
  MODEL_347_THRESHOLD,
} from "../modelo-347/threshold";
import type { Model347Result } from "../modelo-347/types";

function invoiceRow(opts: Partial<Model347InvoiceRow> & { total: number }): Model347InvoiceRow {
  return {
    id: opts.id ?? "inv1",
    fullNumber: opts.fullNumber ?? "F2026-001",
    issueDate: opts.issueDate ?? new Date("2026-02-10"),
    total: opts.total,
    status: opts.status ?? "PENDIENTE",
    fiscalStatus: opts.fiscalStatus ?? "ISSUED",
    vatOperationType: opts.vatOperationType ?? "SUJETA",
    invoiceFiscalType: opts.invoiceFiscalType ?? "NORMAL",
    client: opts.client ?? {
      id: "c1",
      name: "Cliente ES",
      nif: "B12345678",
      countryCode: "ES",
    },
    cashAccounting: opts.cashAccounting ?? false,
    paymentMethod: opts.paymentMethod ?? null,
    operationKey347: opts.operationKey347 ?? "B",
    rectifiesInvoiceId: opts.rectifiesInvoiceId ?? null,
    rectificationMethod: opts.rectificationMethod ?? null,
    substitutionCorrectTotal: opts.substitutionCorrectTotal ?? null,
    payments: opts.payments ?? [],
  };
}

function expenseRow(opts: Partial<Model347ExpenseRow> & { total: number }): Model347ExpenseRow {
  return {
    id: opts.id ?? "exp1",
    issueDate: opts.issueDate ?? new Date("2026-03-15"),
    total: opts.total,
    vatOperationType: opts.vatOperationType ?? "INTERIOR",
    supplierName: opts.supplierName ?? "Proveedor X",
    supplierNif: opts.supplierNif ?? "B87654321",
  };
}

describe("Fase 6 — Modelo 347", () => {
  describe("Umbral 3.005,06 €", () => {
    it("3000 € → fuera (no supera umbral)", () => {
      assert.equal(exceeds347Threshold(3000), false);
    });

    it("3005,06 € exacto → fuera (superior a, no ≥)", () => {
      assert.equal(exceeds347Threshold(3005.06), false);
    });

    it("3005,07 € → dentro", () => {
      assert.equal(exceeds347Threshold(3005.07), true);
    });

    it("constante centralizada", () => {
      assert.equal(MODEL_347_THRESHOLD, 3005.06);
    });
  });

  describe("Agrupación anual", () => {
    it("varias facturas mismo NIF → una fila", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({ id: "i1", total: 2000, issueDate: new Date("2026-01-10") }),
          invoiceRow({ id: "i2", total: 1500, issueDate: new Date("2026-06-10") }),
        ],
        expenses: [],
        marketplace: [],
      });
      const op = agg.declarableOperators.find((o) => o.taxId === "B12345678");
      assert.ok(op);
      assert.equal(op?.annualAmount, 3500);
      assert.equal(op?.trace.length, 2);
    });
  });

  describe("Desglose trimestral", () => {
    it("operaciones Q1/Q2/Q3/Q4 → desglose correcto", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({ id: "q1", total: 1000, issueDate: new Date("2026-01-15") }),
          invoiceRow({ id: "q2", total: 1500, issueDate: new Date("2026-05-15") }),
          invoiceRow({ id: "q3", total: 800, issueDate: new Date("2026-08-15") }),
          invoiceRow({
            id: "q4",
            total: 981.17,
            issueDate: new Date("2026-11-15"),
            client: {
              id: "c1",
              name: "Cliente ES",
              nif: "B12345678",
              countryCode: "ES",
            },
          }),
        ],
        expenses: [],
        marketplace: [],
      });
      const op = agg.declarableOperators.find((o) => o.taxId === "B12345678");
      assert.ok(op);
      assert.equal(op?.quarters.q1, 1000);
      assert.equal(op?.quarters.q2, 1500);
      assert.equal(op?.quarters.q3, 800);
      assert.equal(op?.quarters.q4, 981.17);
    });
  });

  describe("Exclusión 349", () => {
    it("EU_GOODS venta → EXCLUDED_MODEL349", () => {
      const e = assess347SaleEligibility({
        vatOperationType: "INTRACOMUNITARIA",
        status: "PAGADA",
        fiscalStatus: "ISSUED",
        clientTaxId: "FR12345678901",
        clientCountryCode: "FR",
      });
      assert.equal(e.include, false);
      assert.equal(e.reason, "EXCLUDED_MODEL349");
    });

    it("EU_SERVICES compra → EXCLUDED_MODEL349", () => {
      const e = assess347PurchaseEligibility({
        vatOperationType: "SERVICIO_INTRACOMUNITARIO",
        supplierTaxId: "IE6364992H",
      });
      assert.equal(e.include, false);
      assert.equal(e.reason, "EXCLUDED_MODEL349");
    });

    it("Adobe Ireland 860 € excluido con motivo 349", () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-12-31");
      const excluded: import("../modelo-347/types").Model347ExcludedOperation[] = [];
      const warnings: import("../modelo-347/types").Model347Warning[] = [];
      collect347ExpenseLines(
        [
          expenseRow({
            total: 860,
            vatOperationType: "SERVICIO_INTRACOMUNITARIO",
            supplierNif: "IE6364992H",
            supplierName: "Adobe Ireland",
          }),
        ],
        from,
        to,
        warnings,
        excluded
      );
      assert.equal(excluded.length, 1);
      assert.equal(excluded[0].reason, "EXCLUDED_MODEL349");
      assert.match(excluded[0].reasonLabel, /349/);
    });
  });

  describe("Rectificativa", () => {
    it("DIFFERENCES negativa → delta explícito en total", () => {
      assert.equal(
        compute347RectificationAmount(
          {
            invoiceFiscalType: "RECTIFYING",
            rectificationMethod: "DIFFERENCES",
            total: -242,
          },
          { id: "orig", total: 1210 }
        ),
        -242
      );
    });

    it("SUBSTITUTION a menor importe: 1210 → 968 = -242", () => {
      assert.equal(
        compute347RectificationAmount(
          {
            invoiceFiscalType: "RECTIFYING",
            rectificationMethod: "SUBSTITUTION",
            total: 968,
            substitutionCorrectTotal: 968,
          },
          { id: "orig", total: 1210 }
        ),
        -242
      );
    });

    it("SUBSTITUTION a mayor importe: 1210 → 1452 = +242", () => {
      assert.equal(
        compute347RectificationAmount(
          {
            invoiceFiscalType: "RECTIFYING",
            rectificationMethod: "SUBSTITUTION",
            total: 1452,
            substitutionCorrectTotal: 1452,
          },
          { id: "orig", total: 1210 }
        ),
        242
      );
    });

    it("SUBSTITUTION agregada: original intacta + delta, sin duplicar importe correcto", () => {
      const originals = new Map([
        ["orig", { id: "orig", total: 1210 }],
      ]);
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({
            id: "orig",
            total: 1210,
            issueDate: new Date("2026-02-01"),
          }),
          invoiceRow({
            id: "rect",
            total: 968,
            invoiceFiscalType: "RECTIFYING",
            rectificationMethod: "SUBSTITUTION",
            substitutionCorrectTotal: 968,
            rectifiesInvoiceId: "orig",
            issueDate: new Date("2026-08-01"),
          }),
        ],
        expenses: [],
        marketplace: [],
        originalsById: originals,
      });
      const op = agg.operators.find((o) => o.taxId === "B12345678");
      assert.ok(op);
      assert.equal(op?.annualAmount, 968);
      assert.equal(op?.quarters.q1, 1210);
      assert.equal(op?.quarters.q3, -242);
    });

    it("factura + rectificativa DIFFERENCES → total correcto en trimestre rectificativa", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({
            id: "orig",
            total: 4000,
            issueDate: new Date("2026-02-01"),
          }),
          invoiceRow({
            id: "rect",
            total: -500,
            invoiceFiscalType: "RECTIFYING",
            rectificationMethod: "DIFFERENCES",
            issueDate: new Date("2026-08-01"),
          }),
        ],
        expenses: [],
        marketplace: [],
      });
      const op = agg.declarableOperators.find((o) => o.taxId === "B12345678");
      assert.ok(op);
      assert.equal(op?.annualAmount, 3500);
      assert.equal(op?.quarters.q1, 4000);
      assert.equal(op?.quarters.q3, -500);
    });
  });

  describe("Identificación operador", () => {
    it("sin NIF → OPERATOR_347_ID_MISSING", () => {
      const r = resolve347Operator({ taxIdRaw: "", name: "Proveedor" });
      assert.equal(r.valid, false);
      if (!r.valid) assert.equal(r.code, "OPERATOR_347_ID_MISSING");
    });

    it("PEND- → placeholder", () => {
      const r = resolve347Operator({ taxIdRaw: "PEND-MKT-ES", name: "X" });
      assert.equal(r.valid, false);
      if (!r.valid) assert.equal(r.code, "OPERATOR_347_ID_PLACEHOLDER");
    });
  });

  describe("RECC / criterio de caja", () => {
    it("RECC sin cobros → MODEL347_CASH_ACCOUNTING_DATA_INCOMPLETE y requiresReview", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({
            id: "recc-empty",
            total: 4000,
            cashAccounting: true,
            payments: [],
            issueDate: new Date("2026-02-01"),
          }),
        ],
        expenses: [],
        marketplace: [],
      });
      assert.ok(agg.requiresReview);
      assert.ok(
        agg.warnings.some((w) => w.code === "MODEL347_CASH_ACCOUNTING_DATA_INCOMPLETE")
      );
      const op = agg.operators.find((o) => o.taxId === "B12345678");
      assert.ok(op?.requiresReview);
      assert.equal(agg.declarableOperators.length, 0);
      assert.equal(op?.annualAmount, 0);
    });

    it("RECC con cobros completos → annualAmount devengo 0 + cashAccountingAnnualAmount", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({
            id: "recc-ok",
            total: 4000,
            cashAccounting: true,
            issueDate: new Date("2026-01-10"),
            payments: [
              { amount: 2000, paidAt: new Date("2026-03-15") },
              { amount: 2000, paidAt: new Date("2026-05-20") },
            ],
          }),
        ],
        expenses: [],
        marketplace: [],
      });
      const op = agg.declarableOperators.find((o) => o.taxId === "B12345678");
      assert.ok(op);
      assert.equal(op?.annualAmount, 0);
      assert.equal(op?.cashAccountingAnnualAmount, 4000);
      assert.equal(op?.quarters.q1, 0);
      assert.equal(op?.quarters.q2, 0);
      assert.equal(op?.cashAccountingQuarters?.q1, 2000);
      assert.equal(op?.cashAccountingQuarters?.q2, 2000);
      assert.equal(agg.requiresReview, false);
    });

    it("RECC no imputa devengo por issueDate en trimestre general", () => {
      const cash = compute347CashAccountingAmounts({
        invoiceTotal: 4000,
        payments: [{ amount: 4000, paidAt: new Date("2026-09-10") }],
        yearFrom: new Date("2026-01-01"),
        yearTo: new Date("2026-12-31"),
      });
      assert.equal(cash.complete, true);
      if (cash.complete) {
        assert.equal(cash.cashAccountingAnnualAmount, 4000);
        assert.equal(cash.cashAccountingQuarters.q3, 4000);
        assert.equal(cash.cashAccountingQuarters.q1, 0);
      }
    });
  });

  describe("Metálico (informativo)", () => {
    it("warning metálico persiste aunque supere umbral", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({
            total: 4000,
            paymentMethod: "efectivo",
            issueDate: new Date("2026-04-01"),
          }),
        ],
        expenses: [],
        marketplace: [],
      });
      assert.ok(agg.declarableOperators.length === 1);
      assert.ok(
        agg.warnings.some((w) => w.code === "MODEL347_CASH_PAYMENTS_DATA_LIMITED")
      );
      const op = agg.declarableOperators[0];
      assert.equal(op.cashPaymentHintAmount, 4000);
      assert.equal(op.annualAmount, 4000);
    });
  });

  describe("Histórico filing", () => {
    it("snapshot presentado no cambia al recalcular motor", () => {
      const snapshot = build347PresentedSnapshot({
        year: 2026,
        thresholdContext: { threshold: 3005.06, rule: "test" },
        deadline: {
          dueDate: new Date(),
          dueLabel: "test",
          periodLabel: "2026",
          scopeNote: "test",
          requiresOfficialCalendarCheck: false,
          resolution: "official",
        },
        operators: [],
        declarableOperators: [
          {
            operatorId: "B87654321",
            taxId: "B87654321",
            name: "Proveedor X",
            country: "ES",
            operationType: "A",
            annualAmount: 4281.17,
            quarters: { q1: 1000, q2: 1500, q3: 800, q4: 981.17 },
            trace: [],
            declarable: true,
          },
        ],
        excludedOperations: [],
        warnings: [],
        salesTotal: 0,
        purchasesTotal: 4281.17,
        declarableCount: 1,
        skippedOperatorReview: 0,
        requiresReview: false,
        cashPaymentsScopeNote: "",
        rentalsScopeNote: "",
      });

      const parsed = parse347PresentedSnapshot({ model347Snapshot: snapshot });
      assert.equal(parsed?.operators[0].annualAmount, 4281.17);

      const presented = {
        result: 4281.17,
        incomeBase: null,
        expensesBase: null,
        vatRepercutida: null,
        vatDeductible: null,
        boxes: [],
        sourceFileName: null,
        notes: null,
        year: 2026,
        quarter: null,
        modelType: "347",
        rawExtract: { model347Snapshot: snapshot },
      };

      const draftEngine: Model347Result = {
        ...snapshot,
        declarableOperators: [
          {
            ...snapshot.operators[0],
            operatorId: "B87654321",
            country: "ES",
            trace: [],
            declarable: true,
            annualAmount: 5000,
            quarters: { q1: 5000, q2: 0, q3: 0, q4: 0 },
          },
        ],
        operators: [],
      };

      const cmp = compare347PresentedVsDraft(draftEngine, presented);
      assert.equal(cmp.rows[0].presentedAmount, 4281.17);
      assert.equal(cmp.rows[0].draftAmount, 5000);
      assert.equal(parsed?.operators[0].annualAmount, 4281.17);
    });
  });

  describe("Plazo anual", () => {
    it("347 ejercicio 2025 → 2 marzo 2026 (calendario AEAT)", () => {
      const d = resolve347Deadline(2025);
      assert.equal(d.dueDate.getFullYear(), 2026);
      assert.equal(d.dueDate.getMonth(), 2);
      assert.equal(d.dueDate.getDate(), 2);
      assert.equal(d.resolution, "official");
      assert.equal(d.requiresOfficialCalendarCheck, false);
    });

    it("347 → último día febrero año siguiente (2024 → 28 feb 2025, laborable)", () => {
      const d = resolve347Deadline(2024);
      assert.equal(d.dueDate.getMonth(), 1);
      assert.equal(d.dueDate.getDate(), 28);
      assert.equal(d.dueDate.getFullYear(), 2025);
      assert.equal(d.requiresOfficialCalendarCheck, true);
      assert.ok(d.scopeNote.includes("inhábiles"));
    });

    it("347 → fin de semana se traslada al lunes", () => {
      const d = resolve347Deadline(2026);
      assert.equal(d.dueDate.getFullYear(), 2027);
      assert.equal(d.dueDate.getDay(), 1);
      assert.equal(d.resolution, "weekend_adjusted");
    });
  });

  describe("Marketplace", () => {
    it("fila marketplace sin invoiceId entra; con invoiceId queda fuera del motor Prisma", () => {
      const agg = aggregate347Year({
        year: 2026,
        invoices: [
          invoiceRow({
            id: "inv-mkt",
            total: 4000,
            issueDate: new Date("2026-04-10"),
          }),
        ],
        expenses: [],
        marketplace: [
          {
            id: "mkt-dup",
            issueDate: new Date("2026-04-10"),
            total: 4000,
            channel: "AMAZON",
            shipToCountry: "ES",
            invoiceId: "inv-mkt",
          },
          {
            id: "mkt-orphan",
            issueDate: new Date("2026-05-10"),
            total: 3500,
            channel: "AMAZON",
            shipToCountry: "ES",
            invoiceId: null,
          },
        ],
      });
      const sales = agg.declarableOperators.filter((o) => o.operationType === "B");
      assert.equal(sales.length, 1);
      assert.equal(sales[0].annualAmount, 4000);
      assert.ok(
        agg.warnings.some((w) => w.code === "MARKETPLACE_347_REVIEW_REQUIRED")
      );
    });
  });
});
