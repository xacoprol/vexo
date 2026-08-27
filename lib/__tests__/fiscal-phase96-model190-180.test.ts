import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildModel190 } from "../modelo-190/engine";
import {
  build190PresentedSnapshot,
  parse190PresentedSnapshot,
} from "../modelo-190/presentation";
import { resolve190PerceptionClassification } from "../modelo-190/classify";
import { assess190FilingObligation } from "../modelo-190/filing-obligation";
import { resolve190Deadline } from "../modelo-190/deadlines";
import { buildModel180 } from "../modelo-180/engine";
import {
  build180PresentedSnapshot,
  parse180PresentedSnapshot,
} from "../modelo-180/presentation";
import { assess180FilingObligation } from "../modelo-180/filing-obligation";
import { resolve180Deadline } from "../modelo-180/deadlines";
import { buildFiscalObligationsFromSnapshot } from "../fiscal-obligations";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { resolveHealthStatus } from "../fiscal-health/issue";
import { WITHHOLDING_STATUS } from "../fiscal-withholding";
import type { Model190WithholdingRow } from "../modelo-190/types";
import type {
  Model180LeaseRef,
  Model180WithholdingRow,
} from "../modelo-180/types";
import type { Quarter111SnapshotInput } from "../modelo-190/reconcile";
import type { Quarter115SnapshotInput } from "../modelo-180/reconcile";

