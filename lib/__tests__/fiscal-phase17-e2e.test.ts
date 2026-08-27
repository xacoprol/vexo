/**
 * Fase 17 — E2E núcleo fiscal v1 + invariantes + hardening (sin DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  makeObligation,
  makeObligationsResult,
} from "./fixtures/fiscal-real-period";
import { createHealthIssue } from "../fiscal-health/issue";
import { resolveCloseLifecycle, resolvePeriodReadiness } from "../fiscal-validation/readiness";
import { evaluateSubmissionGate, FISCAL_ENGINE_VERSION } from "../fiscal-close";
import { buildFiscalCloseActions } from "../fiscal-close/actions";
import { buildFiscalModelSnapshotV1 } from "../fiscal-snapshot";
import {
  computeSourceHash,
  normalizeSourceIds,
} from "../fiscal-snapshot/hash";
import { reconcileFiledSnapshotToCurrent } from "../fiscal-snapshot/reconcile";
import { computeCensusHash } from "../fiscal-close/census-hash";
import {
  buildDeclarationFromFrozenSnapshot,
  computeDeclarationHash,
  validateFiscalDeclarationDraft,
  generateDeclarationFromParts,
  rejectGenerationWhenOpen,
  type DeclarationModelCode,
  type FiscalDeclarationDraft,
} from "../fiscal-declaration";
import {
  prepareAssistedSubmission,
  buildManualFilingRegistration,
  decideSubmissionIdempotency,
  assertReadyForAssistedSubmission,
  assessPaymentRequirement,
  type FiscalSubmissionAttemptRecord,
} from "../fiscal-submission";
import {
  canFiscal,
  roleFromSession,
  assertSameFiscalTenant,
  FISCAL_SENSITIVE_MUTATIONS,
} from "../fiscal-auth";
import { serializeMoney, moneyStringsEqual, parseMoney } from "../fiscal-declaration/money";
import { quarterRange, type FiscalQuarter } from "../fiscal";
import type { PreFilingReviewRow } from "../fiscal-close";
import type { FiscalHealthIssue } from "../fiscal-health/types";

const YEAR = 2025;
const Q: FiscalQuarter = 3;

function healthReady() {
  return {
    status: "READY" as const,
    blockers: [] as ReturnType<typeof createHealthIssue>[],
    issues: [] as FiscalHealthIssue[],
  };
}

function healthBlocked() {
  const blocker = createHealthIssue({
    code: "OBLIGATION_UNKNOWN",
    title: "303 desconocido",
    description: "Censo 303 UNKNOWN",
    severity: "CRITICAL",
    blocksFiling: true,
    model: "303",
  });
  return {
    status: "NOT_READY" as const,
    blockers: [blocker],
    issues: [blocker],
  };
}

function cleanObligations(filed: Partial<Record<string, boolean>> = {}) {
  const models = [
    ["130", "REQUIRED"],
    ["303", "REQUIRED"],
    ["349", "REQUIRED"],
    ["111", "NOT_REQUIRED"],
    ["115", "NOT_REQUIRED"],
  ] as const;
  return makeObligationsResult(
    models.map(([model, st]) =>
      makeObligation({
        model,
        quarter: Q,
        year: YEAR,
        obligationStatus: st,
        filingStatus: filed[model] ? "FILED" : "UPCOMING",
        filingId: filed[model] ? `f-${model}` : null,
        operationsSignal: st === "REQUIRED" ? "HAS_OPS" : "NO_OPS",
      })
    ),
    "COMPLETE"
  );
}

function snap(
  model: DeclarationModelCode,
  opts: {
    result: number;
    boxes: Record<string, number>;
    sourceIds?: Record<string, string[]>;
    detail?: unknown;
  }
) {
  return buildFiscalModelSnapshotV1({
    model,
    year: YEAR,
    quarter: Q,
    result: opts.result,
    boxes: opts.boxes,
    sourceIds: opts.sourceIds ?? {
      expenses: ["e1", "e-ue-a", "e-ue-i"],
      invoices: ["i1"],
    },
    detail: opts.detail as never,
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

function snapsClean() {
  return {
    "130": snap("130", {
      result: 200,
      boxes: { "01": 8000, "02": 3000, "03": 5000, "04": 1000, "07": 200, "19": 200 },
    }),
    "303": snap("303", {
      result: 150.5,
      boxes: { "07": 1000, "09": 210, "29": 60, "71": 150.5 },
      detail: { outcome: "TO_PAY" },
    }),
    "349": snap("349", {
      result: 400,
      boxes: { A: 250, I: 150 },
      detail: {
        periodicity: "QUARTERLY",
        totalsByKey: { A: 250, I: 150 },
        operations: [
          {
            vatId: "DE123456789",
            country: "DE",
            operatorName: "Goods GmbH",
            key: "A",
            amount: 250,
          },
          {
            vatId: "IE3347697KH",
            country: "IE",
            operatorName: "Services Ltd",
            key: "I",
            amount: 150,
          },
        ],
      },
    }),
  };
}

function reviewFrom(
  models: ReturnType<typeof snap>[],
  hashes: { sourceHash: string; censusHash: string }
): PreFilingReviewRow {
  return {
    id: "rev-e2e",
    periodKey: `${YEAR}:${Q}`,
    year: YEAR,
    quarter: Q,
    payload: {
      models,
      sourceHash: hashes.sourceHash,
      censusHash: hashes.censusHash,
    },
    sourceHash: hashes.sourceHash,
    censusHash: hashes.censusHash,
    engineVersion: FISCAL_ENGINE_VERSION,
    healthStatus: "READY",
    readyToFile: true,
    createdAt: new Date(`${YEAR}-10-05T10:00:00.000Z`),
    createdBy: "user-1",
    supersededAt: null,
  };
}

function draftFrom(
  model: DeclarationModelCode,
  frozen: ReturnType<typeof snap>,
  review: PreFilingReviewRow
): FiscalDeclarationDraft {
  const core = buildDeclarationFromFrozenSnapshot({
    model,
    frozen,
    preFilingReviewId: review.id,
    sourceHash: review.sourceHash,
    censusHash: review.censusHash,
    metadata: { nif: "B12345674", frozenAt: review.createdAt.toISOString() },
    generatedAt: "2025-10-05T12:00:00.000Z",
  });
  const declarationHash = computeDeclarationHash(core);
  const validation = validateFiscalDeclarationDraft(
    { ...core, declarationHash },
    frozen
  );
  return { ...core, declarationHash, validation };
}

describe("fase17 invariantes", () => {
  it("1. no READY_TO_FILE con blockers", () => {
    const r = resolvePeriodReadiness({
      health: healthBlocked(),
      obligations: cleanObligations(),
      quarter: Q,
    });
    assert.equal(r.status, "NOT_READY");
    const life = resolveCloseLifecycle({
      readinessStatus: r.status,
      quarterObligations: cleanObligations().obligations,
    });
    assert.equal(life.status, "OPEN");
    assert.equal(life.readyToFile, false);
  });

  it("2-3. no READY_FOR_SUBMISSION sin freeze / con stale", () => {
    const obs = cleanObligations().obligations;
    const none = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: obs,
      submissionGate: evaluateSubmissionGate({
        review: null,
        currentSourceHash: "a",
        currentCensusHash: "b",
        readyToFile: true,
        hasBlockers: false,
      }),
    });
    assert.notEqual(none.status, "READY_FOR_SUBMISSION");

    const models = Object.values(snapsClean());
    const sourceHash = computeSourceHash(models[0].sourceIds);
    const censusHash = computeCensusHash({ censusModel303: "YES" });
    const review = reviewFrom(models, { sourceHash, censusHash });
    const staleGate = evaluateSubmissionGate({
      review,
      currentSourceHash: "CHANGED",
      currentCensusHash: censusHash,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(staleGate.status, "STALE_REVIEW");
    const life = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: obs,
      submissionGate: staleGate,
    });
    assert.equal(life.status, "STALE_REVIEW");
    assert.equal(life.readyForSubmission, false);
  });

  it("4-5. no declaration desde OPEN / STALE", () => {
    assert.equal(rejectGenerationWhenOpen().ok, false);
    const models = Object.values(snapsClean());
    const sourceHash = computeSourceHash(models[0].sourceIds);
    const censusHash = computeCensusHash({ censusModel303: "YES" });
    const review = reviewFrom(models, { sourceHash, censusHash });
    const r = generateDeclarationFromParts({
      review,
      model: "130",
      frozenModel: models[0],
      currentSourceHash: "DRIFT",
      currentCensusHash: censusHash,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "STALE_REVIEW");
  });

  it("6. no ACCEPTED sin registro manual (prepare ≠ accepted)", () => {
    const models = snapsClean();
    const sourceHash = computeSourceHash(models["130"].sourceIds);
    const censusHash = computeCensusHash({ censusModel130: "YES" });
    const review = reviewFrom(Object.values(models), { sourceHash, censusHash });
    const draft = draftFrom("130", models["130"], review);
    const prepared = prepareAssistedSubmission(draft);
    assert.equal(prepared.status, "USER_ACTION_REQUIRED");
    assert.notEqual(prepared.status, "ACCEPTED");
  });

  it("7. no CLOSED con UNKNOWN", () => {
    const obs = makeObligationsResult([
      makeObligation({
        model: "303",
        quarter: Q,
        year: YEAR,
        obligationStatus: "UNKNOWN",
        filingStatus: "FILED",
        filingId: "x",
      }),
      makeObligation({
        model: "130",
        quarter: Q,
        year: YEAR,
        obligationStatus: "REQUIRED",
        filingStatus: "FILED",
        filingId: "y",
      }),
    ]);
    const life = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: obs.obligations,
    });
    assert.notEqual(life.status, "CLOSED");
    assert.ok(life.unknownModels.includes("303"));
  });

  it("8. no MATCH si hashes difieren", () => {
    const filed = snap("130", {
      result: 100,
      boxes: { "19": 100 },
      sourceIds: { expenses: ["e1"], invoices: ["i1"] },
    });
    const current = snap("130", {
      result: 100,
      boxes: { "19": 100 },
      sourceIds: { expenses: ["e1", "e2"], invoices: ["i1"] },
    });
    const r = reconcileFiledSnapshotToCurrent({ filed, current });
    assert.notEqual(r.reconciliationStatus, "MATCH");
    assert.ok(
      r.notes.some((n) => n.includes("CURRENT_BOOK_CHANGED_AFTER_FILING")) ||
        r.reconciliationStatus === "POTENTIAL_AMENDMENT_REQUIRED" ||
        r.reconciliationStatus === "CURRENT_BOOK_CHANGED_AFTER_FILING"
    );
  });

  it("9-10. filing histórico / legacy no se reconstruye a MATCH", () => {
    const r = reconcileFiledSnapshotToCurrent({
      filed: null,
      current: snap("303", { result: 1, boxes: { "71": 1 } }),
      legacyLimited: true,
    });
    assert.equal(r.reconciliationStatus, "LEGACY_LIMITED");
  });

  it("11. no cálculo desde frontend (clientBoxes rechazado)", () => {
    const models = Object.values(snapsClean());
    const sourceHash = computeSourceHash(models[0].sourceIds);
    const censusHash = computeCensusHash({});
    const review = reviewFrom(models, { sourceHash, censusHash });
    const r = generateDeclarationFromParts({
      review,
      model: "130",
      frozenModel: models[0],
      currentSourceHash: sourceHash,
      currentCensusHash: censusHash,
      clientBoxes: { "19": "999" },
    });
    assert.equal(r.ok, false);
  });

  it("12. soft cross-tenant denegado", () => {
    const t = assertSameFiscalTenant("B11111111", "B22222222");
    assert.equal(t.ok, false);
    assert.equal(assertSameFiscalTenant("default", "DEFAULT").ok, true);
  });
});

describe("fase17 CLEAN QUARTER E2E → CLOSED", () => {
  it("cadena completa sintética", () => {
    const health = healthReady();
    const readiness = resolvePeriodReadiness({
      health,
      obligations: cleanObligations(),
      quarter: Q,
    });
    assert.ok(readiness.status === "READY" || readiness.status === "READY_WITH_WARNINGS");

    const modelsMap = snapsClean();
    const models = Object.values(modelsMap);
    const sourceHash = computeSourceHash(models[0].sourceIds);
    const censusHash = computeCensusHash({
      censusModel130: "YES",
      censusModel303: "YES",
      censusModel349: "YES",
      censusModel111: "NO",
      censusModel115: "NO",
    });

    const lifeReady = resolveCloseLifecycle({
      readinessStatus: readiness.status,
      quarterObligations: cleanObligations().obligations,
    });
    assert.equal(lifeReady.status, "READY_TO_FILE");

    const review = reviewFrom(models, { sourceHash, censusHash });
    const gate = evaluateSubmissionGate({
      review,
      currentSourceHash: sourceHash,
      currentCensusHash: censusHash,
      readyToFile: true,
      hasBlockers: false,
    });
    assert.equal(gate.status, "READY_FOR_SUBMISSION");

    const lifeSub = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: cleanObligations().obligations,
      submissionGate: gate,
    });
    assert.equal(lifeSub.status, "READY_FOR_SUBMISSION");

    const required: DeclarationModelCode[] = ["130", "303", "349"];
    const filings: string[] = [];
    for (const model of required) {
      const gen = generateDeclarationFromParts({
        review,
        model,
        frozenModel: modelsMap[model],
        currentSourceHash: sourceHash,
        currentCensusHash: censusHash,
      });
      assert.equal(gen.ok, true, model);
      if (!gen.ok) continue;
      assert.equal(gen.draft.validation.valid, true);
      const prepared = prepareAssistedSubmission(gen.draft);
      assert.equal(prepared.status, "USER_ACTION_REQUIRED");
      const pay = assessPaymentRequirement({
        model,
        result: gen.draft.result,
      });
      if (model === "349") assert.equal(pay.status, "NONE");
      else assert.equal(pay.status, "NRC_REQUIRED");

      const manual = buildManualFilingRegistration(
        {
          tenantId: "B12345674",
          draft: gen.draft,
          filedAt: `${YEAR}-10-15`,
          receiptId: `CSV-${model}-E2E`,
          filedResult: gen.draft.result,
        },
        `att-${model}`
      );
      assert.equal(manual.reviewMatchFlag, "FILED_MATCHES_REVIEW");
      assert.equal(manual.attemptStatus, "ACCEPTED");
      assert.equal(manual.lineage.declarationHash, gen.draft.declarationHash);

      const rec = reconcileFiledSnapshotToCurrent({
        filed: modelsMap[model],
        current: modelsMap[model],
      });
      assert.equal(rec.reconciliationStatus, "MATCH");
      filings.push(model);
    }
    assert.deepEqual(filings, required);

    const lifeClosed = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: cleanObligations({
        "130": true,
        "303": true,
        "349": true,
      }).obligations,
      submissionGate: gate,
    });
    assert.equal(lifeClosed.status, "CLOSED");
    assert.equal(lifeClosed.closed, true);
  });
});

describe("fase17 E2E 111 / 115", () => {
  it("111 REQUIRED → MATCH filing", () => {
    const frozen = snap("111", {
      result: 150,
      boxes: { box07: 1, box08: 1000, box09: 150, box30: 150 },
      sourceIds: { withholdings: ["w1"] },
      detail: {
        outcome: "TO_PAY",
        payees: [
          {
            counterpartyId: "cp1",
            name: "Prof",
            taxId: "B12345674",
            baseAmount: 1000,
            withholdingAmount: 150,
          },
        ],
      },
    });
    const sourceHash = computeSourceHash(frozen.sourceIds);
    const censusHash = computeCensusHash({ censusModel111: "YES" });
    const review = reviewFrom([frozen], { sourceHash, censusHash });
    const gen = generateDeclarationFromParts({
      review,
      model: "111",
      frozenModel: frozen,
      currentSourceHash: sourceHash,
      currentCensusHash: censusHash,
    });
    assert.equal(gen.ok, true);
    if (!gen.ok) return;
    const manual = buildManualFilingRegistration(
      {
        tenantId: "default",
        draft: gen.draft,
        filedAt: "2025-10-20",
        receiptId: "CSV-111",
        filedResult: gen.draft.result,
      },
      "att-111"
    );
    assert.equal(manual.reviewMatchFlag, "FILED_MATCHES_REVIEW");
    const life = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: [
        makeObligation({
          model: "111",
          quarter: Q,
          year: YEAR,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "f111",
        }),
      ],
    });
    assert.equal(life.status, "CLOSED");
  });

  it("115 REQUIRED → MATCH filing", () => {
    const frozen = snap("115", {
      result: 190,
      boxes: { box01: 1, box02: 1000, box03: 190, box05: 190 },
      sourceIds: { leases: ["l1"], withholdings: ["rw1"] },
      detail: {
        outcome: "TO_PAY",
        landlords: [
          {
            counterpartyId: "ll1",
            taxId: "12345678Z",
            name: "Arrendador",
            baseAmount: 1000,
            withholdingAmount: 190,
          },
        ],
      },
    });
    const sourceHash = computeSourceHash(frozen.sourceIds);
    const censusHash = computeCensusHash({ censusModel115: "YES" });
    const review = reviewFrom([frozen], { sourceHash, censusHash });
    const gen = generateDeclarationFromParts({
      review,
      model: "115",
      frozenModel: frozen,
      currentSourceHash: sourceHash,
      currentCensusHash: censusHash,
    });
    assert.equal(gen.ok, true);
    if (!gen.ok) return;
    const manual = buildManualFilingRegistration(
      {
        tenantId: "default",
        draft: gen.draft,
        filedAt: "2025-10-20",
        receiptId: "CSV-115",
        filedResult: gen.draft.result,
      },
      "att-115"
    );
    assert.equal(manual.reviewMatchFlag, "FILED_MATCHES_REVIEW");
  });
});

describe("fase17 drift / stale / legacy", () => {
  it("post-filing drift → CURRENT_BOOK / no MATCH", () => {
    const filed = snap("303", {
      result: 100,
      boxes: { "71": 100 },
      sourceIds: { expenses: ["e1"], invoices: ["i1"] },
    });
    const current = snap("303", {
      result: 120,
      boxes: { "71": 120 },
      sourceIds: { expenses: ["e1", "e-new"], invoices: ["i1"] },
    });
    const r = reconcileFiledSnapshotToCurrent({ filed, current });
    assert.notEqual(r.reconciliationStatus, "MATCH");
    assert.ok(
      r.reconciliationStatus === "POTENTIAL_AMENDMENT_REQUIRED" ||
        r.reconciliationStatus === "CURRENT_BOOK_CHANGED_AFTER_FILING" ||
        r.notes.some((n) => n.includes("CURRENT_BOOK_CHANGED_AFTER_FILING"))
    );
    assert.equal(filed.sourceHash !== current.sourceHash, true);
  });

  it("stale bloquea prepare submission", () => {
    const frozen = snap("130", {
      result: 50,
      boxes: { "19": 50, "01": 1, "02": 0, "03": 1, "04": 0, "07": 50 },
    });
    const sourceHash = computeSourceHash(frozen.sourceIds);
    const censusHash = computeCensusHash({});
    const review = reviewFrom([frozen], { sourceHash, censusHash });
    const draft = draftFrom("130", frozen, review);
    const stale = assertReadyForAssistedSubmission({
      draft,
      current: {
        sourceHash: "OTHER",
        censusHash,
        engineVersion: FISCAL_ENGINE_VERSION,
        lifecycleStatus: "READY_FOR_SUBMISSION",
      },
    });
    assert.equal(stale.ok, false);
  });

  it("legacy OCR → LEGACY_LIMITED", () => {
    const r = reconcileFiledSnapshotToCurrent({
      filed: null,
      current: null,
      legacyLimited: true,
    });
    assert.equal(r.reconciliationStatus, "LEGACY_LIMITED");
  });
});

describe("fase17 security / roles / idempotency", () => {
  it("roles: unauthenticated sin capacidades", () => {
    assert.equal(canFiscal(roleFromSession(false), "FREEZE_PRE_FILING"), false);
    assert.equal(canFiscal(roleFromSession(true), "REGISTER_MANUAL_FILING"), true);
  });

  it("mutaciones sensibles documentadas", () => {
    assert.ok(FISCAL_SENSITIVE_MUTATIONS.includes("confirmFiscalPeriodReview"));
    assert.ok(FISCAL_SENSITIVE_MUTATIONS.includes("registerManualAeatFilingAction"));
  });

  it("idempotencia submission ACCEPTED", () => {
    const base: FiscalSubmissionAttemptRecord = {
      id: "a1",
      tenantId: "default",
      model: "130",
      year: YEAR,
      quarter: Q,
      preFilingReviewId: "r",
      declarationHash: "hash",
      startedAt: "2025-10-01T00:00:00.000Z",
      finishedAt: "2025-10-01T01:00:00.000Z",
      status: "ACCEPTED",
      channel: "MANUAL_AEAT",
      requestFingerprint: "fp",
      responseCode: "MANUAL",
      errorCode: null,
      receiptId: "CSV",
      filingId: "f1",
      paymentRequirement: null,
      reviewMatchFlag: "FILED_MATCHES_REVIEW",
      safeMessage: null,
    };
    const d = decideSubmissionIdempotency([base]);
    assert.equal(d.action, "RETURN_EXISTING");
  });

  it("concurrencia conceptual: SUBMITTING bloquea segundo envío", () => {
    const d = decideSubmissionIdempotency([
      {
        id: "a2",
        tenantId: "default",
        model: "303",
        year: YEAR,
        quarter: Q,
        preFilingReviewId: "r",
        declarationHash: "h",
        startedAt: "2025-10-01T00:00:00.000Z",
        finishedAt: null,
        status: "SUBMITTING",
        channel: "ASSISTED_WEB",
        requestFingerprint: null,
        responseCode: null,
        errorCode: null,
        receiptId: null,
        filingId: null,
        paymentRequirement: null,
        reviewMatchFlag: null,
        safeMessage: null,
      },
    ]);
    assert.equal(d.action, "BLOCK");
  });
});

describe("fase17 money / dates / periods / hashes", () => {
  it("money string canonical", () => {
    assert.equal(serializeMoney(0.01), "0.01");
    assert.equal(serializeMoney(0.1 + 0.2), serializeMoney(0.3));
    assert.equal(serializeMoney(999999.99), "999999.99");
    assert.equal(serializeMoney(-12.5), "-12.50");
    assert.equal(moneyStringsEqual("100.00", 100), true);
    assert.equal(parseMoney("1,50"), 1.5);
  });

  it("quarter boundaries no cruzan periodo (local Date)", () => {
    for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
      const { from, to } = quarterRange(YEAR, q);
      assert.equal(from.getMonth(), (q - 1) * 3);
      assert.equal(from.getDate(), 1);
      assert.ok(to > from);
      assert.equal(to.getMonth(), q * 3 === 12 ? 11 : q * 3 - 1);
    }
    const q1 = quarterRange(YEAR, 1);
    const q2 = quarterRange(YEAR, 2);
    assert.ok(q1.to < q2.from);
    const mar31 = new Date(YEAR, 2, 31, 12, 0, 0);
    const apr1 = new Date(YEAR, 3, 1, 0, 0, 0);
    assert.ok(mar31 >= q1.from && mar31 <= q1.to);
    assert.ok(apr1 >= q2.from && apr1 <= q2.to);
    const jun30 = new Date(YEAR, 5, 30, 23, 0, 0);
    const jul1 = new Date(YEAR, 6, 1, 0, 0, 0);
    const q2r = quarterRange(YEAR, 2);
    const q3r = quarterRange(YEAR, 3);
    assert.ok(jun30 <= q2r.to);
    assert.ok(jul1 >= q3r.from);
    const y1 = quarterRange(YEAR, 4);
    const y2 = quarterRange(YEAR + 1, 1);
    const dec31 = new Date(YEAR, 11, 31, 23, 0, 0);
    const jan1 = new Date(YEAR + 1, 0, 1, 0, 0, 0);
    assert.ok(dec31 <= y1.to);
    assert.ok(jan1 >= y2.from);
  });

  it("sourceHash orden-invariante; census null≠UNKNOWN", () => {
    const a = computeSourceHash({
      expenses: ["b", "a"],
      invoices: ["i2", "i1"],
    });
    const b = computeSourceHash({
      invoices: ["i1", "i2"],
      expenses: ["a", "b"],
    });
    assert.equal(a, b);
    const n = normalizeSourceIds({ expenses: ["z", "a", "a"] });
    assert.deepEqual(n.expenses, ["a", "z"]);
    const hNull = computeCensusHash({ censusModel303: null });
    const hUnk = computeCensusHash({ censusModel303: "UNKNOWN" });
    assert.notEqual(hNull, hUnk);
    const brand = computeCensusHash({
      censusModel303: "YES",
      name: "ACME",
    });
    const brand2 = computeCensusHash({
      censusModel303: "YES",
      name: "OTHER",
    });
    assert.equal(brand, brand2);
  });

  it("declarationHash estable ante generatedAt", () => {
    const frozen = snap("130", {
      result: 10,
      boxes: { "01": 1, "02": 0, "03": 1, "04": 0, "07": 10, "19": 10 },
    });
    const c1 = buildDeclarationFromFrozenSnapshot({
      model: "130",
      frozen,
      preFilingReviewId: "r",
      sourceHash: "s",
      censusHash: "c",
      metadata: { nif: "X" },
      generatedAt: "2020-01-01T00:00:00.000Z",
    });
    const c2 = buildDeclarationFromFrozenSnapshot({
      model: "130",
      frozen,
      preFilingReviewId: "r",
      sourceHash: "s",
      censusHash: "c",
      metadata: { nif: "X" },
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    assert.equal(computeDeclarationHash(c1), computeDeclarationHash(c2));
    const c3 = { ...c1, result: "11.00" };
    assert.notEqual(computeDeclarationHash(c1), computeDeclarationHash(c3));
  });
});

describe("fase17 close actions coverage", () => {
  it("blockers accionables tienen action o MANUAL_REVIEW", () => {
    const codes: FiscalHealthIssue[] = [
      createHealthIssue({
        code: "OBLIGATION_UNKNOWN",
        title: "x",
        description: "x",
        severity: "CRITICAL",
        blocksFiling: true,
        model: "303",
      }),
      createHealthIssue({
        code: "EU_PURCHASE_NATURE_REVIEW",
        title: "ue",
        description: "ue",
        severity: "WARNING",
        blocksFiling: false,
        sourceId: "e1",
        sourceType: "expense",
      }),
      createHealthIssue({
        code: "VERIFACTU_CHAIN_BROKEN",
        title: "vf",
        description: "vf",
        severity: "ERROR",
        blocksFiling: true,
        sourceId: "inv1",
        sourceType: "invoice",
      }),
      createHealthIssue({
        code: "DOCUMENT_MISSING",
        title: "doc",
        description: "doc",
        severity: "WARNING",
        blocksFiling: false,
        sourceId: "e2",
      }),
      createHealthIssue({
        code: "SOME_UNKNOWN_CODE",
        title: "misc",
        description: "misc",
        severity: "INFO",
        blocksFiling: false,
      }),
    ];
    const actions = buildFiscalCloseActions(codes);
    assert.ok(actions.length >= 4);
    for (const a of actions) {
      assert.ok(
        a.href || a.actionType === "MANUAL_REVIEW",
        `dead-end ${a.code}`
      );
    }
    const census = actions.find((a) => a.code === "OBLIGATION_UNKNOWN");
    assert.ok(census?.href?.includes("settings"));
  });
});

describe("fase17 engine version rule", () => {
  it("versión semántica estable no-git", () => {
    assert.match(FISCAL_ENGINE_VERSION, /^vexo-fiscal-\d+\.\d+\.\d+$/);
    assert.ok(!FISCAL_ENGINE_VERSION.includes("git"));
  });
});
