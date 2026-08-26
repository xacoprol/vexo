import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateModel303Period,
  buildModel303ChainFromRows,
  carryFromPresented303,
  computeBox45,
  computeBox27,
  computeModel303Liquidation,
  parsePurchaseVatKind,
  presented303CarryToPriorCompensation,
} from "../modelo-303";
import { quarterRange } from "../fiscal";

const emptyLines = { invoices: [], marketplace: [], assets: [] };

function expense(opts: {
  id?: string;
  subtotal: number;
  vatAmount?: number;
  vatRate?: number;
  vatOperationType?: string;
  vatDeductiblePct?: number;
  isInvestment?: boolean;
  supplierName?: string;
  importDuaBase?: number;
  importDuaVat?: number;
}) {
  return {
    id: opts.id ?? "e1",
    issueDate: new Date("2026-02-15"),
    subtotal: opts.subtotal,
    vatAmount: opts.vatAmount ?? round2(opts.subtotal * ((opts.vatRate ?? 21) / 100)),
    vatRate: opts.vatRate ?? 21,
    total: opts.subtotal + (opts.vatAmount ?? round2(opts.subtotal * 0.21)),
    vatOperationType: opts.vatOperationType ?? "INTERIOR",
    vatDeductiblePct: opts.vatDeductiblePct ?? 100,
    irpfDeductiblePct: 100,
    isInvestment: opts.isInvestment ?? false,
    supplierName: opts.supplierName ?? "Proveedor",
    importDuaBase: opts.importDuaBase ?? null,
    importDuaVat: opts.importDuaVat ?? null,
  };
}

function invoice(opts: {
  id?: string;
  subtotal: number;
  vatAmount: number;
  vatRate?: number;
  vatOperationType?: string;
  cashAccounting?: boolean;
}) {
  const rate = opts.vatRate ?? 21;
  return {
    id: opts.id ?? "i1",
    fullNumber: "F2026-001",
    issueDate: new Date("2026-02-01"),
    subtotal: opts.subtotal,
    vatAmount: opts.vatAmount,
    irpfAmount: 0,
    status: "PAGADA",
    fiscalStatus: "ISSUED",
    cashAccounting: opts.cashAccounting ?? false,
    vatOperationType: opts.vatOperationType ?? "SUJETA",
    lines: [{ vatRate: rate, lineSubtotal: opts.subtotal, lineVat: opts.vatAmount }],
  };
}

function period(from: string, to: string) {
  return { from: new Date(from), to: new Date(to) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

describe("Model 303 — casillas 01–09 oficiales", () => {
  it("4 % → 01/02/03", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      expenses: [],
      ...period("2026-01-01", "2026-03-31"),
      invoices: [invoice({ subtotal: 100, vatAmount: 4, vatRate: 4 })],
    });
    assert.equal(r.modelo303.boxes.box01, 100);
    assert.equal(r.modelo303.boxes.box02, 4);
    assert.equal(r.modelo303.boxes.box03, 4);
  });

  it("10 % → 04/05/06", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      expenses: [],
      ...period("2026-01-01", "2026-03-31"),
      invoices: [invoice({ subtotal: 100, vatAmount: 10, vatRate: 10 })],
    });
    assert.equal(r.modelo303.boxes.box04, 100);
    assert.equal(r.modelo303.boxes.box05, 10);
    assert.equal(r.modelo303.boxes.box06, 10);
  });

  it("21 % → 07/08/09", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      expenses: [],
      ...period("2026-01-01", "2026-03-31"),
      invoices: [invoice({ subtotal: 100, vatAmount: 21, vatRate: 21 })],
    });
    assert.equal(r.modelo303.boxes.box07, 100);
    assert.equal(r.modelo303.boxes.box08, 21);
    assert.equal(r.modelo303.boxes.box09, 21);
  });
});

