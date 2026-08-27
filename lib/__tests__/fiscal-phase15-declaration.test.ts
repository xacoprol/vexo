/**
 * Fase 15 — declaration builders from frozen snapshot.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFiscalModelSnapshotV1 } from "../fiscal-snapshot";
import { FISCAL_ENGINE_VERSION } from "../fiscal-close";
import {
  buildDeclarationFromFrozenSnapshot,
  computeDeclarationHash,
  generateDeclarationFromParts,
  rejectGenerationWhenOpen,
  serializeMoney,
  toCanonicalVexoExport,
  validateFiscalDeclarationDraft,
  AEAT_READINESS,
} from "../fiscal-declaration";
import { assessSnapshotCompleteness } from "../fiscal-close/enrich-snapshots";
import type { PreFilingReviewRow } from "../fiscal-close";

function reviewFromSnap(
  snap: ReturnType<typeof buildFiscalModelSnapshotV1>,
  overrides: Partial<PreFilingReviewRow> = {}
): PreFilingReviewRow {
  return {
    id: "rev-1",
    periodKey: "2026:2",
    year: 2026,
    quarter: 2,
    payload: { models: [snap], sourceHash: "src", censusHash: "cen" },
    sourceHash: "src",
    censusHash: "cen",
    engineVersion: FISCAL_ENGINE_VERSION,
    healthStatus: "READY",
    readyToFile: true,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    createdBy: "user",
    supersededAt: null,
    ...overrides,
  };
}

function snap130() {
  return buildFiscalModelSnapshotV1({
    model: "130",
    year: 2026,
    quarter: 2,
    result: 281.11,
    boxes: {
      "01": 10000,
      "02": 4000,
      "03": 6000,
      "04": 1200,
      "07": 281.11,
      "19": 281.11,
    },
    sourceIds: { expenses: ["e1"], invoices: ["i1"] },
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

function snap303() {
  return buildFiscalModelSnapshotV1({
    model: "303",
    year: 2026,
    quarter: 2,
    result: 100.5,
    boxes: {
      "07": 1000,
      "09": 210,
      "10": 100,
      "11": 21,
      "27": 231,
      "29": 130.5,
      "71": 100.5,
    },
    sourceIds: { expenses: ["e1"], invoices: ["i1"] },
    detail: { outcome: "TO_PAY" },
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

function snap349() {
  return buildFiscalModelSnapshotV1({
    model: "349",
    year: 2026,
    quarter: 2,
    result: 250,
    boxes: { A: 150, I: 100 },
    sourceIds: { expenses: ["eu1", "eu2"] },
    detail: {
      periodicity: "QUARTERLY",
      totalsByKey: { A: 150, I: 100 },
      operations: [
        {
          vatId: "DE123456789",
          country: "DE",
          operatorName: "Goods GmbH",
          key: "A",
          amount: 150,
        },
        {
          vatId: "IE3347697KH",
          country: "IE",
          operatorName: "Services Ltd",
          key: "I",
          amount: 100,
        },
      ],
    },
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

function snap111() {
  return buildFiscalModelSnapshotV1({
    model: "111",
    year: 2026,
    quarter: 2,
    result: 150,
    boxes: { box07: 1, box08: 1000, box09: 150, box30: 150 },
    sourceIds: { withholdings: ["w1"] },
    detail: {
      outcome: "TO_PAY",
      payees: [
        {
          counterpartyId: "cp1",
          name: "Profesional",
          taxId: "B12345674",
          baseAmount: 1000,
          withholdingAmount: 150,
        },
      ],
    },
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

function snap115() {
  return buildFiscalModelSnapshotV1({
    model: "115",
    year: 2026,
    quarter: 2,
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
    engineVersion: FISCAL_ENGINE_VERSION,
  });
}

describe("Fase 15 — money + hash", () => {
  it("serializeMoney canónico", () => {
    assert.equal(serializeMoney(736.07), "736.07");
    assert.equal(serializeMoney(736.1), "736.10");
    assert.equal(serializeMoney(null), null);
  });

  it("declarationHash determinista e independiente de generatedAt", () => {
    const frozen = snap303();
    const a = buildDeclarationFromFrozenSnapshot({
      model: "303",
      frozen,
      preFilingReviewId: "r",
      sourceHash: "src",
      censusHash: "cen",
      metadata: { nif: "44483582H" },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const b = buildDeclarationFromFrozenSnapshot({
      model: "303",
      frozen,
      preFilingReviewId: "r",
      sourceHash: "src",
      censusHash: "cen",
      metadata: { nif: "44483582H" },
      generatedAt: "2026-12-31T23:59:59.000Z",
    });
    assert.equal(computeDeclarationHash(a), computeDeclarationHash(b));
  });
});

describe("Fase 15 — snapshot completeness", () => {
  it("130/303/349/111/115 enriched = COMPLETE", () => {
    assert.equal(assessSnapshotCompleteness(snap130()).complete, true);
    assert.equal(assessSnapshotCompleteness(snap303()).complete, true);
    assert.equal(assessSnapshotCompleteness(snap349()).complete, true);
    assert.equal(assessSnapshotCompleteness(snap111()).complete, true);
    assert.equal(assessSnapshotCompleteness(snap115()).complete, true);
  });

  it("freeze legacy sin boxes = INCOMPLETE", () => {
    const legacy = buildFiscalModelSnapshotV1({
      model: "303",
      year: 2026,
      quarter: 2,
      result: 1,
      boxes: {},
    });
    const a = assessSnapshotCompleteness(legacy);
    assert.equal(a.complete, false);
    assert.ok(a.missing.includes("boxes"));
  });

  it("349 sin operations = INCOMPLETE", () => {
    const s = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 10,
      boxes: { A: 10 },
    });
    assert.equal(assessSnapshotCompleteness(s).complete, false);
  });
});

describe("Fase 15 — builders", () => {
  it("130 PASS", () => {
    const frozen = snap130();
    const review = reviewFromSnap(frozen);
    const r = generateDeclarationFromParts({
      review,
      model: "130",
      frozenModel: frozen,
      metadata: { nif: "44483582H" },
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.draft.validation.valid, true);
    assert.equal(r.draft.result, "281.11");
    assert.equal(r.draft.boxes["19"], "281.11");
  });

  it("303 PASS + UE boxes", () => {
    const frozen = snap303();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "303",
      frozenModel: frozen,
      metadata: { nif: "44483582H" },
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.draft.boxes["10"], "100.00");
    assert.equal(r.draft.boxes["11"], "21.00");
    assert.equal(r.draft.result, "100.50");
  });

  it("349 PASS A/I", () => {
    const frozen = snap349();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "349",
      frozenModel: frozen,
      metadata: { nif: "44483582H" },
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.draft.detail?.operations?.length, 2);
    assert.ok(r.draft.detail?.operations?.some((o) => o.key === "A"));
    assert.ok(r.draft.detail?.operations?.some((o) => o.key === "I"));
  });

  it("111 REQUIRED fixture PASS", () => {
    const frozen = snap111();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "111",
      frozenModel: frozen,
      metadata: { nif: "44483582H" },
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.draft.detail?.payees?.length, 1);
    assert.equal(r.draft.result, "150.00");
  });

  it("115 REQUIRED fixture PASS", () => {
    const frozen = snap115();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "115",
      frozenModel: frozen,
      metadata: { nif: "44483582H" },
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.draft.detail?.landlords?.length, 1);
    assert.equal(r.draft.result, "190.00");
  });

  it("idempotencia declarationHash", () => {
    const frozen = snap303();
    const review = reviewFromSnap(frozen);
    const a = generateDeclarationFromParts({
      review,
      model: "303",
      frozenModel: frozen,
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    const b = generateDeclarationFromParts({
      review,
      model: "303",
      frozenModel: frozen,
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) {
      assert.equal(a.draft.declarationHash, b.draft.declarationHash);
    }
  });
});

describe("Fase 15 — negative / stale / auth-ish", () => {
  it("OPEN → PRE_FILING_REVIEW_REQUIRED", () => {
    const r = rejectGenerationWhenOpen();
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "PRE_FILING_REVIEW_REQUIRED");
  });

  it("source drift → STALE_REVIEW", () => {
    const frozen = snap130();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "130",
      frozenModel: frozen,
      currentSourceHash: "CHANGED",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "STALE_REVIEW");
  });

  it("census drift → STALE_REVIEW", () => {
    const frozen = snap130();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "130",
      frozenModel: frozen,
      currentSourceHash: "src",
      currentCensusHash: "CHANGED",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "STALE_REVIEW");
  });

  it("engine drift → ENGINE_CHANGED", () => {
    const frozen = snap130();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "130",
      frozenModel: frozen,
      currentSourceHash: "src",
      currentCensusHash: "cen",
      currentEngineVersion: "other-engine",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "ENGINE_CHANGED_REVIEW_REQUIRED");
  });

  it("client boxes rejected", () => {
    const frozen = snap130();
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "130",
      frozenModel: frozen,
      currentSourceHash: "src",
      currentCensusHash: "cen",
      clientBoxes: { "19": 999 },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "UNSUPPORTED_MODEL_FEATURE");
  });

  it("snapshot incompleto", () => {
    const frozen = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 1,
      boxes: { A: 1 },
    });
    const r = generateDeclarationFromParts({
      review: reviewFromSnap(frozen),
      model: "349",
      frozenModel: frozen,
      currentSourceHash: "src",
      currentCensusHash: "cen",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "SNAPSHOT_INCOMPLETE");
  });
});

describe("Fase 15 — export + preview consistency", () => {
  it("canonical export NOT AEAT + preview == freeze", () => {
    const frozen = snap303();
    const draftCore = buildDeclarationFromFrozenSnapshot({
      model: "303",
      frozen,
      preFilingReviewId: "r",
      sourceHash: frozen.sourceHash,
      censusHash: "cen",
      metadata: { nif: "44483582H" },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const hash = computeDeclarationHash(draftCore);
    const validation = validateFiscalDeclarationDraft(
      { ...draftCore, declarationHash: hash },
      frozen
    );
    const draft = { ...draftCore, declarationHash: hash, validation };
    const exp = toCanonicalVexoExport(draft);
    assert.equal(exp.schema, "vexo-fiscal-declaration/1");
    assert.match(exp.meta.note, /No es formato oficial AEAT/);
    assert.equal(exp.result, "100.50");
    assert.equal(exp.boxes["71"], "100.50");
    assert.equal(exp.integrity.declarationHash, hash);
  });
});

describe("Fase 15 — AEAT readiness docs", () => {
  it("todos ASSISTED_ONLY tras investigación Sede (sin API pública)", () => {
    for (const m of ["130", "303", "349", "111", "115"] as const) {
      assert.equal(AEAT_READINESS[m].status, "ASSISTED_ONLY");
    }
  });
});
