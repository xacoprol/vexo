import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildModel111,
  collectEffective111Withholdings,
  compute111Box28,
  resolve111WithholdingPeriod,
  assess111FilingObligation,
  build111PresentedSnapshot,
  parse111PresentedSnapshot,
  resolve111Deadline,
} from "../modelo-111";
import type { Model111WithholdingRow } from "../modelo-111";
import { WITHHOLDING_STATUS } from "../fiscal-withholding";
import { buildFiscalObligationsFromSnapshot } from "../fiscal-obligations";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { resolveHealthStatus } from "../fiscal-health/issue";

function row(
  partial: Partial<Model111WithholdingRow> & {
    id: string;
    counterpartyId: string;
    baseAmount: number;
    withholdingAmount: number;
    paymentDate: Date | null;
    accrualDate: Date;
  }
): Model111WithholdingRow {
  const taxId = partial.counterparty?.taxId ?? "12345678Z";
  return {
    direction: "PRACTICED",
    kind: "PROFESSIONAL",
    status: WITHHOLDING_STATUS.ACTIVE,
    rectifiesId: null,
    sourceType: "EXPENSE",
    sourceId: `exp-${partial.id}`,
    rate: 15,
    year: partial.accrualDate.getFullYear(),
    quarter: Math.ceil((partial.accrualDate.getMonth() + 1) / 3),
    counterparty: {
      id: partial.counterpartyId,
      name: partial.counterparty?.name ?? "Profesional",
      taxId,
      normalizedTaxId: taxId,
      kind: "PROFESSIONAL",
      countryCode: "ES",
      requiresReview: false,
    },
    ...partial,
  };
}

