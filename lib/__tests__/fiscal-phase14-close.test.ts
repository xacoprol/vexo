/**
 * Fase 14 — close actions, censusHash, pre-filing, READY_FOR_SUBMISSION, stale.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHealthIssue } from "../fiscal-health/issue";
import {
  buildFiscalCloseActions,
  buildPreFilingSnapshotV1,
  classifyEuPurchaseNature,
  computeCensusHash,
  evaluateSubmissionGate,
  previewEuReclassification,
  FISCAL_ENGINE_VERSION,
} from "../fiscal-close";
import { buildFiscalModelSnapshotV1 } from "../fiscal-snapshot";
import {
  resolveCloseLifecycle,
  resolvePeriodReadiness,
} from "../fiscal-validation";
import {
  makeObligation,
  makeObligationsResult,
} from "./fixtures/fiscal-real-period";

describe("Fase 14 — FiscalCloseAction", () => {
  it("deduplica 20 marketplace en 1 acción", () => {
    const issues = Array.from({ length: 20 }, (_, i) =>
      createHealthIssue({
        code: "MOTOR_MARKETPLACE_349_REVIEW_REQUIRED",
        severity: "WARNING",
        blocksFiling: false,
        title: "Marketplace",
        description: "review",
        model: "349",
        year: 2026,
        quarter: 2,
        sourceType: "marketplace",
        sourceId: `m${i}`,
      })
    );
    const actions = buildFiscalCloseActions(issues);
    const mkt = actions.filter((a) => a.code.includes("MARKETPLACE"));
    assert.equal(mkt.length, 1);
    assert.equal(mkt[0]!.count, 20);
    assert.equal(mkt[0]!.entityIds.length, 20);
  });

  it("OBLIGATION_UNKNOWN:303 → OPEN_FISCAL_SETTINGS #census-303", () => {
    const actions = buildFiscalCloseActions([
      createHealthIssue({
        code: "OBLIGATION_UNKNOWN",
        severity: "WARNING",
        blocksFiling: true,
        title: "303 unknown",
        description: "census",
        model: "303",
        year: 2026,
        quarter: 2,
        href: "/settings",
      }),
    ]);
    assert.equal(actions[0]!.actionType, "OPEN_FISCAL_SETTINGS");
    assert.equal(actions[0]!.href, "/settings#census-303");
    assert.equal(actions[0]!.blocksReadyToFile, true);
  });

  it("EU con insufficient → MANUAL_REVIEW", () => {
    const actions = buildFiscalCloseActions([
      createHealthIssue({
        code: "EU_PURCHASE_NATURE_REVIEW",
        severity: "WARNING",
        blocksFiling: false,
        title: "UE",
        description: "sin doc",
        model: "349",
        sourceType: "expense",
        sourceId: "apple1",
        evidence: { insufficient: true },
      }),
    ]);
    assert.equal(actions[0]!.actionType, "MANUAL_REVIEW");
  });
});

describe("Fase 14 — censusHash", () => {
  it("mismo censo distinto orden de keys → mismo hash", () => {
    const a = computeCensusHash({
      censusModel303: "YES",
      vatPeriodicity: "QUARTERLY",
      name: "A",
    });
    const b = computeCensusHash({
      vatPeriodicity: "QUARTERLY",
      censusModel303: "YES",
      name: "B",
    });
    assert.equal(a, b);
  });

  it("cambio censusModel303 → hash distinto", () => {
    const a = computeCensusHash({ censusModel303: "YES" });
    const b = computeCensusHash({ censusModel303: "UNKNOWN" });
    assert.notEqual(a, b);
  });

  it("null ≠ UNKNOWN", () => {
    const a = computeCensusHash({ censusModel303: null });
    const b = computeCensusHash({ censusModel303: "UNKNOWN" });
    assert.notEqual(a, b);
  });

  it("campo UI irrelevante no afecta", () => {
    const a = computeCensusHash({
      censusModel303: "YES",
      logoUrl: "x",
      themePrimary: "#000",
    });
    const b = computeCensusHash({
      censusModel303: "YES",
      logoUrl: "y",
      themePrimary: "#fff",
    });
    assert.equal(a, b);
  });
});

describe("Fase 14 — Shopify / Apple clasificación", () => {
  it("Shopify con doc + SOFTWARE → CONFIRMED_SERVICE", () => {
    const c = classifyEuPurchaseNature({
      id: "s1",
      issueDate: new Date("2026-05-06"),
      subtotal: 33.71,
      vatAmount: 7.08,
      total: 33.71,
      vatOperationType: "INTRACOMUNITARIA",
      category: "SOFTWARE",
      description: "Suscripción Shopify Basic",
      supplierNif: "IE3347697KH",
      documentId: "doc1",
      notes: "reverse charge",
    });
    assert.equal(c.classification, "CONFIRMED_SERVICE");
    assert.equal(c.suggestedType, "SERVICIO_INTRACOMUNITARIO");
  });

  it("Apple sin doc → INSUFFICIENT_DATA (MANUAL_REVIEW)", () => {
    const c = classifyEuPurchaseNature({
      id: "a1",
      issueDate: new Date("2026-06-05"),
      subtotal: 14.99,
      vatAmount: 3.15,
      total: 14.99,
      vatOperationType: "INTRACOMUNITARIA",
      category: "SOFTWARE",
      description: "S FRA 102",
      documentId: null,
    });
    assert.equal(c.classification, "INSUFFICIENT_DATA");
    assert.equal(c.suggestedType, null);
  });

  it("preview A→I: 303 Δ0 en boxes AIB; 349 A↓ I↑", () => {
    const expenses = [
      {
        id: "goods",
        issueDate: new Date("2026-05-01"),
        subtotal: 1000,
        vatAmount: 210,
        total: 1000,
        vatOperationType: "INTRACOMUNITARIA",
        category: "MATERIAL",
      },
      {
        id: "shop",
        issueDate: new Date("2026-05-06"),
        subtotal: 68.49,
        vatAmount: 14.38,
        total: 68.49,
        vatOperationType: "INTRACOMUNITARIA",
        category: "SOFTWARE",
        description: "Suscripción",
        documentId: "d",
      },
    ];
    const p = previewEuReclassification({
      year: 2026,
      quarter: 2,
      expenses,
      reclassifyIds: ["shop"],
    });
    assert.equal(p.delta.box10, 0);
    assert.equal(p.delta.box11, 0);
    assert.equal(p.delta.keyA, -68.49);
    assert.equal(p.delta.keyI, 68.49);
  });
});

describe("Fase 14 — pre-filing + lifecycle", () => {
  function readyObligations() {
    return makeObligationsResult([
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
  }

  it("OPEN → READY_TO_FILE → READY_FOR_SUBMISSION", () => {
    const obligations = readyObligations();
    const readiness = resolvePeriodReadiness({
      health: { status: "READY", blockers: [], issues: [] },
      obligations,
      quarter: 2,
    });
    assert.equal(readiness.status, "READY");

    const openish = resolveCloseLifecycle({
      readinessStatus: readiness.status,
      quarterObligations: obligations.obligations,
    });
    assert.equal(openish.status, "READY_TO_FILE");
    assert.equal(openish.readyToFile, true);
    assert.equal(openish.readyForSubmission, false);

    const snap = buildPreFilingSnapshotV1({
      id: "rev1",
      tenantKey: "T",
      year: 2026,
      quarter: 2,
      models: [
        buildFiscalModelSnapshotV1({
          model: "303",
          year: 2026,
          quarter: 2,
          result: 100,
          sourceIds: { expenses: ["e1"], invoices: ["i1"] },
        }),
      ],
      censusSettings: { censusModel303: "YES", vatPeriodicity: "QUARTERLY" },
      healthStatus: "READY",
      warnings: [],
      readyToFile: true,
      obligationSummary: [],
    });

    const gate = evaluateSubmissionGate({
      review: {
        id: "rev1",
        periodKey: "2026:2",
        year: 2026,
        quarter: 2,
        payload: snap,
        sourceHash: snap.sourceHash,
        censusHash: snap.censusHash,
        engineVersion: FISCAL_ENGINE_VERSION,
        healthStatus: "READY",
        readyToFile: true,
        createdAt: new Date(),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: snap.sourceHash,
      currentCensusHash: snap.censusHash,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.status, "READY_FOR_SUBMISSION");

    const frozen = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: obligations.obligations,
      submissionGate: gate,
    });
    assert.equal(frozen.status, "READY_FOR_SUBMISSION");
    assert.equal(frozen.readyForSubmission, true);
  });

  it("stale por sourceHash (gasto)", () => {
    const filed = buildPreFilingSnapshotV1({
      id: "r",
      tenantKey: "T",
      year: 2026,
      quarter: 2,
      models: [
        buildFiscalModelSnapshotV1({
          model: "303",
          year: 2026,
          quarter: 2,
          result: 100,
          sourceIds: { expenses: ["e1"] },
        }),
      ],
      censusSettings: { censusModel303: "YES" },
      healthStatus: "READY",
      warnings: [],
      readyToFile: true,
      obligationSummary: [],
    });
    const current = buildPreFilingSnapshotV1({
      id: "r2",
      tenantKey: "T",
      year: 2026,
      quarter: 2,
      models: [
        buildFiscalModelSnapshotV1({
          model: "303",
          year: 2026,
          quarter: 2,
          result: 120,
          sourceIds: { expenses: ["e1", "e2"] },
        }),
      ],
      censusSettings: { censusModel303: "YES" },
      healthStatus: "READY",
      warnings: [],
      readyToFile: true,
      obligationSummary: [],
    });
    const gate = evaluateSubmissionGate({
      review: {
        id: "r",
        periodKey: "2026:2",
        year: 2026,
        quarter: 2,
        payload: filed,
        sourceHash: filed.sourceHash,
        censusHash: filed.censusHash,
        engineVersion: FISCAL_ENGINE_VERSION,
        healthStatus: "READY",
        readyToFile: true,
        createdAt: new Date(),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: current.sourceHash,
      currentCensusHash: filed.censusHash,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.status, "STALE_REVIEW");
    assert.equal(gate.drift.sourceHashChanged, true);
    assert.equal(
      resolveCloseLifecycle({
        readinessStatus: "READY",
        quarterObligations: readyObligations().obligations,
        submissionGate: gate,
      }).status,
      "STALE_REVIEW"
    );
  });

  it("stale por censusHash", () => {
    const h1 = computeCensusHash({ censusModel303: "YES" });
    const h2 = computeCensusHash({ censusModel303: "NO" });
    const gate = evaluateSubmissionGate({
      review: {
        id: "r",
        periodKey: "2026:2",
        year: 2026,
        quarter: 2,
        payload: {},
        sourceHash: "abc",
        censusHash: h1,
        engineVersion: FISCAL_ENGINE_VERSION,
        healthStatus: "READY",
        readyToFile: true,
        createdAt: new Date(),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: "abc",
      currentCensusHash: h2,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.status, "STALE_REVIEW");
    assert.equal(gate.drift.censusHashChanged, true);
  });

  it("stale por engineVersion", () => {
    const gate = evaluateSubmissionGate({
      review: {
        id: "r",
        periodKey: "2026:2",
        year: 2026,
        quarter: 2,
        payload: {},
        sourceHash: "abc",
        censusHash: "def",
        engineVersion: "old-engine",
        healthStatus: "READY",
        readyToFile: true,
        createdAt: new Date(),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: "abc",
      currentCensusHash: "def",
      currentEngineVersion: FISCAL_ENGINE_VERSION,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.status, "ENGINE_CHANGED_REVIEW_REQUIRED");
    assert.equal(
      resolveCloseLifecycle({
        readinessStatus: "READY",
        quarterObligations: readyObligations().obligations,
        submissionGate: gate,
      }).status,
      "STALE_REVIEW"
    );
  });

  it("warnings no impeditivos permiten READY_FOR_SUBMISSION", () => {
    const snap = buildPreFilingSnapshotV1({
      id: "r",
      tenantKey: "T",
      year: 2026,
      quarter: 2,
      models: [
        buildFiscalModelSnapshotV1({
          model: "303",
          year: 2026,
          quarter: 2,
          result: 1,
          sourceIds: { expenses: ["e"] },
        }),
      ],
      censusSettings: { censusModel303: "YES" },
      healthStatus: "READY_WITH_WARNINGS",
      warnings: ["SOFT"],
      readyToFile: true,
      obligationSummary: [],
    });
    const gate = evaluateSubmissionGate({
      review: {
        id: "r",
        periodKey: "2026:2",
        year: 2026,
        quarter: 2,
        payload: snap,
        sourceHash: snap.sourceHash,
        censusHash: snap.censusHash,
        engineVersion: FISCAL_ENGINE_VERSION,
        healthStatus: "READY_WITH_WARNINGS",
        readyToFile: true,
        createdAt: new Date(),
        createdBy: null,
        supersededAt: null,
      },
      currentSourceHash: snap.sourceHash,
      currentCensusHash: snap.censusHash,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.readyForSubmission, true);
  });
});