describe("Model 303 — adquisiciones intracomunitarias 10/11", () => {
  it("compra UE bienes → 10/11 + 36/37", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 1000,
          vatAmount: 0,
          vatOperationType: "INTRACOMUNITARIA",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box10, 1000);
    assert.equal(r.modelo303.boxes.box11, 210);
    assert.equal(r.modelo303.boxes.box36, 1000);
    assert.equal(r.modelo303.boxes.box37, 210);
    assert.equal(r.modelo303.boxes.box12, 0);
  });

  it("servicio UE → 10/11 + 36/37 (no 12/13)", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 1000,
          vatAmount: 0,
          vatOperationType: "SERVICIO_INTRACOMUNITARIO",
          supplierName: "Adobe Ireland",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box10, 1000);
    assert.equal(r.modelo303.boxes.box11, 210);
    assert.equal(r.modelo303.boxes.box36, 1000);
    assert.equal(r.modelo303.boxes.box37, 210);
    assert.equal(r.modelo303.boxes.box12, 0);
    assert.equal(r.modelo303.boxes.box38, 0);
  });

  it("bienes + servicios UE juntos → 10=2000, 11=420", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          id: "g1",
          subtotal: 1000,
          vatAmount: 0,
          vatOperationType: "INTRACOMUNITARIA",
        }),
        expense({
          id: "s1",
          subtotal: 1000,
          vatAmount: 0,
          vatOperationType: "SERVICIO_INTRACOMUNITARIO",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box10, 2000);
    assert.equal(r.modelo303.boxes.box11, 420);
  });

  it("servicio UE 50 % deducible → 11=210, 37=105", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 1000,
          vatAmount: 0,
          vatOperationType: "SERVICIO_INTRACOMUNITARIO",
          vatDeductiblePct: 50,
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box11, 210);
    assert.equal(r.modelo303.boxes.box37, 105);
    assert.equal(r.modelo303.boxes.box39, 0);
  });
});

describe("Model 303 — otras ISP 12/13", () => {
  it("servicio no UE → 12/13 + 29, nunca 16/17", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 50,
          vatAmount: 0,
          vatOperationType: "SERVICIO_EXTRACOMUNITARIO",
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box12, 50);
    assert.equal(r.modelo303.boxes.box13, 10.5);
    assert.equal(r.modelo303.boxes.box16, 0);
    assert.equal(r.modelo303.boxes.box17, 0);
    assert.equal(r.modelo303.boxes.box29, 10.5);
  });

  it("50 % deducible otras ISP", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 200,
          vatAmount: 0,
          vatOperationType: "SERVICIO_EXTRACOMUNITARIO",
          vatDeductiblePct: 50,
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box13, 42);
    assert.equal(r.modelo303.boxes.box29, 21);
  });
});

describe("Model 303 — deducible intracom 36/37 vs 38/39", () => {
  it("EU investment → 10/11 + 38/39", () => {
    const r = aggregateModel303Period({
      invoices: [],
      marketplace: [],
      assets: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 2000,
          vatAmount: 0,
          vatOperationType: "INTRACOMUNITARIA",
          isInvestment: true,
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box10, 2000);
    assert.equal(r.modelo303.boxes.box11, 420);
    assert.equal(r.modelo303.boxes.box36, 0);
    assert.equal(r.modelo303.boxes.box38, 2000);
    assert.equal(r.modelo303.boxes.box39, 420);
  });

  it("interior investment → 30/31 sin 10/11", () => {
    const r = aggregateModel303Period({
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({ id: "e-inv", subtotal: 2000, vatAmount: 420, isInvestment: true }),
      ],
      assets: [
        {
          id: "a1",
          purchaseDate: new Date("2026-02-01"),
          base: 2000,
          vatAmount: 420,
          vatOperationType: "INTERIOR",
          vatDeductiblePct: 100,
        },
      ],
    });
    assert.equal(r.modelo303.boxes.box10, 0);
    assert.equal(r.modelo303.boxes.box30, 2000);
    assert.equal(r.modelo303.boxes.box31, 420);
  });
});

describe("Model 303 — importaciones 32–35", () => {
  it("sin DUA → warning, sin cuota", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [expense({ subtotal: 500, vatOperationType: "IMPORTACION_BIENES" })],
    });
    assert.equal(r.modelo303.boxes.box32, 0);
    assert.ok(r.modelo303.warnings.some((w) => w.code === "IMPORT_DOCUMENT_MISSING"));
  });

  it("con DUA corriente → 32/33", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 500,
          vatOperationType: "IMPORTACION_BIENES",
          importDuaBase: 500,
          importDuaVat: 105,
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box32, 500);
    assert.equal(r.modelo303.boxes.box33, 105);
    assert.equal(r.modelo303.boxes.box34, 0);
  });

  it("con DUA inversión → 34/35", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({
          subtotal: 2000,
          vatOperationType: "IMPORTACION_BIENES",
          isInvestment: true,
          importDuaBase: 2000,
          importDuaVat: 420,
        }),
      ],
    });
    assert.equal(r.modelo303.boxes.box34, 2000);
    assert.equal(r.modelo303.boxes.box35, 420);
  });
});

