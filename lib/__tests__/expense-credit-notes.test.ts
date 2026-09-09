import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCurrency } from "../calculations";
import {
  computeExpenseDeductibility,
  deductibleVatAmount,
} from "../expense-deductibility";
import {
  normalizeExpenseDraftAmounts,
  parseSignedMoney,
} from "../gemini-expense";
import { aggregateIrpfExpenses } from "../modelo-130/irpf-expenses";
import { aggregateModel303Period } from "../modelo-303/aggregate";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

describe("expense credit notes — parser preserves signs", () => {
  it("parseSignedMoney keeps negatives from number and string forms", () => {
    assert.equal(parseSignedMoney(-5.09), -5.09);
    assert.equal(parseSignedMoney("-5.09"), -5.09);
    assert.equal(parseSignedMoney("-5,09"), -5.09);
    assert.equal(parseSignedMoney("-EUR 5.09"), -5.09);
    assert.equal(parseSignedMoney("€ -1.07"), -1.07);
    assert.equal(parseSignedMoney("(6.16)"), -6.16);
    assert.equal(parseSignedMoney(100), 100);
    assert.equal(parseSignedMoney("121,00"), 121);
  });

  it("normalizeExpenseDraftAmounts keeps credit-note amounts", () => {
    const d = normalizeExpenseDraftAmounts({
      subtotal: -5.09,
      vatRate: 21,
      vatAmount: -1.07,
      total: -6.16,
      vatOperationType: "INTERIOR",
    });
    assert.equal(d.subtotal, -5.09);
    assert.equal(d.vatAmount, -1.07);
    assert.equal(d.total, -6.16);
    assert.equal(d.vatOperationType, "INTERIOR");
  });

  it("normalizeExpenseDraftAmounts derives signed VAT when missing", () => {
    const d = normalizeExpenseDraftAmounts({
      subtotal: "-5,09",
      vatRate: 21,
      vatAmount: 0,
      total: 0,
      vatOperationType: "INTERIOR",
    });
    assert.equal(d.subtotal, -5.09);
    assert.equal(d.vatAmount, -1.07);
    assert.equal(d.total, -6.16);
  });
});

describe("expense credit notes — deductibility", () => {
  it("positive invoice: +100 base +21 VAT", () => {
    const d = computeExpenseDeductibility({
      subtotal: 100,
      vatAmount: 21,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    assert.equal(d.irpfComputable, 100);
    assert.equal(d.deductibleVat, 21);
    assert.equal(deductibleVatAmount(21, 100), 21);
  });

  it("credit note: -5.09 base -1.07 VAT", () => {
    const d = computeExpenseDeductibility({
      subtotal: -5.09,
      vatAmount: -1.07,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    assert.equal(d.irpfComputable, -5.09);
    assert.equal(d.deductibleVat, -1.07);
    assert.equal(deductibleVatAmount(-1.07, 100), -1.07);
  });

  it("invoice + credit note nets correctly", () => {
    const a = computeExpenseDeductibility({
      subtotal: 100,
      vatAmount: 21,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    const b = computeExpenseDeductibility({
      subtotal: -5.09,
      vatAmount: -1.07,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    assert.equal(round2(a.irpfComputable + b.irpfComputable), 94.91);
    assert.equal(round2(a.deductibleVat + b.deductibleVat), 19.93);
  });
});

describe("expense credit notes — modelo 130", () => {
  it("abono reduces deductible expenses and is not dropped", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-09-30T23:59:59.999Z");
    const r = aggregateIrpfExpenses({
      from,
      to,
      expenses: [
        {
          id: "inv",
          issueDate: new Date("2026-08-01T00:00:00.000Z"),
          subtotal: 100,
          vatAmount: 21,
          vatRate: 21,
          vatOperationType: "INTERIOR",
          deductible: true,
          vatDeductiblePct: 100,
          irpfDeductiblePct: 100,
          isInvestment: false,
          description: "Factura",
          supplierName: "Proveedor",
        },
        {
          id: "cn",
          issueDate: new Date("2026-08-31T00:00:00.000Z"),
          subtotal: -5.09,
          vatAmount: -1.07,
          vatRate: 21,
          vatOperationType: "INTERIOR",
          deductible: true,
          vatDeductiblePct: 100,
          irpfDeductiblePct: 100,
          isInvestment: false,
          description: "Tarifas reembolsadas",
          supplierName: "Amazon EU S.à r.l., Sucursal en España",
        },
      ],
    });
    assert.equal(r.ordinaryBase, 94.91);
    assert.equal(r.lines.length, 2);
    assert.ok(r.lines.some((l) => l.amount === -5.09));
    assert.ok(!r.lines.some((l) => l.sourceType === "invoice"));
  });

  it("credit note alone reduces expenses (negative ordinary base)", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-09-30T23:59:59.999Z");
    const r = aggregateIrpfExpenses({
      from,
      to,
      expenses: [
        {
          id: "cn",
          issueDate: new Date("2026-08-31T00:00:00.000Z"),
          subtotal: -5.09,
          vatAmount: -1.07,
          vatRate: 21,
          vatOperationType: "INTERIOR",
          deductible: true,
          vatDeductiblePct: 100,
          irpfDeductiblePct: 100,
          isInvestment: false,
          supplierName: "Amazon",
        },
      ],
    });
    assert.equal(r.ordinaryBase, -5.09);
  });
});

describe("expense credit notes — modelo 303", () => {
  it("abono reduces cas.28/29 and keeps 21%", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-09-30T23:59:59.999Z");
    const agg = aggregateModel303Period({
      from,
      to,
      invoices: [],
      marketplace: [],
      assets: [],
      expenses: [
        {
          id: "inv",
          issueDate: new Date("2026-08-01T00:00:00.000Z"),
          subtotal: 100,
          vatAmount: 21,
          total: 121,
          vatRate: 21,
          vatOperationType: "INTERIOR",
          deductible: true,
          vatDeductiblePct: 100,
          irpfDeductiblePct: 100,
          isInvestment: false,
          supplierName: "Proveedor",
        },
        {
          id: "cn",
          issueDate: new Date("2026-08-31T00:00:00.000Z"),
          subtotal: -5.09,
          vatAmount: -1.07,
          total: -6.16,
          vatRate: 21,
          vatOperationType: "INTERIOR",
          deductible: true,
          vatDeductiblePct: 100,
          irpfDeductiblePct: 100,
          isInvestment: false,
          supplierName: "Amazon EU S.à r.l., Sucursal en España",
          description: "NOTA DE CRÉDITO DE IMPUESTOS · Tarifas reembolsadas",
        },
      ],
    });

    assert.equal(agg.modelo303.boxes.box28, 94.91);
    assert.equal(agg.modelo303.boxes.box29, 19.93);
    assert.equal(agg.expenses.base, 94.91);
    assert.equal(agg.expenses.vatDeductible, 19.93);
    // Must not flip into accrued (repercutido) boxes
    assert.equal(agg.modelo303.boxes.box07, 0);
    assert.equal(agg.modelo303.boxes.box09, 0);
  });
});

describe("expense credit notes — UI currency", () => {
  it("formatCurrency shows negatives, never 0 for -5.09", () => {
    assert.match(formatCurrency(-5.09), /^-?\s*5,09/);
    assert.match(formatCurrency(-1.07), /^-?\s*1,07/);
    assert.match(formatCurrency(-6.16), /^-?\s*6,16/);
    assert.notEqual(formatCurrency(-5.09), formatCurrency(0));
  });
});