describe("Fase 9.4 — Modelo 111 profesionales", () => {
  describe("regla temporal paymentDate", () => {
    it("factura 28/03 pagada 05/04 → 2T no 1T", () => {
      const r = resolve111WithholdingPeriod({
        accrualDate: new Date("2026-03-28"),
        paymentDate: new Date("2026-04-05"),
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.quarter, 2);
        assert.equal(r.year, 2026);
        assert.equal(r.basis, "paymentDate");
      }
    });

    it("sin paymentDate → requiresReview / no asume accrual", () => {
      const r = resolve111WithholdingPeriod({
        accrualDate: new Date("2026-03-28"),
        paymentDate: null,
      });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.code, "MODEL111_PAYMENT_DATE_MISSING");
        assert.equal(r.requiresReview, true);
      }
      const draft = buildModel111({
        year: 2026,
        quarter: 1,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 150,
            accrualDate: new Date("2026-03-28"),
            paymentDate: null,
          }),
        ],
      });
      assert.equal(draft.requiresReview, true);
      assert.ok(
        draft.warnings.some((w) => w.code === "MODEL111_PAYMENT_DATE_MISSING")
      );
      assert.equal(draft.boxes.box08, 0);
    });
  });

  describe("perceptores box07", () => {
    it("3 facturas mismo profesional → box07 = 1", () => {
      const base = {
        counterpartyId: "c1",
        accrualDate: new Date("2026-05-01"),
        paymentDate: new Date("2026-05-10"),
      };
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({ id: "a", baseAmount: 1000, withholdingAmount: 150, ...base }),
          row({ id: "b", baseAmount: 500, withholdingAmount: 75, ...base }),
          row({ id: "c", baseAmount: 200, withholdingAmount: 30, ...base }),
        ],
        censusModel111: "YES",
      });
      assert.equal(draft.boxes.box07, 1);
      assert.equal(draft.boxes.box08, 1700);
      assert.equal(draft.boxes.box09, 255);
    });

    it("2 profesionales → box07 = 2", () => {
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "a",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 150,
            accrualDate: new Date("2026-05-01"),
            paymentDate: new Date("2026-05-10"),
            counterparty: {
              id: "c1",
              name: "A",
              taxId: "12345678Z",
              normalizedTaxId: "12345678Z",
              kind: "PROFESSIONAL",
              countryCode: "ES",
              requiresReview: false,
            },
          }),
          row({
            id: "b",
            counterpartyId: "c2",
            baseAmount: 500,
            withholdingAmount: 75,
            accrualDate: new Date("2026-05-02"),
            paymentDate: new Date("2026-05-11"),
            counterparty: {
              id: "c2",
              name: "B",
              taxId: "87654321X",
              normalizedTaxId: "87654321X",
              kind: "PROFESSIONAL",
              countryCode: "ES",
              requiresReview: false,
            },
          }),
        ],
        censusModel111: "YES",
      });
      assert.equal(draft.boxes.box07, 2);
      assert.equal(draft.boxes.box08, 1500);
      assert.equal(draft.boxes.box09, 225);
      assert.equal(draft.boxes.box28, 225);
      assert.equal(draft.boxes.box30, 225);
      assert.equal(compute111Box28(draft.boxes), 225);
      assert.equal(draft.outcome, "TO_PAY");
    });
  });

  describe("importes", () => {
    it("base 1000 IVA 210 ret 150 → box08=1000 box09=150", () => {
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 150,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        censusModel111: "YES",
      });
      assert.equal(draft.boxes.box08, 1000);
      assert.equal(draft.boxes.box09, 150);
      assert.equal(draft.boxes.box29, 0);
      assert.equal(draft.boxes.box30, 150);
    });
  });

  describe("outcomes", () => {
    it("retención 0 con base → NEGATIVE", () => {
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 0,
            rate: 0,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        censusModel111: "YES",
      });
      assert.equal(draft.outcome, "NEGATIVE");
      assert.equal(draft.boxes.box08, 1000);
      assert.equal(draft.boxes.box09, 0);
    });

    it("sin pagos → NO_RELEVANT_PAYMENTS", () => {
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [],
        censusModel111: "YES",
      });
      assert.equal(draft.outcome, "NO_RELEVANT_PAYMENTS");
      assert.equal(draft.filingObligation.operationsSignal, "ZERO_OPS");
      assert.notEqual(draft.filingObligation.status, "NOT_REQUIRED");
    });
  });

  describe("rectificaciones", () => {
    it("SUPERSEDED no se suma junto al ACTIVE que lo rectifica", () => {
      const { included } = collectEffective111Withholdings({
        year: 2026,
        quarter: 2,
        periodicity: "QUARTERLY",
        withholdings: [
          row({
            id: "old",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 150,
            status: WITHHOLDING_STATUS.SUPERSEDED,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
          row({
            id: "new",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 140,
            rectifiesId: "old",
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
      });
      assert.equal(included.length, 1);
      assert.equal(included[0]!.id, "new");
      assert.equal(included[0]!.withholdingAmount, 140);
    });
  });

  describe("censo + obligations", () => {
    it("ops + census111=NO → mismatch", () => {
      const a = assess111FilingObligation({
        censusModel111: "NO",
        hasRelevantPayments: true,
        totalWithholdingAmount: 150,
        hasSubjectBaseWithZeroWithholding: false,
        requiresReview: false,
      });
      assert.ok(a.reasonCodes.includes("CENSUS_MODEL111_MISMATCH"));

      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: {
          nif: "B12345678",
          fiscalRegime: "130",
          censusModel111: "NO",
          censusModel130: "YES",
          censusModel303: "YES",
        },
        filings: [],
        model111HasOps: { 2: true },
        hasPracticedProfessionalWithholding: true,
      });
      assert.ok(
        r.mismatches.some((m) => m.code === "CENSUS_MODEL111_MISMATCH")
      );
      const e = r.obligations.find(
        (o) => o.model === "111" && o.period.quarter === 2
      );
      assert.equal(e!.operationsSignal, "HAS_OPS");
    });

    it("census YES + zero ops → no NOT_REQUIRED ni presentar 0", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: {
          nif: "B12345678",
          fiscalRegime: "130",
          censusModel111: "YES",
        },
        filings: [],
        model111HasOps: { 2: false },
      });
      const e = r.obligations.find(
        (o) => o.model === "111" && o.period.quarter === 2
      );
      assert.equal(e!.operationsSignal, "ZERO_OPS");
      assert.notEqual(e!.obligationStatus, "NOT_REQUIRED");
      assert.ok(e!.reasonCodes.includes("ZERO_OPS_NOT_EXEMPT"));
    });
  });

  describe("filing snapshot inmutable", () => {
    it("snapshot parseable y no muta draft", () => {
      const draft = buildModel111({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 150,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        censusModel111: "YES",
      });
      const snap = build111PresentedSnapshot(draft);
      draft.boxes.box30 = 999;
      const parsed = parse111PresentedSnapshot({ model111Snapshot: snap });
      assert.ok(parsed);
      assert.equal(parsed!.boxes.box30, 150);
      assert.equal(parsed!.outcome, "TO_PAY");
    });
  });

  describe("calendario", () => {
    it("2T → julio (ajuste weekend)", () => {
      const d = resolve111Deadline({
        year: 2026,
        quarter: 2,
        periodicity: "QUARTERLY",
      });
      assert.equal(d.dueDate.getMonth(), 6); // julio
      assert.equal(d.requiresOfficialCalendarCheck, true);
    });
  });

  describe("Health gate aislamiento", () => {
    it("paymentDate missing bloquea 111 no 303", () => {
      const blocker = {
        code: "MODEL111_PAYMENT_DATE_MISSING",
        fingerprint: "x",
        severity: "ERROR" as const,
        blocksFiling: true,
        title: "Falta paymentDate",
        description: "",
        model: "111" as const,
        year: 2026,
        quarter: 2 as const,
      };
      const { status } = resolveHealthStatus([blocker]);
      const gate111 = evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "111"
      );
      const gate303 = evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "303"
      );
      assert.equal(gate111.allowed, false);
      assert.equal(gate303.allowed, true);
    });
  });
});