function prof(
  partial: Partial<Model190WithholdingRow> & {
    id: string;
    counterpartyId: string;
    baseAmount: number;
    withholdingAmount: number;
    paymentDate: Date | null;
  }
): Model190WithholdingRow {
  const taxId = partial.counterparty?.taxId ?? "12345678Z";
  return {
    direction: "PRACTICED",
    kind: "PROFESSIONAL",
    status: WITHHOLDING_STATUS.ACTIVE,
    rectifiesId: null,
    sourceType: "EXPENSE",
    sourceId: `exp-${partial.id}`,
    rate: 15,
    accrualDate: partial.paymentDate ?? new Date("2026-01-01"),
    year: 2026,
    quarter: 1,
    perceptionKey: partial.perceptionKey ?? "G",
    perceptionSubKey: partial.perceptionSubKey ?? "01",
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

function rent(
  partial: Partial<Model180WithholdingRow> & {
    id: string;
    counterpartyId: string;
    leaseId: string | null;
    baseAmount: number;
    withholdingAmount: number;
    paymentDate: Date | null;
  }
): Model180WithholdingRow {
  const taxId = partial.counterparty?.taxId ?? "A12345678";
  return {
    direction: "PRACTICED",
    kind: "RENT",
    status: WITHHOLDING_STATUS.ACTIVE,
    rectifiesId: null,
    sourceType: "EXPENSE",
    sourceId: `exp-${partial.id}`,
    rate: 19,
    accrualDate: partial.paymentDate ?? new Date("2026-01-01"),
    year: 2026,
    quarter: 1,
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
  partial: Partial<Model180LeaseRef> & { id: string; counterpartyId: string }
): Model180LeaseRef {
  return {
    propertyAddress: partial.propertyAddress ?? "Local 1",
    cadastralReference: partial.cadastralReference ?? "1234567AB1234C0001XX",
    withholdingStatus: partial.withholdingStatus ?? "YES",
    active: partial.active ?? true,
    ...partial,
  };
}

describe("Fase 9.6 — Modelo 190", () => {
  it("3 pagos mismo profesional misma key → 1 registro", () => {
    const base = {
      counterpartyId: "c1",
      perceptionKey: "G",
      perceptionSubKey: "01",
    };
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-02-10"),
          ...base,
        }),
        prof({
          id: "b",
          baseAmount: 2000,
          withholdingAmount: 300,
          paymentDate: new Date("2026-05-10"),
          ...base,
        }),
        prof({
          id: "c",
          baseAmount: 7000,
          withholdingAmount: 1050,
          paymentDate: new Date("2026-11-10"),
          ...base,
        }),
      ],
      censusModel190: "YES",
      quarters111: fullYear111Match(10000, 1500, ["a", "b", "c"], "c1"),
    });
    assert.equal(draft.records.length, 1);
    assert.equal(draft.summary.totalCashPerceptionAmount, 10000);
    assert.equal(draft.summary.totalWithholdingAmount, 1500);
    assert.equal(draft.summary.totalPerceptionRecords, 1);
  });

  it("mismo profesional dos subclaves → 2 registros", () => {
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-03-01"),
          perceptionKey: "G",
          perceptionSubKey: "01",
        }),
        prof({
          id: "b",
          counterpartyId: "c1",
          baseAmount: 2000,
          withholdingAmount: 140,
          paymentDate: new Date("2026-06-01"),
          perceptionKey: "G",
          perceptionSubKey: "03",
        }),
      ],
      censusModel190: "YES",
    });
    assert.equal(draft.records.length, 2);
    assert.equal(draft.summary.totalPerceptionRecords, 2);
    assert.equal(draft.summary.uniquePayeeCount, 1);
  });

  it("paymentDate fuera del ejercicio → fuera", () => {
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2025-12-20"),
        }),
      ],
      censusModel190: "YES",
    });
    assert.equal(draft.summary.totalCashPerceptionAmount, 0);
    assert.equal(draft.outcome, "NO_RELEVANT_PAYMENTS");
  });

  it("sin classification → requiresReview", () => {
    const cls = resolve190PerceptionClassification({
      id: "x",
      perceptionKey: null,
      perceptionSubKey: null,
    });
    assert.equal(cls.ok, false);
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-04-01"),
          perceptionKey: null,
          perceptionSubKey: null,
        }),
      ],
      censusModel190: "YES",
    });
    assert.equal(draft.requiresReview, true);
    assert.ok(
      draft.warnings.some(
        (w) => w.code === "MODEL190_PERCEPTION_CLASSIFICATION_MISSING"
      )
    );
  });

  it("SUPERSEDED no doble cómputo", () => {
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "old",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-04-01"),
          status: WITHHOLDING_STATUS.SUPERSEDED,
        }),
        prof({
          id: "new",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 140,
          paymentDate: new Date("2026-04-01"),
          rectifiesId: "old",
        }),
      ],
      censusModel190: "YES",
    });
    assert.equal(draft.summary.totalWithholdingAmount, 140);
    assert.equal(draft.includedWithholdingIds.length, 1);
  });

  it("Σ111 = 190 → MATCH cuando trimestres presentados", () => {
    const ids = ["a", "b"];
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 4000,
          withholdingAmount: 600,
          paymentDate: new Date("2026-02-01"),
        }),
        prof({
          id: "b",
          counterpartyId: "c1",
          baseAmount: 6000,
          withholdingAmount: 900,
          paymentDate: new Date("2026-08-01"),
        }),
      ],
      censusModel190: "YES",
      quarters111: fullYear111Match(10000, 1500, ids, "c1", true),
    });
    assert.equal(draft.reconciliation.status, "MATCH");
  });

  it("111 presentado ≠ 190 → DIFFERENCES", () => {
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-02-01"),
        }),
      ],
      censusModel190: "YES",
      quarters111: fullYear111Match(5000, 750, ["a"], "c1", true),
    });
    assert.equal(draft.reconciliation.status, "DIFFERENCES");
  });

  it("hasEmployees=YES → requiresReview", () => {
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-02-01"),
        }),
      ],
      censusModel190: "YES",
      hasEmployees: "YES",
    });
    assert.equal(draft.requiresReview, true);
    assert.ok(
      draft.warnings.some(
        (w) => w.code === "MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED"
      )
    );
  });

  it("snapshot inmutable", () => {
    const draft = buildModel190({
      year: 2026,
      withholdings: [
        prof({
          id: "a",
          counterpartyId: "c1",
          baseAmount: 1000,
          withholdingAmount: 150,
          paymentDate: new Date("2026-02-01"),
        }),
      ],
      censusModel190: "YES",
    });
    const snap = build190PresentedSnapshot(draft);
    draft.summary.totalWithholdingAmount = 999;
    const parsed = parse190PresentedSnapshot({ model190Snapshot: snap });
    assert.equal(parsed!.summary.totalWithholdingAmount, 150);
  });

  it("deadline feb año siguiente", () => {
    const d = resolve190Deadline(2026);
    assert.equal(d.dueDate.getFullYear(), 2027);
    assert.equal(d.dueDate.getMonth(), 1);
    assert.equal(d.requiresOfficialCalendarCheck, true);
  });

  it("ops + census190=NO → mismatch", () => {
    const a = assess190FilingObligation({
      censusModel190: "NO",
      hasRelevantPerceptions: true,
      totalWithholdingAmount: 150,
      requiresReview: false,
    });
    assert.ok(a.reasonCodes.includes("CENSUS_MODEL190_MISMATCH"));
    const r = buildFiscalObligationsFromSnapshot({
      year: 2026,
      settings: { nif: "B1", fiscalRegime: "130", censusModel190: "NO" },
      filings: [],
      hasPracticedProfessionalWithholding: true,
    });
    assert.ok(
      r.mismatches.some((m) => m.code === "CENSUS_MODEL190_MISMATCH")
    );
  });

  it("census190=YES + ops → REQUIRED", () => {
    const a = assess190FilingObligation({
      censusModel190: "YES",
      hasRelevantPerceptions: true,
      totalWithholdingAmount: 150,
      requiresReview: false,
      hasEmployees: "NO",
    });
    assert.equal(a.status, "REQUIRED");
  });

  it("gate 190 no bloquea 303", () => {
    const blocker = {
      code: "MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED",
      fingerprint: "x",
      severity: "ERROR" as const,
      blocksFiling: true,
      title: "empleados",
      description: "",
      model: "190" as const,
      year: 2026,
    };
    const { status } = resolveHealthStatus([blocker]);
    assert.equal(
      evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "190"
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
});

describe("Fase 9.6 — Modelo 180", () => {
  it("12 pagos mismo lease → 1 registro", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      rent({
        id: `p${i}`,
        counterpartyId: "L1",
        leaseId: "leaseA",
        baseAmount: 1000,
        withholdingAmount: 190,
        paymentDate: new Date(2026, i, 5),
      })
    );
    const draft = buildModel180({
      year: 2026,
      withholdings: rows,
      leases: [
        lease({
          id: "leaseA",
          counterpartyId: "L1",
          propertyAddress: "Local A",
        }),
      ],
      censusModel180: "YES",
      quarters115: fullYear115Match(12000, 2280, rows.map((r) => r.id), "L1", "leaseA", true),
    });
    assert.equal(draft.records.length, 1);
    assert.equal(draft.summary.totalBaseAmount, 12000);
    assert.equal(draft.summary.totalWithholdingAmount, 2280);
    assert.equal(draft.reconciliation.status, "MATCH");
  });

  it("mismo arrendador + 2 leases → desglose", () => {
    const draft = buildModel180({
      year: 2026,
      withholdings: [
        rent({
          id: "a",
          counterpartyId: "L1",
          leaseId: "lA",
          baseAmount: 5000,
          withholdingAmount: 950,
          paymentDate: new Date("2026-03-01"),
        }),
        rent({
          id: "b",
          counterpartyId: "L1",
          leaseId: "lB",
          baseAmount: 7000,
          withholdingAmount: 1330,
          paymentDate: new Date("2026-06-01"),
        }),
      ],
      leases: [
        lease({ id: "lA", counterpartyId: "L1", propertyAddress: "A" }),
        lease({ id: "lB", counterpartyId: "L1", propertyAddress: "B" }),
      ],
      censusModel180: "YES",
    });
    assert.equal(draft.records.length, 2);
    assert.equal(draft.summary.uniqueLandlordCount, 1);
    assert.equal(draft.summary.totalBaseAmount, 12000);
  });

  it("115 presentado ≠ 180 → DIFFERENCES", () => {
    const draft = buildModel180({
      year: 2026,
      withholdings: [
        rent({
          id: "a",
          counterpartyId: "L1",
          leaseId: "lA",
          baseAmount: 1000,
          withholdingAmount: 190,
          paymentDate: new Date("2026-02-01"),
        }),
      ],
      leases: [lease({ id: "lA", counterpartyId: "L1" })],
      censusModel180: "YES",
      quarters115: fullYear115Match(5000, 950, ["a"], "L1", "lA", true),
    });
    assert.equal(draft.reconciliation.status, "DIFFERENCES");
  });

  it("lease sin RC → warning cadastral", () => {
    const draft = buildModel180({
      year: 2026,
      withholdings: [
        rent({
          id: "a",
          counterpartyId: "L1",
          leaseId: "lA",
          baseAmount: 1000,
          withholdingAmount: 190,
          paymentDate: new Date("2026-02-01"),
        }),
      ],
      leases: [
        lease({
          id: "lA",
          counterpartyId: "L1",
          cadastralReference: null,
        }),
      ],
      censusModel180: "YES",
    });
    assert.ok(
      draft.warnings.some((w) => w.code === "MODEL180_CADASTRAL_DATA_MISSING")
    );
    assert.equal(draft.records[0]!.propertySituation, 4);
  });

  it("SUPERSEDED no doble cómputo 115/180", () => {
    const draft = buildModel180({
      year: 2026,
      withholdings: [
        rent({
          id: "old",
          counterpartyId: "L1",
          leaseId: "lA",
          baseAmount: 1000,
          withholdingAmount: 190,
          paymentDate: new Date("2026-04-01"),
          status: WITHHOLDING_STATUS.SUPERSEDED,
        }),
        rent({
          id: "new",
          counterpartyId: "L1",
          leaseId: "lA",
          baseAmount: 1000,
          withholdingAmount: 180,
          paymentDate: new Date("2026-04-01"),
          rectifiesId: "old",
        }),
      ],
      leases: [lease({ id: "lA", counterpartyId: "L1" })],
      censusModel180: "YES",
    });
    assert.equal(draft.summary.totalWithholdingAmount, 180);
  });

  it("snapshot inmutable", () => {
    const draft = buildModel180({
      year: 2026,
      withholdings: [
        rent({
          id: "a",
          counterpartyId: "L1",
          leaseId: "lA",
          baseAmount: 1000,
          withholdingAmount: 190,
          paymentDate: new Date("2026-02-01"),
        }),
      ],
      leases: [lease({ id: "lA", counterpartyId: "L1" })],
      censusModel180: "YES",
    });
    const snap = build180PresentedSnapshot(draft);
    draft.summary.totalWithholdingAmount = 1;
    const parsed = parse180PresentedSnapshot({ model180Snapshot: snap });
    assert.equal(parsed!.summary.totalWithholdingAmount, 190);
  });

  it("ops + census180=NO → mismatch", () => {
    const a = assess180FilingObligation({
      censusModel180: "NO",
      hasRelevantRentPayments: true,
      totalWithholdingAmount: 190,
      requiresReview: false,
    });
    assert.ok(a.reasonCodes.includes("CENSUS_MODEL180_MISMATCH"));
  });

  it("census180=YES + ops → REQUIRED", () => {
    const a = assess180FilingObligation({
      censusModel180: "YES",
      hasRelevantRentPayments: true,
      totalWithholdingAmount: 190,
      requiresReview: false,
    });
    assert.equal(a.status, "REQUIRED");
  });

  it("deadline alineado con 190", () => {
    const a = resolve180Deadline(2026);
    const b = resolve190Deadline(2026);
    assert.equal(a.dueDate.toISOString(), b.dueDate.toISOString());
  });

  it("gate 180 no bloquea 130", () => {
    const blocker = {
      code: "MODEL180_LANDLORD_ID_MISSING",
      fingerprint: "y",
      severity: "ERROR" as const,
      blocksFiling: true,
      title: "landlord",
      description: "",
      model: "180" as const,
      year: 2026,
    };
    const { status } = resolveHealthStatus([blocker]);
    assert.equal(
      evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "180"
      ).allowed,
      false
    );
    assert.equal(
      evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "130"
      ).allowed,
      true
    );
  });

  it("obligations map 180/190 con deadline fiable", () => {
    const r = buildFiscalObligationsFromSnapshot({
      year: 2026,
      settings: {
        nif: "B1",
        fiscalRegime: "130",
        censusModel180: "YES",
        censusModel190: "YES",
      },
      filings: [],
      hasPracticedRentWithholding: true,
      hasPracticedProfessionalWithholding: true,
    });
    const m180 = r.obligations.find((o) => o.model === "180");
    const m190 = r.obligations.find((o) => o.model === "190");
    assert.equal(m180?.dueDateReliable, true);
    assert.equal(m190?.dueDateReliable, true);
    assert.equal(m180?.operationsSignal, "HAS_OPS");
    assert.equal(m190?.operationsSignal, "HAS_OPS");
  });
});

