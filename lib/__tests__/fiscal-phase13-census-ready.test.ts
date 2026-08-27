/**
 * Fase 13 — tests: matriz 303, suggestions, 303↔349 UE, Health READY sintético, snapshot MATCH/drift.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adapt303Obligation } from "../fiscal-obligations/adapters/model-303";
import {
  buildFiscalCensusProfileFromSettings,
  buildFiscalObligationsFromSnapshot,
  type CensusSettingsRow,
} from "../fiscal-obligations";
import { buildFiscalCensusSuggestions } from "../fiscal-census-suggestions";
import {
  resolve349KeyFromPurchase,
  purchaseKindTo349Key,
} from "../modelo-349/keys";
import {
  parsePurchaseVatKind,
  isEuIntracomPurchase,
  aggregateModel303Period,
} from "../modelo-303";
import { quarterRange } from "../fiscal";
import { resolveHealthStatus, createHealthIssue } from "../fiscal-health/issue";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import {
  resolvePeriodReadiness,
  resolveCloseLifecycle,
} from "../fiscal-validation";
import {
  buildFiscalModelSnapshotV1,
  reconcileFiledSnapshotToCurrent,
} from "../fiscal-snapshot";
import { compareEngineToPresented } from "../fiscal-validation/compare";
import {
  makeObligation,
  makeObligationsResult,
} from "./fixtures/fiscal-real-period";

function censusSettings(
  overrides: Partial<CensusSettingsRow> = {}
): CensusSettingsRow {
  return {
    fiscalRegime: "130",
    irpfDirectEstimationMode: "SIMPLIFIED",
    activityKind130: "BUSINESS",
    priorYearWithholdingPct130: 20,
    activityStartYear: 2020,
    vatPeriodicity: "QUARTERLY",
    vatUsesSii: "NO",
    vatTerritory: "COMMON_ONLY",
    vatActivity390Scope: "GENERAL",
    lastVatPeriodFilingRequired: "YES",
    paysProfessionalsSubjectToWithholding: "NO",
    hasEmployees: "NO",
    rentsBusinessPremises: "NO",
    businessRentSubjectToWithholding: "NO",
    censusModel130: "YES",
    censusModel303: "YES",
    censusModel111: "NO",
    censusModel115: "NO",
    censusModel180: "NO",
    censusModel190: "NO",
    censusModel349: "NO",
    censusModel347: "UNKNOWN",
    censusModel390: "UNKNOWN",
    censusSource: "MANUAL",
    censusLastUpdatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function run303(census: string, vatPeriodicity: string) {
  const profile = buildFiscalCensusProfileFromSettings(
    censusSettings({
      censusModel303: census,
      vatPeriodicity,
    })
  );
  return adapt303Obligation({
    profile,
    year: 2026,
    quarter: 2,
    filed: false,
    filingId: null,
    now: new Date("2026-07-10"),
  }).entry;
}

describe("Fase 13 — matriz obligación 303", () => {
  it("YES + QUARTERLY → REQUIRED", () => {
    assert.equal(run303("YES", "QUARTERLY").obligationStatus, "REQUIRED");
  });
  it("YES + MONTHLY → REQUIRED", () => {
    assert.equal(run303("YES", "MONTHLY").obligationStatus, "REQUIRED");
  });
  it("YES + UNKNOWN periodicity → REQUIRED", () => {
    assert.equal(run303("YES", "UNKNOWN").obligationStatus, "REQUIRED");
  });
  it("NO + QUARTERLY → NOT_APPLICABLE (no NOT_REQUIRED por ops)", () => {
    const e = run303("NO", "QUARTERLY");
    assert.equal(e.obligationStatus, "NOT_APPLICABLE");
    assert.notEqual(e.obligationStatus, "NOT_REQUIRED");
  });
  it("UNKNOWN + UNKNOWN → UNKNOWN", () => {
    assert.equal(run303("UNKNOWN", "UNKNOWN").obligationStatus, "UNKNOWN");
  });
  it("UNKNOWN + QUARTERLY → REQUIRED (resolver por periodicidad)", () => {
    assert.equal(run303("UNKNOWN", "QUARTERLY").obligationStatus, "REQUIRED");
  });
  it("ops nunca consultadas (operationsSignal UNKNOWN)", () => {
    assert.equal(run303("UNKNOWN", "UNKNOWN").operationsSignal, "UNKNOWN");
  });
});

describe("Fase 13 — census suggestions (informativas)", () => {
  it("requiresConfirmation siempre true; no persiste", async () => {
    const prismaLike = {
      fiscalFiling: {
        findMany: async () => [
          { modelType: "303", year: 2026, quarter: 2, result: 100 },
          { modelType: "130", year: 2026, quarter: 2, result: 50 },
          { modelType: "349", year: 2026, quarter: 2, result: 0 },
        ],
      },
      expense: { count: async () => 3 },
      fiscalWithholding: { count: async () => 0 },
      businessPremisesLease: { count: async () => 0 },
      invoice: { count: async () => 2 },
    };
    const suggestions = await buildFiscalCensusSuggestions(
      prismaLike as never,
      {
        censusModel303: "UNKNOWN",
        vatPeriodicity: "UNKNOWN",
        censusModel130: "UNKNOWN",
        censusModel349: "UNKNOWN",
        censusModel111: "UNKNOWN",
        rentsBusinessPremises: "UNKNOWN",
        activityKind130: "UNKNOWN",
      }
    );
    assert.ok(suggestions.length >= 2);
    for (const s of suggestions) {
      assert.equal(s.requiresConfirmation, true);
    }
    assert.ok(suggestions.some((s) => s.field === "censusModel303"));
    assert.ok(suggestions.some((s) => s.field === "vatPeriodicity"));
  });
});

describe("Fase 13 — 303 ↔ 349 consistencia UE", () => {
  it("bienes UE → 303 EU_GOODS + 349 clave A", () => {
    const kind = parsePurchaseVatKind("INTRACOMUNITARIA");
    assert.equal(kind, "EU_GOODS");
    assert.equal(isEuIntracomPurchase(kind), true);
    assert.equal(purchaseKindTo349Key(kind), "A");
    assert.equal(resolve349KeyFromPurchase("INTRACOMUNITARIA"), "A");
  });

  it("servicios UE → 303 EU_SERVICES + 349 clave I", () => {
    const kind = parsePurchaseVatKind("SERVICIO_INTRACOMUNITARIO");
    assert.equal(kind, "EU_SERVICES");
    assert.equal(isEuIntracomPurchase(kind), true);
    assert.equal(purchaseKindTo349Key(kind), "I");
    assert.equal(resolve349KeyFromPurchase("SERVICIO_INTRACOMUNITARIO"), "I");
  });

  it("doméstico → no 349 UE; no AIB separado", () => {
    const kind = parsePurchaseVatKind("INTERIOR");
    assert.equal(kind, "DOMESTIC");
    assert.equal(isEuIntracomPurchase(kind), false);
    assert.equal(resolve349KeyFromPurchase("INTERIOR"), null);
  });

  it("marketplace/OSS no es compra UE en 349", () => {
    assert.equal(resolve349KeyFromPurchase("EXPORTACION"), null);
    assert.equal(resolve349KeyFromPurchase(null), null);
  });

  it("goods vs services: misma base 303 AIB boxes; claves 349 distintas", () => {
    const { from, to } = quarterRange(2026, 2);
    const baseExp = {
      id: "e1",
      issueDate: new Date("2026-05-10"),
      subtotal: 100,
      vatAmount: 21,
      vatRate: 21,
      total: 100,
      vatDeductiblePct: 100,
      irpfDeductiblePct: 100,
      isInvestment: false,
      supplierName: "UE",
    };
    const goods = aggregateModel303Period({
      invoices: [],
      marketplace: [],
      assets: [],
      expenses: [{ ...baseExp, vatOperationType: "INTRACOMUNITARIA" }],
      from,
      to,
    });
    const services = aggregateModel303Period({
      invoices: [],
      marketplace: [],
      assets: [],
      expenses: [
        { ...baseExp, id: "e2", vatOperationType: "SERVICIO_INTRACOMUNITARIO" },
      ],
      from,
      to,
    });
    assert.equal(goods.modelo303.boxes.box10, services.modelo303.boxes.box10);
    assert.equal(goods.modelo303.boxes.box11, services.modelo303.boxes.box11);
    assert.equal(resolve349KeyFromPurchase("INTRACOMUNITARIA"), "A");
    assert.equal(
      resolve349KeyFromPurchase("SERVICIO_INTRACOMUNITARIO"),
      "I"
    );
  });
});

describe("Fase 13 — Health severity REVIEW_REQUIRED", () => {
  it("MOTOR_*_REVIEW_REQUIRED no fuerza NOT_READY si no blocksFiling", () => {
    const issues = [
      createHealthIssue({
        code: "MOTOR_MARKETPLACE_349_REVIEW_REQUIRED",
        severity: "WARNING",
        blocksFiling: false,
        title: "Marketplace review",
        description: "review",
        model: "349",
        year: 2026,
        quarter: 2,
      }),
      createHealthIssue({
        code: "MOTOR_VAT_PRORATA_REVIEW_REQUIRED",
        severity: "WARNING",
        blocksFiling: false,
        title: "Prorrata",
        description: "review",
        model: "303",
        year: 2026,
        quarter: 2,
      }),
    ];
    const { status, blockers } = resolveHealthStatus(issues);
    assert.equal(status, "READY_WITH_WARNINGS");
    assert.equal(blockers.length, 0);
    assert.equal(
      evaluateFilingGateFromHealth(
        { status, blockers, issues },
        "303"
      ).allowed,
      true
    );
  });

  it("OBLIGATION_UNKNOWN con blocksFiling → NOT_READY", () => {
    const blocker = createHealthIssue({
      code: "OBLIGATION_UNKNOWN",
      severity: "ERROR",
      blocksFiling: true,
      title: "303 unknown",
      description: "census",
      model: "303",
      year: 2026,
      quarter: 2,
    });
    const { status } = resolveHealthStatus([blocker]);
    assert.equal(status, "NOT_READY");
  });
});

describe("Fase 13 — caso sintético READY", () => {
  it("censo completo + sin blockers → readyToFile", () => {
    const r = buildFiscalObligationsFromSnapshot({
      year: 2026,
      quarter: 2,
      settings: censusSettings({
        censusModel130: "YES",
        censusModel303: "YES",
        censusModel111: "NO",
        censusModel115: "NO",
        censusModel349: "NO",
        vatPeriodicity: "QUARTERLY",
        paysProfessionalsSubjectToWithholding: "NO",
        rentsBusinessPremises: "NO",
      }),
      filings: [],
      incomeBaseYtd: 10000,
      incomeWithWithholdingYtd: 0,
      model349HasOps: { 2: false },
      model111HasOps: { 2: false },
      model115HasOps: { 2: false },
    });

    const e303 = r.obligations.find(
      (o) => o.model === "303" && o.period.quarter === 2
    );
    const e111 = r.obligations.find(
      (o) => o.model === "111" && o.period.quarter === 2
    );
    const e115 = r.obligations.find(
      (o) => o.model === "115" && o.period.quarter === 2
    );
    assert.equal(e303?.obligationStatus, "REQUIRED");
    assert.ok(
      e111?.obligationStatus === "NOT_APPLICABLE" ||
        e111?.obligationStatus === "NOT_REQUIRED"
    );
    assert.ok(
      e115?.obligationStatus === "NOT_APPLICABLE" ||
        e115?.obligationStatus === "NOT_REQUIRED"
    );

    const obligations = makeObligationsResult([
      makeObligation({
        model: "130",
        quarter: 2,
        obligationStatus: "REQUIRED",
      }),
      makeObligation({
        model: "303",
        quarter: 2,
        obligationStatus: "REQUIRED",
      }),
      makeObligation({
        model: "111",
        quarter: 2,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "115",
        quarter: 2,
        obligationStatus: "NOT_APPLICABLE",
      }),
      makeObligation({
        model: "349",
        quarter: 2,
        obligationStatus: "NOT_APPLICABLE",
      }),
    ]);

    const readiness = resolvePeriodReadiness({
      health: { status: "READY", blockers: [], issues: [] },
      obligations,
      quarter: 2,
    });
    assert.equal(readiness.status, "READY");

    const lifecycle = resolveCloseLifecycle({
      readinessStatus: readiness.status,
      quarterObligations: obligations.obligations.filter(
        (o) => o.period.quarter === 2
      ),
    });
    assert.equal(lifecycle.readyToFile, true);
    assert.equal(lifecycle.status, "READY_TO_FILE");
    assert.equal(lifecycle.unknownModels.length, 0);
  });
});

describe("Fase 13 — snapshot MATCH + drift", () => {
  it("MATCH cuando sourceHash coincide", () => {
    const filed = buildFiscalModelSnapshotV1({
      model: "303",
      year: 2026,
      quarter: 2,
      result: 100,
      sourceIds: { expenses: ["e1"], invoices: ["i1"] },
      bookCutoffAt: "2026-07-15T10:00:00.000Z",
    });
    const current = buildFiscalModelSnapshotV1({
      model: "303",
      year: 2026,
      quarter: 2,
      result: 100,
      sourceIds: { expenses: ["e1"], invoices: ["i1"] },
      bookCutoffAt: "2026-07-15T10:00:00.000Z",
    });
    assert.equal(filed.sourceHash, current.sourceHash);
    const rec = reconcileFiledSnapshotToCurrent({ filed, current });
    assert.equal(rec.reconciliationStatus, "MATCH");

    const cmp = compareEngineToPresented({
      model: "303",
      engineResult: 100,
      presented: {
        result: 100,
        incomeBase: null,
        expensesBase: null,
        vatRepercutida: null,
        vatDeductible: null,
        boxes: [],
        sourceFileName: null,
        notes: null,
        year: 2026,
        quarter: 2,
        modelType: "303",
        rawExtract: { model303Snapshot: filed },
      },
      snapshotAvailable: true,
    });
    assert.equal(cmp.reconciliationStatus, "MATCH");
  });

  it("añadir operación → CURRENT_BOOK_CHANGED_AFTER_FILING", () => {
    const filed = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 100,
      sourceIds: { expenses: ["bambu"] },
      bookCutoffAt: "2026-07-15T10:00:00.000Z",
    });
    const current = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 250,
      sourceIds: { expenses: ["bambu", "shopify"] },
      bookCutoffAt: "2026-07-20T10:00:00.000Z",
    });
    assert.notEqual(filed.sourceHash, current.sourceHash);
    const rec = reconcileFiledSnapshotToCurrent({ filed, current });
    assert.equal(rec.reconciliationStatus, "POTENTIAL_AMENDMENT_REQUIRED");
    assert.ok(rec.changes.added.some((c) => c.sourceId === "shopify"));
  });
});
