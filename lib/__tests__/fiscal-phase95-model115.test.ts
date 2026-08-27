import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExpenseDeductibility } from "../expense-deductibility";
import { aggregateModel303Period } from "../modelo-303";
import { quarterRange } from "../fiscal";
import {
  buildModel115,
  collectEffective115Withholdings,
  resolve115WithholdingPeriod,
  assess115FilingObligation,
  build115PresentedSnapshot,
  parse115PresentedSnapshot,
  resolve115Deadline,
} from "../modelo-115";
import type {
  Model115LeaseRef,
  Model115WithholdingRow,
} from "../modelo-115";
import { WITHHOLDING_STATUS } from "../fiscal-withholding";
import { sumEffectiveRentWithholdingsForYear } from "../fiscal-leases";
import { buildFiscalObligationsFromSnapshot } from "../fiscal-obligations";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { resolveHealthStatus } from "../fiscal-health/issue";

function row(
  partial: Partial<Model115WithholdingRow> & {
    id: string;
    counterpartyId: string;
    baseAmount: number;
    withholdingAmount: number;
    paymentDate: Date | null;
    accrualDate: Date;
  }
): Model115WithholdingRow {
  const taxId = partial.counterparty?.taxId ?? "12345678Z";
  return {
    direction: "PRACTICED",
    kind: "RENT",
    status: WITHHOLDING_STATUS.ACTIVE,
    rectifiesId: null,
    sourceType: "EXPENSE",
    sourceId: `exp-${partial.id}`,
    rate: 19,
    year: partial.accrualDate.getFullYear(),
    quarter: Math.ceil((partial.accrualDate.getMonth() + 1) / 3),
    leaseId: partial.leaseId ?? `lease-${partial.counterpartyId}`,
    counterparty: {
      id: partial.counterpartyId,
      name: partial.counterparty?.name ?? "Arrendador",
      taxId,
      normalizedTaxId: taxId,
      kind: "LANDLORD",
      countryCode: "ES",
      requiresReview: false,
    },
    ...partial,
  };
}

function lease(
  partial: Partial<Model115LeaseRef> & { id: string; counterpartyId: string }
): Model115LeaseRef {
  return {
    propertyAddress: partial.propertyAddress ?? "Local Vigo",
    withholdingStatus: partial.withholdingStatus ?? "YES",
    withholdingExemptionReason: partial.withholdingExemptionReason ?? null,
    active: partial.active ?? true,
    ...partial,
  };
}