describe("Model 303 — fórmulas 27 y 45", () => {
  it("box27 suma solo cuotas soportadas", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [invoice({ subtotal: 100, vatAmount: 21 })],
      expenses: [
        expense({ subtotal: 1000, vatAmount: 0, vatOperationType: "INTRACOMUNITARIA" }),
        expense({ subtotal: 50, vatAmount: 0, vatOperationType: "SERVICIO_EXTRACOMUNITARIO" }),
      ],
      ...period("2026-01-01", "2026-03-31"),
    });
    const b = r.modelo303.boxes;
    assert.equal(
      b.box27,
      computeBox27({
        box03: b.box03,
        box06: b.box06,
        box09: b.box09,
        box11: b.box11,
        box13: b.box13,
        box17: 0,
        otherDevengadoQuota: b.otherQuota,
      })
    );
    assert.equal(b.box16, 0);
    assert.equal(b.box17, 0);
  });

  it("box45 fórmula oficial", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [
        expense({ subtotal: 200, vatAmount: 42 }),
        expense({
          subtotal: 1000,
          vatAmount: 0,
          vatOperationType: "INTRACOMUNITARIA",
        }),
      ],
    });
    const b = r.modelo303.boxes;
    assert.equal(
      b.box45,
      computeBox45({
        box29: b.box29,
        box31: b.box31,
        box33: b.box33,
        box35: b.box35,
        box37: b.box37,
        box39: b.box39,
        box41: 0,
        box42: 0,
        box43: 0,
        box44: 0,
      })
    );
  });
});

describe("Model 303 — liquidación y compensaciones", () => {
  it("box87 = 110 − 78", () => {
    const r = aggregateModel303Period({
      invoices: [invoice({ subtotal: 1000, vatAmount: 210 })],
      expenses: [],
      marketplace: [],
      assets: [],
      priorCompensation: 500,
      ...period("2026-01-01", "2026-03-31"),
    });
    const b = r.modelo303.boxes;
    assert.equal(b.box87, round2(b.box110 - b.box78));
  });

  it("caso A — 66 positivo → 69/71 positivos, 70=0, TO_PAY", () => {
    const liq = computeModel303Liquidation(500, 0, 0);
    assert.equal(liq.box66, 500);
    assert.equal(liq.box110, 0);
    assert.equal(liq.box78, 0);
    assert.equal(liq.box69, 500);
    assert.equal(liq.box70, 0);
    assert.equal(liq.box71, 500);
    assert.equal(liq.newNegativeBalance, 0);
  });

  it("caso B — 66 negativo → 69/71 negativos, 70=0, TO_COMPENSATE", () => {
    const liq = computeModel303Liquidation(0, 500, 0);
    assert.equal(liq.box66, -500);
    assert.equal(liq.box69, -500);
    assert.equal(liq.box70, 0);
    assert.equal(liq.box71, -500);
    assert.equal(liq.newNegativeBalance, 500);
  });

  it("caso C — compensación anterior parcial", () => {
    const liq = computeModel303Liquidation(1000, 0, 200);
    assert.equal(liq.box66, 1000);
    assert.equal(liq.box110, 200);
    assert.equal(liq.box78, 200);
    assert.equal(liq.box87, 0);
    assert.equal(liq.box69, 800);
    assert.equal(liq.box70, 0);
    assert.equal(liq.box71, 800);
  });

  it("caso D — compensación anterior agota resultado", () => {
    const liq = computeModel303Liquidation(1000, 0, 1200);
    assert.equal(liq.box66, 1000);
    assert.equal(liq.box110, 1200);
    assert.equal(liq.box78, 1000);
    assert.equal(liq.box87, 200);
    assert.equal(liq.box69, 0);
    assert.equal(liq.box70, 0);
    assert.equal(liq.box71, 0);
  });

  it("saldo negativo actual en box71, no en box70 ni box87", () => {
    const r = aggregateModel303Period({
      invoices: [],
      expenses: [expense({ subtotal: 5000, vatAmount: 1050 })],
      marketplace: [],
      assets: [],
      ...period("2026-01-01", "2026-03-31"),
    });
    const b = r.modelo303.boxes;
    assert.equal(b.box70, 0);
    assert.ok(b.box71 < 0);
    assert.equal(b.box69, b.box71);
    assert.equal(b.box87, 0);
    assert.equal(r.modelo303.currentPeriodNegative, round2(-b.box71));
    assert.equal(r.modelo303.priorCompensationPending, b.box87);
    assert.equal(
      r.modelo303.carryForward,
      round2(b.box87 + r.modelo303.currentPeriodNegative)
    );
  });

  it("Q1 negativo → Q2 box110 recibe saldo optado a compensar", () => {
    const chain = buildModel303ChainFromRows({
      year: 2026,
      invoices: [],
      expenses: [expense({ subtotal: 5000, vatAmount: 1050 })],
      marketplace: [],
      assets: [],
      priorYearCompensation: 0,
      quarterRange,
    });
    assert.equal(chain[1].boxes.box70, 0);
    assert.ok(chain[1].boxes.box71 < 0);
    assert.equal(chain[1].boxes.box87, 0);
    assert.equal(chain[2].boxes.box110, chain[1].carryForward);
    assert.equal(chain[2].boxes.box110, chain[1].currentPeriodNegative);
  });

  it("filing presentado: box87 y newNegativeBalance desde box71", () => {
    const carry = carryFromPresented303({
      result: -500,
      boxes: [
        { code: "87", value: 200 },
        { code: "71", value: -500 },
      ],
    });
    assert.equal(carry.box87, 200);
    assert.equal(carry.newNegativeBalance, 500);
    assert.equal(carry.totalAvailableNextPeriod, 700);
    assert.equal(carry.legacyEstimate, false);
    assert.equal(presented303CarryToPriorCompensation(carry), 700);

    const chain = buildModel303ChainFromRows({
      year: 2026,
      invoices: [invoice({ subtotal: 1000, vatAmount: 210 })],
      expenses: [],
      marketplace: [],
      assets: [],
      priorYearCompensation: 999,
      presentedCarryByQuarter: {
        1: presented303CarryToPriorCompensation(carry),
      },
      quarterRange,
    });
    assert.equal(chain[2].boxes.box110, 700);
  });

  it("filing legacy: solo result negativo sin casillas", () => {
    const carry = carryFromPresented303({
      result: -500,
      boxes: [],
    });
    assert.equal(carry.legacyEstimate, true);
    assert.equal(carry.box87, 0);
    assert.equal(carry.newNegativeBalance, 500);
    assert.equal(carry.totalAvailableNextPeriod, 500);
  });

  it("box70 del filing no se usa como saldo negativo ordinario", () => {
    const carry = carryFromPresented303({
      result: -500,
      boxes: [
        { code: "87", value: 200 },
        { code: "70", value: 500 },
      ],
    });
    assert.equal(carry.box87, 200);
    assert.equal(carry.newNegativeBalance, 0);
    assert.equal(carry.totalAvailableNextPeriod, 200);
  });
});

