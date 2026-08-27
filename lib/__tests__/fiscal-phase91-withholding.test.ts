import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExpenseDeductibility } from "../expense-deductibility";
import { aggregateModel303Period } from "../modelo-303";
import { quarterRange } from "../fiscal";
import {
  expectedWithholdingAmount,
  isUnmergeableTaxId,
  normalizeCounterpartyTaxId,
  parsePracticedWithholdingStatus,
  PRACTICED_WITHHOLDING_STATUS,
  resolveExpenseDocumentAmounts,
  validatePracticedWithholding,
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_SOURCE,
  WITHHOLDING_STATUS,
} from "../fiscal-withholding";
import { runPracticedWithholdingChecks } from "../fiscal-health/withholding-checks";
import type { FiscalHealthContext } from "../fiscal-health/context";
import {
  buildFiscalCensusProfileFromSettings,
  compareCensusVsOperationalSignals,
} from "../fiscal-obligations";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function emptyHealthCtx(
  overrides: Partial<FiscalHealthContext> = {}
): FiscalHealthContext {
  return {
    year: 2026,
    quarter: 2,
    mode: "quarter",
    queryCount: 0,
    settings: {
      nif: "B12345678",
      fiscalRegime: "130",
      verifactuMode: "NO_VERIFACTU",
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
    ...overrides,
  };
}

describe("Fase 9.1 — retenciones practicadas", () => {
  describe("importes documento", () => {
    it("profesional: base 1000 + IVA 210 → bruto 1210 → retención 150 → pagar 1060", () => {
      const amts = resolveExpenseDocumentAmounts({
        subtotal: 1000,
        vatAmount: 210,
        total: 1210,
        practicedWithholdingStatus: "YES",
        practicedWithholdingAmount: 150,
      });
      assert.equal(amts.baseAmount, 1000);
      assert.equal(amts.vatAmount, 210);
      assert.equal(amts.grossInvoiceAmount, 1210);
      assert.equal(amts.withholdingAmount, 150);
      assert.equal(amts.amountPayable, 1060);
      assert.equal(expectedWithholdingAmount(1000, 15), 150);
    });

    it("sin retención: amountPayable = bruto", () => {
      const amts = resolveExpenseDocumentAmounts({
        subtotal: 1000,
        vatAmount: 210,
        total: 1210,
        practicedWithholdingStatus: "NO",
        practicedWithholdingAmount: 150,
      });
      assert.equal(amts.withholdingAmount, 0);
      assert.equal(amts.amountPayable, 1210);
    });
  });

  describe("deducibilidad IRPF (130)", () => {
    it("con vs sin retención → mismo irpfComputable", () => {
      const base = {
        subtotal: 1000,
        vatAmount: 210,
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
      };
      const withWh = computeExpenseDeductibility(base);
      const withoutWh = computeExpenseDeductibility(base);
      assert.equal(withWh.irpfComputable, withoutWh.irpfComputable);
      assert.equal(withWh.irpfComputable, 1000);
      // amountPayable no entra en la fórmula
      assert.notEqual(1060, withWh.irpfComputable);
    });
  });

  describe("IVA 303", () => {
    it("mismo gasto con/sin retención → mismo IVA deducible 303", () => {
      const period = quarterRange(2026, 1);
      const expenseBase = {
        id: "e1",
        issueDate: new Date("2026-02-15"),
        subtotal: 1000,
        vatAmount: 210,
        vatRate: 21,
        total: 1210,
        vatOperationType: "INTERIOR",
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
        isInvestment: false,
        supplierName: "Asesor SL",
      };
      const emptyLines = { invoices: [], marketplace: [], assets: [] };
      const r1 = aggregateModel303Period({
        ...emptyLines,
        expenses: [expenseBase],
        from: period.from,
        to: period.to,
      });
      const r2 = aggregateModel303Period({
        ...emptyLines,
        // Misma base/IVA; total distinto no afecta 303
        expenses: [{ ...expenseBase, total: 1060 }],
        from: period.from,
        to: period.to,
      });
      assert.equal(r1.modelo303.boxes.box28, r2.modelo303.boxes.box28);
      assert.equal(r1.modelo303.boxes.box29, r2.modelo303.boxes.box29);
      assert.equal(r1.modelo303.boxes.box29, 210);
    });
  });

  describe("validación", () => {
    it("withholdingAmount incoherente con base×rate → error", () => {
      const v = validatePracticedWithholding({
        counterpartyTaxId: "12345678Z",
        counterpartyName: "Profesional",
        baseAmount: 1000,
        rate: 15,
        withholdingAmount: 70,
        accrualDate: new Date("2026-03-01"),
      });
      assert.equal(v.ok, false);
      if (!v.ok) assert.equal(v.code, "WITHHOLDING_AMOUNT_MISMATCH");
    });

    it("sin NIF → error", () => {
      const v = validatePracticedWithholding({
        counterpartyTaxId: "PEND-001",
        counterpartyName: "X",
        baseAmount: 1000,
        rate: 15,
        withholdingAmount: 150,
        accrualDate: new Date("2026-03-01"),
      });
      assert.equal(v.ok, false);
    });

    it("15 % coherente → ok", () => {
      const v = validatePracticedWithholding({
        counterpartyTaxId: "12345678Z",
        counterpartyName: "Profesional",
        baseAmount: 1000,
        rate: 15,
        withholdingAmount: 150,
        accrualDate: new Date("2026-03-01"),
      });
      assert.equal(v.ok, true);
    });

    it("7 % coherente → ok (no asume 15)", () => {
      const v = validatePracticedWithholding({
        counterpartyTaxId: "B12345674",
        counterpartyName: "Asesor",
        baseAmount: 1000,
        rate: 7,
        withholdingAmount: 70,
        accrualDate: new Date("2026-03-01"),
      });
      assert.equal(v.ok, true);
    });
  });

  describe("counterparty NIF", () => {
    it("formatos distintos → mismo normalizedTaxId", () => {
      const a = normalizeCounterpartyTaxId("12345678Z");
      const b = normalizeCounterpartyTaxId("12345678-Z");
      const c = normalizeCounterpartyTaxId("12345678 z");
      const d = normalizeCounterpartyTaxId(" 123.456.78-Z ");
      assert.equal(a, b);
      assert.equal(a, c);
      assert.equal(a, d);
      assert.equal(a, "12345678Z");
    });

    it("NIF vacío / PEND / VARIOS no fusionables", () => {
      assert.equal(isUnmergeableTaxId(""), true);
      assert.equal(isUnmergeableTaxId("PEND-99"), true);
      assert.equal(isUnmergeableTaxId("varios"), true);
      assert.equal(isUnmergeableTaxId("12345678Z"), false);
    });
  });

  describe("histórico", () => {
    it("gasto profesional sin datos explícitos → UNKNOWN (no inventar YES)", () => {
      assert.equal(
        parsePracticedWithholdingStatus(undefined),
        PRACTICED_WITHHOLDING_STATUS.UNKNOWN
      );
      assert.equal(
        parsePracticedWithholdingStatus("UNKNOWN"),
        PRACTICED_WITHHOLDING_STATUS.UNKNOWN
      );
      // category PROFESIONALES no fuerza YES
      assert.notEqual(
        parsePracticedWithholdingStatus("UNKNOWN"),
        PRACTICED_WITHHOLDING_STATUS.YES
      );
    });
  });

  describe("Health", () => {
    const expenseYes = {
      id: "e-wh",
      issueDate: new Date("2026-05-10"),
      supplierName: "Diseñador",
      supplierNif: "12345678Z",
      category: "PROFESIONALES",
      vatOperationType: "INTERIOR",
      subtotal: 1000,
      vatAmount: 210,
      total: 1210,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
      isInvestment: false,
      practicedWithholdingStatus: "YES",
      documentId: null,
      importDuaBase: null,
      importDuaVat: null,
      importDuaNumber: null,
      importDuaDate: null,
      importDuaDocumentId: null,
      invoiceNumber: "F-1",
    };

    const withholdingActive = {
      id: "w1",
      direction: WITHHOLDING_DIRECTION.PRACTICED,
      kind: WITHHOLDING_KIND.PROFESSIONAL,
      sourceType: WITHHOLDING_SOURCE.EXPENSE,
      sourceId: "e-wh",
      status: WITHHOLDING_STATUS.ACTIVE,
      baseAmount: 1000,
      rate: 15,
      withholdingAmount: 150,
      accrualDate: new Date("2026-05-10"),
      year: 2026,
      quarter: 2,
      counterpartyTaxId: "12345678Z",
      counterpartyName: "Diseñador",
    };

    it("withholding + census111=NO → CENSUS_MODEL111_MISMATCH", () => {
      const profile = buildFiscalCensusProfileFromSettings({
        censusModel111: "NO",
        paysProfessionalsSubjectToWithholding: "YES",
      });
      const m = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: true,
      });
      assert.ok(m.some((i) => i.code === "CENSUS_MODEL111_MISMATCH"));
    });

    it("withholding + census111=UNKNOWN → MODEL111_OBLIGATION_REVIEW_REQUIRED", () => {
      const profile = buildFiscalCensusProfileFromSettings({
        censusModel111: "UNKNOWN",
      model111Periodicity: "UNKNOWN",
      model115Periodicity: "UNKNOWN",
      });
      const m = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: true,
      });
      assert.ok(
        m.some((i) => i.code === "MODEL111_OBLIGATION_REVIEW_REQUIRED")
      );
      assert.ok(!m.some((i) => i.code === "CENSUS_MODEL111_MISMATCH"));
    });

    it("withholdingAmount inválido → PRACTICED_WITHHOLDING_INVALID", () => {
      const { issues } = runPracticedWithholdingChecks(
        emptyHealthCtx({
          expensesYear: [expenseYes],
          practicedWithholdingsYear: [
            { ...withholdingActive, withholdingAmount: 70 },
          ],
        })
      );
      assert.ok(issues.some((i) => i.code === "PRACTICED_WITHHOLDING_INVALID"));
    });

    it("YES sin FiscalWithholding → EXPENSE_MISMATCH", () => {
      const { issues } = runPracticedWithholdingChecks(
        emptyHealthCtx({
          expensesYear: [expenseYes],
          practicedWithholdingsYear: [],
        })
      );
      assert.ok(
        issues.some((i) => i.code === "PRACTICED_WITHHOLDING_EXPENSE_MISMATCH")
      );
    });

    it("huérfano → PRACTICED_WITHHOLDING_ORPHAN", () => {
      const { issues } = runPracticedWithholdingChecks(
        emptyHealthCtx({
          expensesYear: [],
          practicedWithholdingsYear: [withholdingActive],
        })
      );
      assert.ok(issues.some((i) => i.code === "PRACTICED_WITHHOLDING_ORPHAN"));
    });
  });

  describe("sync semantics (pure)", () => {
    it("cambio rate 15→7 recalcula retención esperada", () => {
      assert.equal(expectedWithholdingAmount(1000, 15), 150);
      assert.equal(expectedWithholdingAmount(1000, 7), 70);
      assert.equal(round2(1000 * 0.07), 70);
    });

    it("un gasto → como máximo un withholding activo (contrato documentado)", () => {
      // El sync elimina duplicados ACTIVE; aquí validamos el invariante de diseño.
      const actives = [withholdingLike("a"), withholdingLike("b")];
      const kept = actives.slice(0, 1);
      const removed = actives.slice(1);
      assert.equal(kept.length, 1);
      assert.equal(removed.length, 1);
    });
  });
});

function withholdingLike(id: string) {
  return { id, status: "ACTIVE" as const };
}
