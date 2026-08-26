import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INVOICE_FISCAL_TYPE,
  RECTIFICATION_TYPE,
  computeClientInvoiceBalance,
  computeRectificationTotals,
  canAnnulInvoice,
  canRectifyInvoice,
  resolveRectifyingInvoiceType,
  rectificationMethodToAeat,
} from "../invoice-rectification";
import { aggregateModel303Period } from "../modelo-303";
import { buildHuellaAltaCanonical, sealVerifactuRecord } from "../verifactu";

const original = {
  id: "orig-1",
  fullNumber: "F2026/0042",
  issueDate: new Date("2026-02-01"),
  invoiceKind: "FULL",
  subtotal: 100,
  vatAmount: 21,
  total: 121,
  vatOperationType: "SUJETA",
  irpfRate: 0,
};

describe("Rectificación — lifecycle helpers", () => {
  it("DRAFT rectificativa editable; ISSUED original no rectificable si no emitida", () => {
    assert.equal(
      canRectifyInvoice({ fiscalStatus: "ISSUED", status: "PENDIENTE" }).ok,
      true
    );
    assert.equal(
      canRectifyInvoice({ fiscalStatus: "DRAFT", status: "PENDIENTE" }).ok,
      false
    );
  });

  it("anulación ≠ rectificativa", () => {
    assert.equal(
      canAnnulInvoice({
        fiscalStatus: "ISSUED",
        status: "PENDIENTE",
        invoiceFiscalType: INVOICE_FISCAL_TYPE.NORMAL,
      }).ok,
      true
    );
    assert.equal(
      canAnnulInvoice({
        fiscalStatus: "ISSUED",
        status: "PENDIENTE",
        invoiceFiscalType: INVOICE_FISCAL_TYPE.RECTIFYING,
      }).ok,
      false
    );
  });
});

describe("Rectificación — diferencias", () => {
  it("original 100+21; rectificación -40/-8,40", () => {
    const { totals, errors } = computeRectificationTotals(original, {
      cause: "PARTIAL_RETURN",
      legalType: RECTIFICATION_TYPE.R1,
      method: "DIFFERENCES",
      correctionLines: [
        {
          description: "Devolución parcial",
          quantity: 1,
          unitPrice: 40,
          vatRate: 21,
          discountPct: 0,
        },
      ],
    });
    assert.equal(errors.length, 0);
    assert.equal(totals.subtotal, -40);
    assert.equal(totals.vatAmount, -8.4);
    assert.equal(totals.total, -48.4);
  });

  it("devolución total neutraliza original", () => {
    const { totals, errors } = computeRectificationTotals(original, {
      cause: "TOTAL_RETURN",
      legalType: RECTIFICATION_TYPE.R1,
      method: "DIFFERENCES",
      correctionLines: [
        {
          description: "Devolución total",
          quantity: 1,
          unitPrice: 100,
          vatRate: 21,
          discountPct: 0,
        },
      ],
    });
    assert.equal(errors.length, 0);
    assert.equal(totals.subtotal, -100);
    assert.equal(totals.vatAmount, -21);
  });
});

describe("Rectificación — R5 simplificada", () => {
  it("R5 para original SIMPLIFIED", () => {
    const res = resolveRectifyingInvoiceType({
      legalType: RECTIFICATION_TYPE.R5,
      originalInvoiceKind: "SIMPLIFIED",
    });
    assert.equal(res.type, RECTIFICATION_TYPE.R5);
    assert.equal(res.errors.length, 0);
  });

  it("R5 rechazada para FULL", () => {
    const res = resolveRectifyingInvoiceType({
      legalType: RECTIFICATION_TYPE.R5,
      originalInvoiceKind: "FULL",
    });
    assert.ok(res.errors.length > 0);
    assert.notEqual(res.type, RECTIFICATION_TYPE.R5);
  });
});

describe("Rectificación — VeriFactu", () => {
  it("rectificativa genera hash propio con referencia original", () => {
    const sealed = sealVerifactuRecord({
      issuerNif: "B12345678",
      fullNumber: "R2026/0003",
      issueDate: new Date("2026-03-15"),
      vatAmount: -8.4,
      total: -48.4,
      previousHash: "ABC123",
      tipoFactura: "R1",
      rectificativa: {
        method: "I",
        originalFullNumber: "F2026/0042",
        originalIssueDate: new Date("2026-02-01"),
      },
    });
    assert.notEqual(sealed.hash, "ABC123");
    assert.ok(sealed.canonical.includes("TipoRectificativa=I"));
    assert.ok(
      sealed.canonical.includes("NumSerieFacturaRectificada=F2026/0042")
    );
    assert.ok(sealed.canonical.includes("TipoFactura=R1"));
  });
});

describe("Rectificación — Modelo 303", () => {
  function invoiceRow(opts: {
    id: string;
    fullNumber: string;
    subtotal: number;
    vatAmount: number;
    fiscalType?: string;
    rectifies?: string;
  }) {
    return {
      id: opts.id,
      fullNumber: opts.fullNumber,
      issueDate: new Date("2026-02-10"),
      subtotal: opts.subtotal,
      vatAmount: opts.vatAmount,
      irpfAmount: 0,
      status: "PENDIENTE",
      fiscalStatus: "ISSUED",
      vatOperationType: "SUJETA",
      invoiceFiscalType: opts.fiscalType ?? INVOICE_FISCAL_TYPE.NORMAL,
      rectifiesInvoiceFullNumber: opts.rectifies ?? null,
      lines: [
        {
          vatRate: 21,
          lineSubtotal: opts.subtotal,
          lineVat: opts.vatAmount,
        },
      ],
    };
  }

  it("original + rectificativa → neto correcto", () => {
    const r = aggregateModel303Period({
      invoices: [
        invoiceRow({
          id: "i1",
          fullNumber: "F2026/0042",
          subtotal: 100,
          vatAmount: 21,
        }),
        invoiceRow({
          id: "i2",
          fullNumber: "R2026/0003",
          subtotal: -40,
          vatAmount: -8.4,
          fiscalType: INVOICE_FISCAL_TYPE.RECTIFYING,
          rectifies: "F2026/0042",
        }),
      ],
      expenses: [],
      marketplace: [],
      assets: [],
      from: new Date("2026-01-01"),
      to: new Date("2026-03-31"),
    });
    assert.equal(r.modelo303.boxes.box07, 60);
    assert.equal(r.modelo303.boxes.box09, 12.6);
    assert.ok(
      !r.modelo303.warnings.some((w) => w.code === "RECTIFICATION_NOT_SUPPORTED")
    );
  });
});

describe("Rectificación — pagos", () => {
  it("saldo a favor del cliente tras rectificar", () => {
    const bal = computeClientInvoiceBalance({
      invoiceTotal: 121,
      rectificationsTotal: -48.4,
      paid: 121,
    });
    assert.equal(bal.clientCredit, 48.4);
    assert.equal(bal.paid, 121);
  });
});

describe("Rectificación — método AEAT", () => {
  it("DIFFERENCES → I, SUBSTITUTION → S", () => {
    assert.equal(rectificationMethodToAeat("DIFFERENCES"), "I");
    assert.equal(rectificationMethodToAeat("SUBSTITUTION"), "S");
  });
});
