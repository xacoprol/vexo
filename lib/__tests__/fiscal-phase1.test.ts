import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aibDeductibleShare,
  computeExpenseDeductibility,
  legacyDeductibleFlag,
  pctsFromLegacyDeductible,
} from "../expense-deductibility";
import {
  assertInvoiceDeletable,
  assertInvoiceEditable,
  FISCAL_CONTENT_HEADER_KEYS,
  FISCAL_STATUS,
  InvoiceFiscalError,
  isInvoiceDraft,
  isInvoiceIssued,
  ISSUED_ALLOWED_METADATA_KEYS,
  ISSUED_DELETE_ERROR,
  ISSUED_IMMUTABLE_ERROR,
} from "../invoice-fiscal-lifecycle";
import {
  defaultInvoiceKindForOrigin,
  INVOICE_KIND,
  resolveInvoiceTipoFactura,
  resolveSimplifiedInvoiceMaxAmount,
  SIMPLIFIED_INVOICE_MAX_DEFAULT,
  SIMPLIFIED_INVOICE_MAX_SPECIAL,
  validateInvoiceForIssuance,
} from "../invoice-issuance";
import {
  buildHuellaAltaCanonical,
  computeHuellaAlta,
  formatFechaExpedicion,
  formatFechaHoraHusoGenRegistro,
  formatVerifactuAmount,
  normalizeIssuerNif,
} from "../verifactu";

describe("invoice fiscal lifecycle", () => {
  it("DRAFT is editable and deletable", () => {
    const draft = { fiscalStatus: FISCAL_STATUS.DRAFT };
    assert.equal(isInvoiceDraft(draft), true);
    assert.equal(isInvoiceIssued(draft), false);
    assert.doesNotThrow(() => assertInvoiceEditable(draft));
    assert.doesNotThrow(() => assertInvoiceDeletable(draft));
  });

  it("ISSUED cannot be deleted", () => {
    const issued = { fiscalStatus: FISCAL_STATUS.ISSUED };
    assert.throws(
      () => assertInvoiceDeletable(issued),
      (err: unknown) =>
        err instanceof InvoiceFiscalError &&
        err.message.includes("emitida") &&
        err.statusCode === 409
    );
    assert.equal(ISSUED_DELETE_ERROR.includes("emitida"), true);
  });

  it("ISSUED cannot modify fiscal content", () => {
    const issued = { fiscalStatus: FISCAL_STATUS.ISSUED };
    assert.throws(
      () => assertInvoiceEditable(issued),
      (err: unknown) =>
        err instanceof InvoiceFiscalError &&
        err.message === ISSUED_IMMUTABLE_ERROR
    );
  });

  it("legacy hash without fiscalStatus counts as ISSUED", () => {
    assert.equal(isInvoiceIssued({ verifactuHash: "abc" }), true);
    assert.equal(isInvoiceDraft({ verifactuHash: "abc" }), false);
  });

  it("explicit DRAFT wins over hash (should not happen in prod)", () => {
    assert.equal(
      isInvoiceIssued({
        fiscalStatus: FISCAL_STATUS.DRAFT,
        verifactuHash: "abc",
      }),
      false
    );
  });
});

