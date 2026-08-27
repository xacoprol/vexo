/**
 * Fase 16 — AEAT assisted submission strategy (no network).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFiscalModelSnapshotV1 } from "../fiscal-snapshot";
import { FISCAL_ENGINE_VERSION } from "../fiscal-close";
import {
  buildDeclarationFromFrozenSnapshot,
  computeDeclarationHash,
  validateFiscalDeclarationDraft,
  AEAT_READINESS,
  rejectGenerationWhenOpen,
  type FiscalDeclarationDraft,
} from "../fiscal-declaration";
import {
  AEAT_CAPABILITY_MATRIX,
  AEAT_RESPONSE_FIXTURES,
  AEAT_SEDE_LINKS,
  assessPaymentRequirement,
  assertReadyForAssistedSubmission,
  buildManualFilingRegistration,
  compareFiledToDraft,
  decideSubmissionIdempotency,
  getSubmissionAdapter,
  mapFixtureToStatus,
  prepareAssistedSubmission,
  submissionIdempotencyKey,
  type FiscalSubmissionAttemptRecord,
} from "../fiscal-submission";

function snap130(result = 100.5) {
  return buildFiscalModelSnapshotV1({
    model: "130",
    year: 2025,
    quarter: 4,
    result,
    boxes: {
      "01": 5000,
      "02": 2000,
      "03": 3000,
      "04": 600,
      "07": result,
      "19": result,
    },
    sourceIds: { expenses: ["e1"], invoices: ["i1"] },
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

function draft130(): FiscalDeclarationDraft {
  const frozen = snap130();
  const draftCore = buildDeclarationFromFrozenSnapshot({
    model: "130",
    frozen,
    preFilingReviewId: "rev-16",
    sourceHash: "src16",
    censusHash: "cen16",
    metadata: { nif: "44483582H", frozenAt: "2025-12-20T10:00:00.000Z" },
    generatedAt: "2025-12-20T10:00:00.000Z",
  });
  const declarationHash = computeDeclarationHash(draftCore);
  const validation = validateFiscalDeclarationDraft(
    { ...draftCore, declarationHash },
    frozen
  );
  return { ...draftCore, declarationHash, validation };
}

function attempt(
  overrides: Partial<FiscalSubmissionAttemptRecord> & {
    id: string;
    status: FiscalSubmissionAttemptRecord["status"];
  }
): FiscalSubmissionAttemptRecord {
  const d = draft130();
  return {
    tenantId: "default",
    model: "130",
    year: 2025,
    quarter: 4,
    preFilingReviewId: d.preFilingReviewId,
    declarationHash: d.declarationHash,
    startedAt: "2025-12-21T10:00:00.000Z",
    finishedAt: null,
    channel: "ASSISTED_WEB",
    requestFingerprint: "fp",
    responseCode: null,
    errorCode: null,
    receiptId: null,
    filingId: null,
    paymentRequirement: "NRC_REQUIRED",
    reviewMatchFlag: null,
    safeMessage: null,
    ...overrides,
  };
}

describe("fase16 capability matrix", () => {
  it("ningún modelo tiene DIRECT_API_SUPPORTED", () => {
    for (const m of Object.values(AEAT_CAPABILITY_MATRIX)) {
      assert.notEqual(m.capability, "DIRECT_API_SUPPORTED");
      assert.equal(m.hasPublicApi, false);
      assert.equal(m.strategy, "ASSISTED");
      assert.ok(AEAT_SEDE_LINKS[m.model].includes("agenciatributaria"));
    }
  });

  it("AEAT_READINESS reflejan ASSISTED_ONLY", () => {
    for (const n of Object.values(AEAT_READINESS)) {
      assert.equal(n.status, "ASSISTED_ONLY");
    }
  });
});

describe("fase16 adapters asistidos", () => {
  it("prepare → USER_ACTION_REQUIRED sin submit", () => {
    const draft = draft130();
    assert.equal(draft.validation.valid, true);
    const adapter = getSubmissionAdapter("130");
    assert.equal(typeof adapter.submit, "undefined");
    const cap = adapter.canSubmit(draft);
    assert.equal(cap.canAutoSubmit, false);
    assert.equal(cap.canPrepare, true);
    const prepared = prepareAssistedSubmission(draft);
    assert.equal(prepared.status, "USER_ACTION_REQUIRED");
    assert.equal(prepared.channel, "ASSISTED_WEB");
    assert.equal(prepared.declarationHash, draft.declarationHash);
    assert.ok(prepared.checklist.length >= 5);
  });

  it("payment NRC_REQUIRED si result > 0", () => {
    const p = assessPaymentRequirement({ model: "130", result: "100.50" });
    assert.equal(p.status, "NRC_REQUIRED");
    const none = assessPaymentRequirement({ model: "349", result: "250.00" });
    assert.equal(none.status, "NONE");
    const zero = assessPaymentRequirement({ model: "303", result: "0.00" });
    assert.equal(zero.status, "NONE");
  });
});

describe("fase16 idempotency", () => {
  it("clave tenant+model+period+hash", () => {
    const d = draft130();
    const k = submissionIdempotencyKey({
      tenantId: "default",
      model: "130",
      year: 2025,
      quarter: 4,
      declarationHash: d.declarationHash,
    });
    assert.ok(k.includes(d.declarationHash));
  });

  it("ACCEPTED no se repite", () => {
    const d = decideSubmissionIdempotency([
      attempt({
        id: "a1",
        status: "ACCEPTED",
        finishedAt: "2025-12-21T12:00:00.000Z",
      }),
    ]);
    assert.equal(d.action, "RETURN_EXISTING");
  });

  it("SUBMITTING bloquea", () => {
    const d = decideSubmissionIdempotency([
      attempt({ id: "a2", status: "SUBMITTING" }),
    ]);
    assert.equal(d.action, "BLOCK");
  });

  it("TECHNICAL_ERROR permite retry", () => {
    const d = decideSubmissionIdempotency([
      attempt({ id: "a3", status: "TECHNICAL_ERROR" }),
    ]);
    assert.equal(d.action, "PROCEED");
  });

  it("SUBMISSION_STATUS_UNKNOWN exige reconciliar", () => {
    const d = decideSubmissionIdempotency([
      attempt({ id: "a4", status: "SUBMISSION_STATUS_UNKNOWN" }),
    ]);
    assert.equal(d.action, "RECONCILE_REQUIRED");
  });

  it("USER_ACTION_REQUIRED reutiliza", () => {
    const d = decideSubmissionIdempotency([
      attempt({ id: "a5", status: "USER_ACTION_REQUIRED" }),
    ]);
    assert.equal(d.action, "RETURN_EXISTING");
  });
});

describe("fase16 stale reject", () => {
  it("rechaza si lifecycle no READY_FOR_SUBMISSION", () => {
    const draft = draft130();
    const r = assertReadyForAssistedSubmission({
      draft,
      current: {
        sourceHash: draft.sourceHash,
        censusHash: draft.censusHash,
        engineVersion: draft.engineVersion,
        lifecycleStatus: "OPEN",
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "NOT_READY_FOR_SUBMISSION");
  });

  it("rechaza sourceHash stale", () => {
    const draft = draft130();
    const r = assertReadyForAssistedSubmission({
      draft,
      current: {
        sourceHash: "other",
        censusHash: draft.censusHash,
        engineVersion: draft.engineVersion,
        lifecycleStatus: "READY_FOR_SUBMISSION",
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "STALE_REVIEW");
  });

  it("2T OPEN guardrail generation", () => {
    const r = rejectGenerationWhenOpen();
    assert.equal(r.ok, false);
    assert.equal(r.error, "PRE_FILING_REVIEW_REQUIRED");
  });
});

describe("fase16 manual filing MATCH / DIFFERS", () => {
  it("MATCH cuando mismos datos", () => {
    const draft = draft130();
    const flag = compareFiledToDraft({
      draftResult: draft.result,
      draftBoxes: draft.boxes,
      filedResult: draft.result,
      filedBoxes: draft.boxes,
    });
    assert.equal(flag, "FILED_MATCHES_REVIEW");
    const built = buildManualFilingRegistration(
      {
        tenantId: "default",
        draft,
        filedAt: "2025-12-22",
        receiptId: "CSV-TEST-MATCH",
        filedResult: draft.result,
      },
      "att-match"
    );
    assert.equal(built.reviewMatchFlag, "FILED_MATCHES_REVIEW");
    assert.equal(built.filingSource, "MANUAL_AEAT");
    assert.equal(built.lineage.declarationHash, draft.declarationHash);
    assert.equal(built.lineage.submissionAttemptId, "att-match");
    assert.equal(built.filingPayload.rawExtract.source, "MANUAL_AEAT");
  });

  it("DIFFERS cuando resultado distinto", () => {
    const draft = draft130();
    const built = buildManualFilingRegistration(
      {
        tenantId: "default",
        draft,
        filedAt: "2025-12-22",
        receiptId: "CSV-TEST-DIFF",
        filedResult: "999.99",
      },
      "att-diff"
    );
    assert.equal(built.reviewMatchFlag, "FILED_DIFFERS_FROM_REVIEW");
    assert.equal(
      built.filingPayload.rawExtract.frozenDeclarationResult,
      draft.result
    );
  });
});

describe("fase16 fixtures parser", () => {
  it("mapea fixtures oficiales conceptuales", () => {
    assert.equal(mapFixtureToStatus("fx-accepted"), "ACCEPTED");
    assert.equal(mapFixtureToStatus("fx-rejected"), "REJECTED");
    assert.equal(mapFixtureToStatus("fx-technical"), "TECHNICAL_ERROR");
    assert.equal(mapFixtureToStatus("fx-unknown"), "SUBMISSION_STATUS_UNKNOWN");
    assert.equal(AEAT_RESPONSE_FIXTURES.length >= 5, true);
  });
});