describe("Model 303 — clasificación interna", () => {
  it("distingue EU_GOODS de EU_SERVICES", () => {
    assert.equal(parsePurchaseVatKind("INTRACOMUNITARIA"), "EU_GOODS");
    assert.equal(parsePurchaseVatKind("SERVICIO_INTRACOMUNITARIO"), "EU_SERVICES");
  });
});

describe("Model 303 — IVA soportado parcial interior", () => {
  it("50 % deducible", () => {
    const r = aggregateModel303Period({
      ...emptyLines,
      invoices: [],
      marketplace: [],
      ...period("2026-01-01", "2026-03-31"),
      expenses: [expense({ subtotal: 200, vatAmount: 42, vatDeductiblePct: 50 })],
    });
    assert.equal(r.modelo303.boxes.box28, 100);
    assert.equal(r.modelo303.boxes.box29, 21);
  });
});

describe("Model 303 — outcome", () => {
  it("a ingresar vs a compensar", () => {
    const pay = aggregateModel303Period({
      invoices: [invoice({ subtotal: 1000, vatAmount: 210 })],
      expenses: [],
      marketplace: [],
      assets: [],
      ...period("2026-01-01", "2026-03-31"),
    });
    assert.equal(pay.modelo303.outcome, "TO_PAY");
    assert.ok(pay.modelo303.result > 0);

    const comp = aggregateModel303Period({
      invoices: [],
      expenses: [expense({ subtotal: 5000, vatAmount: 1050 })],
      marketplace: [],
      assets: [],
      ...period("2026-01-01", "2026-03-31"),
    });
    assert.equal(comp.modelo303.outcome, "TO_COMPENSATE");
    assert.ok(comp.modelo303.result < 0);
    assert.equal(comp.modelo303.boxes.box70, 0);
    assert.equal(comp.modelo303.result, comp.modelo303.boxes.box71);
  });
});
