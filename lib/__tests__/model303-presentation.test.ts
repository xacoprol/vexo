import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateModel303Period,
  boxHasTrace,
  buildCompensationDisplay,
  comparePresentedVsDraft,
  getOutcomeDisplay,
  getTraceForBox,
  groupBoxesForDisplay,
  humanizeWarnings,
} from "../modelo-303";

const period = { from: new Date("2026-01-01"), to: new Date("2026-03-31") };

function invoice(opts: { subtotal: number; vatAmount: number }) {
  return {
    id: "inv1",
    issueDate: new Date("2026-02-01"),
    subtotal: opts.subtotal,
    vatAmount: opts.vatAmount,
    irpfAmount: 0,
    status: "paid",
    fiscalStatus: "ISSUED",
    vatOperationType: "INTERIOR",
    lines: [{ vatRate: 21, lineSubtotal: opts.subtotal, lineVat: opts.vatAmount }],
  };
}

function expense(opts: { subtotal: number; vatAmount: number }) {
  return {
    id: "exp1",
    issueDate: new Date("2026-02-01"),
    subtotal: opts.subtotal,
    vatAmount: opts.vatAmount,
    vatRate: 21,
    total: opts.subtotal + opts.vatAmount,
    vatOperationType: "INTERIOR",
    isInvestment: false,
  };
}

describe("Model 303 — presentación UI", () => {
  it("TO_PAY desde outcome y box71", () => {
    const r = aggregateModel303Period({
      invoices: [invoice({ subtotal: 1000, vatAmount: 210 })],
      expenses: [],
      marketplace: [],
      assets: [],
      ...period,
    });
    const d = getOutcomeDisplay(r.modelo303.outcome, r.modelo303.result);
    assert.equal(d.outcome, "TO_PAY");
    assert.equal(d.headline, "A INGRESAR");
    assert.equal(d.amount, r.modelo303.boxes.box71);
    assert.ok((d.amount ?? 0) > 0);
  });

  it("TO_COMPENSATE conserva box71 negativa", () => {
    const r = aggregateModel303Period({
      invoices: [],
      expenses: [expense({ subtotal: 5000, vatAmount: 1050 })],
      marketplace: [],
      assets: [],
      ...period,
    });
    const d = getOutcomeDisplay(r.modelo303.outcome, r.modelo303.result);
    assert.equal(d.outcome, "TO_COMPENSATE");
    assert.equal(d.headline, "A COMPENSAR");
    assert.ok((d.amount ?? 0) < 0);
    assert.equal(r.modelo303.boxes.box70, 0);
  });

  it("ZERO outcome", () => {
    const d = getOutcomeDisplay("ZERO", 0);
    assert.equal(d.headline, "RESULTADO CERO");
    assert.equal(d.amount, 0);
  });

  it("NO_ACTIVITY sin importe", () => {
    const d = getOutcomeDisplay("NO_ACTIVITY", 0);
    assert.equal(d.headline, "SIN ACTIVIDAD");
    assert.equal(d.amount, null);
  });

  it("warnings humanizados visibles", () => {
    const items = humanizeWarnings([
      {
        code: "IMPORT_DOCUMENT_MISSING",
        message: "Falta DUA en compra importación.",
        sourceId: "exp-1",
      },
    ]);
    assert.equal(items[0].title, "Importación sin DUA");
    assert.ok(items[0].explanation.includes("DUA"));
    assert.equal(items[0].cta?.label, "Ver gasto");
  });

  it("casilla con trace expone operaciones", () => {
    const r = aggregateModel303Period({
      invoices: [invoice({ subtotal: 1000, vatAmount: 210 })],
      expenses: [],
      marketplace: [],
      assets: [],
      ...period,
    });
    assert.ok(boxHasTrace(r.modelo303.trace, "07"));
    const lines = getTraceForBox(r.modelo303.trace, "07");
    assert.ok(lines.length > 0);
    assert.equal(lines[0].sourceType, "invoice");
  });

  it("presentado vs borrador", () => {
    const cmp = comparePresentedVsDraft(1240, 1284.37);
    assert.equal(cmp.matches, false);
    assert.equal(cmp.difference, 44.37);
    const ok = comparePresentedVsDraft(500, 500);
    assert.equal(ok.matches, true);
  });

  it("box87 no se presenta como saldo nuevo", () => {
    const comp = buildCompensationDisplay(
      [
        { code: "110", label: "", value: 1200 },
        { code: "78", label: "", value: 1000 },
        { code: "87", label: "", value: 200 },
      ],
      0
    );
    assert.equal(comp.pendingForFuture, 200);
    assert.equal(comp.newNegativeThisPeriod, null);
  });

  it("saldo nuevo no se etiqueta como box70", () => {
    const r = aggregateModel303Period({
      invoices: [],
      expenses: [expense({ subtotal: 5000, vatAmount: 1050 })],
      marketplace: [],
      assets: [],
      ...period,
    });
    const comp = buildCompensationDisplay(
      r.modelo303.boxList,
      r.modelo303.currentPeriodNegative
    );
    assert.equal(r.modelo303.boxes.box70, 0);
    assert.ok(comp.newNegativeThisPeriod != null && comp.newNegativeThisPeriod > 0);
    assert.notEqual(comp.newNegativeThisPeriod, r.modelo303.boxes.box87);
  });

  it("agrupa casillas omitiendo ceros", () => {
    const r = aggregateModel303Period({
      invoices: [invoice({ subtotal: 100, vatAmount: 21 })],
      expenses: [],
      marketplace: [],
      assets: [],
      ...period,
    });
    const sections = groupBoxesForDisplay(
      r.modelo303.boxList,
      r.modelo303.trace,
      false
    );
    const codes = sections.flatMap((s) => s.boxes.map((b) => b.code));
    assert.ok(codes.includes("09"));
    assert.ok(!codes.includes("04") || boxHasTrace(r.modelo303.trace, "04"));
  });
});