describe("Fase 9.5 — Modelo 115 alquileres", () => {
  describe("regla temporal paymentDate", () => {
    it("factura 28/03 pagada 05/04 → 2T", () => {
      const r = resolve115WithholdingPeriod({
        accrualDate: new Date("2026-03-28"),
        paymentDate: new Date("2026-04-05"),
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.quarter, 2);
        assert.equal(r.basis, "paymentDate");
      }
    });

    it("sin paymentDate → requiresReview", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 1,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 190,
            accrualDate: new Date("2026-03-28"),
            paymentDate: null,
          }),
        ],
        leases: [lease({ id: "lease-c1", counterpartyId: "c1" })],
        censusModel115: "YES",
      });
      assert.equal(draft.requiresReview, true);
      assert.ok(
        draft.warnings.some((w) => w.code === "MODEL115_PAYMENT_DATE_MISSING")
      );
      assert.equal(draft.boxes.box02, 0);
    });
  });

  describe("perceptores", () => {
    it("3 pagos mismo arrendador → box01 = 1", () => {
      const base = {
        counterpartyId: "c1",
        leaseId: "lease-c1",
        accrualDate: new Date("2026-05-01"),
        paymentDate: new Date("2026-05-10"),
      };
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({ id: "a", baseAmount: 1000, withholdingAmount: 190, ...base }),
          row({ id: "b", baseAmount: 1000, withholdingAmount: 190, ...base }),
          row({ id: "c", baseAmount: 1000, withholdingAmount: 190, ...base }),
        ],
        leases: [lease({ id: "lease-c1", counterpartyId: "c1" })],
        censusModel115: "YES",
      });
      assert.equal(draft.boxes.box01, 1);
      assert.equal(draft.boxes.box02, 3000);
      assert.equal(draft.boxes.box03, 570);
    });

    it("2 arrendadores → box01 = 2", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "a",
            counterpartyId: "c1",
            leaseId: "l1",
            baseAmount: 1000,
            withholdingAmount: 190,
            accrualDate: new Date("2026-05-01"),
            paymentDate: new Date("2026-05-10"),
          }),
          row({
            id: "b",
            counterpartyId: "c2",
            leaseId: "l2",
            baseAmount: 2000,
            withholdingAmount: 380,
            accrualDate: new Date("2026-05-02"),
            paymentDate: new Date("2026-05-11"),
            counterparty: {
              id: "c2",
              name: "B",
              taxId: "87654321X",
              normalizedTaxId: "87654321X",
              kind: "LANDLORD",
              countryCode: "ES",
              requiresReview: false,
            },
          }),
        ],
        leases: [
          lease({ id: "l1", counterpartyId: "c1" }),
          lease({ id: "l2", counterpartyId: "c2", propertyAddress: "Local A Coruña" }),
        ],
        censusModel115: "YES",
      });
      assert.equal(draft.boxes.box01, 2);
      assert.equal(draft.boxes.box02, 3000);
      assert.equal(draft.boxes.box03, 570);
      assert.equal(draft.boxes.box04, 0);
      assert.equal(draft.boxes.box05, 570);
      assert.equal(draft.outcome, "TO_PAY");
    });
  });

  describe("importes e integridad 130/303", () => {
    it("base 1000 IVA 210 ret 190 → box02=1000 box03=190", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 190,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        leases: [lease({ id: "lease-c1", counterpartyId: "c1" })],
        censusModel115: "YES",
      });
      assert.equal(draft.boxes.box02, 1000);
      assert.equal(draft.boxes.box03, 190);
      // payable 1020 / total 1210 no entran
      assert.notEqual(draft.boxes.box02, 1210);
      assert.notEqual(draft.boxes.box02, 1020);
    });

    it("115 no altera IRPF 130 ni IVA 303", () => {
      const base = {
        subtotal: 1000,
        vatAmount: 210,
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
      };
      const d1 = computeExpenseDeductibility(base);
      const d2 = computeExpenseDeductibility(base);
      assert.equal(d1.irpfComputable, d2.irpfComputable);
      assert.equal(d1.irpfComputable, 1000);

      const period = quarterRange(2026, 2);
      const expense = {
        id: "e1",
        issueDate: new Date("2026-05-10"),
        subtotal: 1000,
        vatAmount: 210,
        vatRate: 21,
        total: 1210,
        vatOperationType: "INTERIOR",
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
        isInvestment: false,
        supplierName: "Landlord",
      };
      const empty = { invoices: [], marketplace: [], assets: [] };
      const r1 = aggregateModel303Period({
        ...empty,
        expenses: [expense],
        from: period.from,
        to: period.to,
      });
      const r2 = aggregateModel303Period({
        ...empty,
        expenses: [{ ...expense, total: 1020 }],
        from: period.from,
        to: period.to,
      });
      assert.equal(r1.modelo303.boxes.box29, r2.modelo303.boxes.box29);
    });
  });

  describe("rectificación / lease / exención", () => {
    it("SUPERSEDED no doble cómputo", () => {
      const { included } = collectEffective115Withholdings({
        year: 2026,
        quarter: 2,
        periodicity: "QUARTERLY",
        withholdings: [
          row({
            id: "old",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 190,
            status: WITHHOLDING_STATUS.SUPERSEDED,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
          row({
            id: "new",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 180,
            rectifiesId: "old",
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        leasesById: new Map([
          ["lease-c1", lease({ id: "lease-c1", counterpartyId: "c1" })],
        ]),
      });
      assert.equal(included.length, 1);
      assert.equal(included[0]!.withholdingAmount, 180);
    });

    it("RENT + lease NO → mismatch", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            leaseId: "l1",
            baseAmount: 1000,
            withholdingAmount: 190,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        leases: [
          lease({
            id: "l1",
            counterpartyId: "c1",
            withholdingStatus: "NO",
            withholdingExemptionReason: "LOW_ANNUAL_AMOUNT",
          }),
        ],
        censusModel115: "YES",
      });
      assert.ok(
        draft.warnings.some(
          (w) => w.code === "MODEL115_LEASE_WITHHOLDING_MISMATCH"
        )
      );
    });

    it("lease NO + reason válido sin RENT → no operación", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [],
        leases: [
          lease({
            id: "l1",
            counterpartyId: "c1",
            withholdingStatus: "NO",
            withholdingExemptionReason: "LOW_ANNUAL_AMOUNT",
          }),
        ],
        censusModel115: "YES",
      });
      assert.equal(draft.outcome, "NO_RELEVANT_PAYMENTS");
      assert.equal(draft.boxes.box01, 0);
    });

    it("lease UNKNOWN → review warning", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [],
        leases: [
          lease({
            id: "l1",
            counterpartyId: "c1",
            withholdingStatus: "UNKNOWN",
          }),
        ],
        censusModel115: "UNKNOWN",
      });
      assert.ok(
        draft.warnings.some(
          (w) => w.code === "MODEL115_EXEMPTION_REVIEW_REQUIRED"
        )
      );
    });
  });

  describe("censo / filing / gate / 180 prep", () => {
    it("ops + census115=NO → mismatch", () => {
      const a = assess115FilingObligation({
        censusModel115: "NO",
        hasRelevantPayments: true,
        totalWithholdingAmount: 190,
        hasSubjectBaseWithZeroWithholding: false,
        requiresReview: false,
      });
      assert.ok(a.reasonCodes.includes("CENSUS_MODEL115_MISMATCH"));

      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: {
          nif: "B12345678",
          fiscalRegime: "130",
          censusModel115: "NO",
        },
        filings: [],
        model115HasOps: { 2: true },
        hasPracticedRentWithholding: true,
      });
      assert.ok(
        r.mismatches.some((m) => m.code === "CENSUS_MODEL115_MISMATCH")
      );
    });

    it("snapshot inmutable", () => {
      const draft = buildModel115({
        year: 2026,
        quarter: 2,
        withholdings: [
          row({
            id: "w1",
            counterpartyId: "c1",
            baseAmount: 1000,
            withholdingAmount: 190,
            accrualDate: new Date("2026-04-01"),
            paymentDate: new Date("2026-04-15"),
          }),
        ],
        leases: [lease({ id: "lease-c1", counterpartyId: "c1" })],
        censusModel115: "YES",
      });
      const snap = build115PresentedSnapshot(draft);
      draft.boxes.box05 = 999;
      const parsed = parse115PresentedSnapshot({ model115Snapshot: snap });
      assert.equal(parsed!.boxes.box05, 190);
    });

    it("deadline 2T julio", () => {
      const d = resolve115Deadline({
        year: 2026,
        quarter: 2,
        periodicity: "QUARTERLY",
      });
      assert.equal(d.dueDate.getMonth(), 6);
      assert.equal(d.requiresOfficialCalendarCheck, true);
    });

    it("gate 115 no bloquea 303", () => {
      const blocker = {
        code: "MODEL115_PAYMENT_DATE_MISSING",
        fingerprint: "x",
        severity: "ERROR" as const,
        blocksFiling: true,
        title: "Falta paymentDate",
        description: "",
        model: "115" as const,
        year: 2026,
        quarter: 2 as const,
      };
      const { status } = resolveHealthStatus([blocker]);
      assert.equal(
        evaluateFilingGateFromHealth(
          { status, blockers: [blocker], issues: [blocker] },
          "115"
        ).allowed,
        false
      );
      assert.equal(
        evaluateFilingGateFromHealth(
          { status, blockers: [blocker], issues: [blocker] },
          "303"
        ).allowed,
        true
      );
    });

    it("Σ 115 anual = sumEffectiveRentWithholdingsForYear", () => {
      const rows = [
        row({
          id: "q1",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 190,
          accrualDate: new Date("2026-02-01"),
          paymentDate: new Date("2026-02-10"),
        }),
        row({
          id: "q2",
          counterpartyId: "c1",
          baseAmount: 2000,
          withholdingAmount: 380,
          accrualDate: new Date("2026-05-01"),
          paymentDate: new Date("2026-05-10"),
        }),
      ];
      const leases = [lease({ id: "lease-c1", counterpartyId: "c1" })];
      let annualBase = 0;
      let annualWh = 0;
      for (const q of [1, 2, 3, 4] as const) {
        const d = buildModel115({
          year: 2026,
          quarter: q,
          withholdings: rows,
          leases,
          censusModel115: "YES",
        });
        annualBase += d.boxes.box02;
        annualWh += d.boxes.box03;
      }
      const agg = sumEffectiveRentWithholdingsForYear(
        2026,
        rows.map((w) => ({
          id: w.id,
          status: w.status,
          rectifiesId: w.rectifiesId,
          counterpartyId: w.counterpartyId,
          sourceType: w.sourceType,
          sourceId: w.sourceId,
          baseAmount: w.baseAmount,
          withholdingAmount: w.withholdingAmount,
          paymentDate: w.paymentDate,
          accrualDate: w.accrualDate,
          counterparty: {
            id: w.counterparty.id,
            name: w.counterparty.name,
            taxId: w.counterparty.taxId,
          },
          leaseId: w.leaseId,
        }))
      );
      assert.equal(annualBase, agg.baseAmount);
      assert.equal(annualWh, agg.withholdingAmount);
      assert.equal(agg.baseAmount, 3000);
      assert.equal(agg.withholdingAmount, 570);
    });
  });
});