function fullYear111Match(
  totalBase: number,
  totalWh: number,
  ids: string[],
  cp: string,
  presented = false
): Quarter111SnapshotInput[] {
  return ([1, 2, 3, 4] as const).map((q) => ({
    quarter: q,
    perceptionAmount: q === 1 ? totalBase : 0,
    withholdingAmount: q === 1 ? totalWh : 0,
    presented,
    withholdingIds: q === 1 ? ids : [],
    byCounterparty:
      q === 1
        ? [
            {
              counterpartyId: cp,
              name: "P",
              baseAmount: totalBase,
              withholdingAmount: totalWh,
            },
          ]
        : [],
  }));
}

function fullYear115Match(
  totalBase: number,
  totalWh: number,
  ids: string[],
  cp: string,
  leaseId: string,
  presented = false
): Quarter115SnapshotInput[] {
  return ([1, 2, 3, 4] as const).map((q) => ({
    quarter: q,
    baseAmount: q === 1 ? totalBase : 0,
    withholdingAmount: q === 1 ? totalWh : 0,
    presented,
    withholdingIds: q === 1 ? ids : [],
    byLease:
      q === 1
        ? [
            {
              leaseId,
              counterpartyId: cp,
              baseAmount: totalBase,
              withholdingAmount: totalWh,
            },
          ]
        : [],
  }));
}