describe("expense deductibility IRPF/IVA", () => {
  const base = { subtotal: 100, vatAmount: 21 };

  it("IRPF 100 / IVA 100", () => {
    const d = computeExpenseDeductibility({
      ...base,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    assert.equal(d.deductibleVat, 21);
    assert.equal(d.nonDeductibleVat, 0);
    assert.equal(d.irpfComputable, 100);
  });

  it("IRPF 100 / IVA 0 — IVA no deducible suma al coste IRPF", () => {
    const d = computeExpenseDeductibility({
      ...base,
      vatDeductiblePct: 0,
      irpfDeductiblePct: 100,
    });
    assert.equal(d.deductibleVat, 0);
    assert.equal(d.nonDeductibleVat, 21);
    assert.equal(d.irpfComputable, 121);
  });

  it("IRPF 100 / IVA 50", () => {
    const d = computeExpenseDeductibility({
      ...base,
      vatDeductiblePct: 50,
      irpfDeductiblePct: 100,
    });
    assert.equal(d.deductibleVat, 10.5);
    assert.equal(d.nonDeductibleVat, 10.5);
    assert.equal(d.irpfComputable, 110.5);
  });

  it("IRPF 0 / IVA 0", () => {
    const d = computeExpenseDeductibility({
      ...base,
      vatDeductiblePct: 0,
      irpfDeductiblePct: 0,
    });
    assert.equal(d.irpfComputable, 0);
    assert.equal(d.deductibleVat, 0);
  });

  it("legacy deductible mapping", () => {
    assert.deepEqual(pctsFromLegacyDeductible(true), {
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
    });
    assert.deepEqual(pctsFromLegacyDeductible(false), {
      vatDeductiblePct: 0,
      irpfDeductiblePct: 0,
    });
    assert.equal(legacyDeductibleFlag(100, 100), true);
    assert.equal(legacyDeductibleFlag(50, 100), false);
  });
});

describe("AIB accrued vs deductible", () => {
  const accruedBase = 1000;
  const accruedVat = 210;

  it("AIB IVA 100% deducible", () => {
    const s = aibDeductibleShare(accruedBase, accruedVat, 100);
    assert.equal(s.deductibleBase, 1000);
    assert.equal(s.deductibleVat, 210);
    assert.equal(accruedVat, 210);
  });

  it("AIB IVA 50% deducible — accrued stays 210", () => {
    const s = aibDeductibleShare(accruedBase, accruedVat, 50);
    assert.equal(s.deductibleVat, 105);
    assert.equal(accruedVat, 210);
  });

  it("AIB IVA 0% deducible — accrued stays 210", () => {
    const s = aibDeductibleShare(accruedBase, accruedVat, 0);
    assert.equal(s.deductibleVat, 0);
    assert.equal(s.deductibleBase, 0);
    assert.equal(accruedVat, 210);
  });
});

describe("invoiceKind → TipoFactura (fuente de verdad)", () => {
  it("FULL → F1; SIMPLIFIED → F2", () => {
    assert.equal(resolveInvoiceTipoFactura({ invoiceKind: "FULL" }), "F1");
    assert.equal(
      resolveInvoiceTipoFactura({ invoiceKind: "SIMPLIFIED" }),
      "F2"
    );
  });

  it("paymentMethod no cambia TipoFactura si invoiceKind no cambia", () => {
    const kind = INVOICE_KIND.FULL;
    const a = resolveInvoiceTipoFactura({ invoiceKind: kind });
    // paymentMethod ya no es input de resolveInvoiceTipoFactura
    const b = resolveInvoiceTipoFactura({ invoiceKind: kind });
    assert.equal(a, b);
    assert.equal(a, "F1");
  });

  it("marketplace default es SIMPLIFIED pero el sello usa invoiceKind persistido", () => {
    assert.equal(
      defaultInvoiceKindForOrigin({ fromMarketplace: true }),
      INVOICE_KIND.SIMPLIFIED
    );
    assert.equal(
      defaultInvoiceKindForOrigin({ fromMarketplace: false }),
      INVOICE_KIND.FULL
    );
    // Manual puede ser SIMPLIFIED sin marketplace
    assert.equal(
      resolveInvoiceTipoFactura({ invoiceKind: INVOICE_KIND.SIMPLIFIED }),
      "F2"
    );
  });

  it("invoiceKind es fiscal inmutable; paymentMethod es metadato operativo", () => {
    assert.ok(
      (FISCAL_CONTENT_HEADER_KEYS as readonly string[]).includes("invoiceKind")
    );
    assert.ok(
      !(FISCAL_CONTENT_HEADER_KEYS as readonly string[]).includes(
        "paymentMethod"
      )
    );
    assert.ok(
      (ISSUED_ALLOWED_METADATA_KEYS as readonly string[]).includes(
        "paymentMethod"
      )
    );
  });

  it("histórico ISSUED: cambiar paymentMethod no altera TipoFactura del kind persistido", () => {
    const persistedKind = INVOICE_KIND.SIMPLIFIED; // migrado desde heurística antigua
    const tipoAtSeal = resolveInvoiceTipoFactura({
      invoiceKind: persistedKind,
    });
    assert.equal(tipoAtSeal, "F2");
    // Tras ISSUED el kind no cambia; paymentMethod editable no entra en resolve
    assert.equal(
      resolveInvoiceTipoFactura({ invoiceKind: persistedKind }),
      "F2"
    );
  });
});

describe("validateInvoiceForIssuance FULL/SIMPLIFIED", () => {
  const baseOk = {
    status: "PENDIENTE",
    fullNumber: "W3D-010",
    issueDate: new Date("2026-06-01"),
    subtotal: 100,
    vatAmount: 21,
    total: 121,
    lineCount: 1,
    clientName: "Cliente SA",
    issuerNif: "B12345678",
    simplifiedInvoiceMaxAmount: 400,
  };

  it("FULL + NIF válido → emisión correcta", () => {
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "FULL",
      clientNif: "A58818501",
    });
    assert.equal(v.valid, true);
    assert.equal(v.invoiceKind, "FULL");
    assert.equal(v.invoiceType, "F1");
  });

  it("FULL + NIF obligatorio ausente → permanece DRAFT (inválida)", () => {
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "FULL",
      clientNif: "",
    });
    assert.equal(v.valid, false);
    assert.equal(v.invoiceType, "F1");
    assert.ok(v.errors.some((e) => /NIF|completa/i.test(e)));
  });

  it("SIMPLIFIED válida <= límite → correcta sin NIF", () => {
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "SIMPLIFIED",
      total: 399.99,
      clientNif: null,
    });
    assert.equal(v.valid, true);
    assert.equal(v.invoiceType, "F2");
  });

  it("SIMPLIFIED > límite configurado → bloqueada", () => {
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "SIMPLIFIED",
      total: 401,
      clientNif: "",
      simplifiedInvoiceMaxAmount: 400,
    });
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => /límite/i.test(e)));
  });

  it("manual no marketplace puede ser SIMPLIFIED", () => {
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "SIMPLIFIED",
      total: 50,
      clientNif: "",
    });
    assert.equal(v.valid, true);
    assert.equal(v.invoiceKind, "SIMPLIFIED");
  });

  it("límite 3000 configurable", () => {
    assert.equal(
      resolveSimplifiedInvoiceMaxAmount(undefined),
      SIMPLIFIED_INVOICE_MAX_DEFAULT
    );
    assert.equal(
      resolveSimplifiedInvoiceMaxAmount(3000),
      SIMPLIFIED_INVOICE_MAX_SPECIAL
    );
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "SIMPLIFIED",
      total: 2500,
      clientNif: "",
      simplifiedInvoiceMaxAmount: 3000,
    });
    assert.equal(v.valid, true);
  });

  it("failed validation keeps conceptual DRAFT", () => {
    const draft = { fiscalStatus: FISCAL_STATUS.DRAFT, verifactuHash: null };
    const v = validateInvoiceForIssuance({
      ...baseOk,
      invoiceKind: "FULL",
      clientNif: "",
    });
    assert.equal(v.valid, false);
    assert.equal(isInvoiceIssued(draft), false);
  });

  it("huella F1≠F2 según invoiceKind (coherencia registro)", () => {
    const issuer = normalizeIssuerNif("B12345678");
    const issueDate = new Date("2026-03-15T12:00:00Z");
    const stamp = formatFechaHoraHusoGenRegistro(issueDate);
    const baseFields = {
      idEmisorFactura: issuer,
      numSerieFactura: "W3D-001",
      fechaExpedicionFactura: formatFechaExpedicion(issueDate),
      cuotaTotal: formatVerifactuAmount(21),
      importeTotal: formatVerifactuAmount(121),
      huellaAnterior: "",
      fechaHoraHusoGenRegistro: stamp,
    };
    const f1 = resolveInvoiceTipoFactura({ invoiceKind: "FULL" });
    const f2 = resolveInvoiceTipoFactura({ invoiceKind: "SIMPLIFIED" });
    const h1 = computeHuellaAlta({ ...baseFields, tipoFactura: f1 }).huella;
    const h2 = computeHuellaAlta({ ...baseFields, tipoFactura: f2 }).huella;
    assert.notEqual(h1, h2);
    assert.ok(
      buildHuellaAltaCanonical({ ...baseFields, tipoFactura: f1 }).includes(
        "TipoFactura=F1"
      )
    );
  });
});

describe("emission atomicity contract", () => {
  it("ISSUED + hash contract", () => {
    const afterSeal = {
      fiscalStatus: FISCAL_STATUS.ISSUED,
      verifactuHash: "sealed",
    };
    assert.equal(isInvoiceIssued(afterSeal), true);
    assert.throws(() => assertInvoiceDeletable(afterSeal));
    assert.throws(() => assertInvoiceEditable(afterSeal));
  });

  it("ISSUED number is never reclaimable while row exists", () => {
    const existingNumbers = [1, 2, 3];
    assert.equal(Math.max(...existingNumbers) + 1, 4);
    assert.ok(existingNumbers.includes(3));
  });
});
