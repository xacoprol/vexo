import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachFiscalSnapshotV1,
  buildFiscalModelSnapshotV1,
  computeSourceHash,
  hasFiscalSnapshotV1,
  parseFiscalModelSnapshotV1,
  reconcileFiledSnapshotToCurrent,
} from "../fiscal-snapshot";
import {
  compareEngineToPresented,
  hasStructuredSnapshot,
} from "../fiscal-validation/compare";
import { presentedQuarterFromFiling } from "../modelo-130/engine";

describe("Fiscal snapshot v1", () => {
  it("mismo input → mismo sourceHash", () => {
    const a = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 104.09,
      sourceIds: {
        expenses: ["b", "a"],
        invoices: ["z"],
      },
      warnings: ["W2", "W1"],
      census: { censusModel349: "YES" },
      bookCutoffAt: "2026-07-15T10:00:00.000Z",
      computedAt: "2026-07-15T10:00:00.000Z",
    });
    const b = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 104.09,
      sourceIds: {
        expenses: ["a", "b"],
        invoices: ["z"],
      },
      warnings: ["W1", "W2"],
      census: { censusModel349: "YES" },
      bookCutoffAt: "2026-07-15T10:00:00.000Z",
      computedAt: "2026-07-15T10:00:00.000Z",
    });
    assert.equal(a.sourceHash, b.sourceHash);
    assert.equal(
      a.sourceHash,
      computeSourceHash({ expenses: ["a", "b"], invoices: ["z"] })
    );
  });

  it("añadir un gasto → cambia sourceHash", () => {
    const a = buildFiscalModelSnapshotV1({
      model: "303",
      year: 2026,
      quarter: 2,
      result: 100,
      sourceIds: { expenses: ["e1"] },
    });
    const b = buildFiscalModelSnapshotV1({
      model: "303",
      year: 2026,
      quarter: 2,
      result: 100,
      sourceIds: { expenses: ["e1", "e2"] },
    });
    assert.notEqual(a.sourceHash, b.sourceHash);
  });

  it("cambiar orden de IDs → NO cambia sourceHash", () => {
    const h1 = computeSourceHash({
      expenses: ["cms3", "cms1", "cms2"],
    });
    const h2 = computeSourceHash({
      expenses: ["cms1", "cms2", "cms3"],
    });
    assert.equal(h1, h2);
  });

  it("filing legacy sin snapshot → sigue funcionando", () => {
    const cmp = compareEngineToPresented({
      model: "349",
      engineResult: 1390.14,
      presented: {
        result: 104.09,
        incomeBase: null,
        expensesBase: null,
        vatRepercutida: null,
        vatDeductible: null,
        boxes: [],
        sourceFileName: "349.pdf",
        notes: null,
        year: 2026,
        quarter: 2,
        modelType: "349",
        rawExtract: { boxes: [{ code: "02", value: 104.09 }] },
      },
      snapshotAvailable: false,
      legacyLimited: true,
      postFilingDataDetected: true,
      postFilingAddedCount: 10,
    });
    assert.equal(cmp.reconciliationStatus, "LEGACY_LIMITED");
    assert.ok(
      cmp.issues.some((i) => i.code === "POST_FILING_DATA_DETECTED")
    );
    assert.equal(hasStructuredSnapshot("349", { boxes: [] }), false);
  });

  it("snapshot v1 se puede leer después + bookCutoffAt/censo/warnings", () => {
    const snap = buildFiscalModelSnapshotV1({
      model: "130",
      year: 2026,
      quarter: 2,
      result: 281.11,
      boxes: { "19": 281.11 },
      sourceIds: { expenses: ["e1"] },
      warnings: ["REDUCTION_110_3C"],
      census: { previousYearNetIncome130Mode: "UNKNOWN" },
      bookCutoffAt: "2026-07-15T12:00:00.000Z",
    });
    const raw = attachFiscalSnapshotV1({ source: "vexo" }, snap);
    assert.equal(hasFiscalSnapshotV1(raw, "130"), true);
    const parsed = parseFiscalModelSnapshotV1(raw, "130");
    assert.ok(parsed);
    assert.equal(parsed!.bookCutoffAt, "2026-07-15T12:00:00.000Z");
    assert.deepEqual(parsed!.warnings, ["REDUCTION_110_3C"]);
    assert.equal(
      parsed!.census.previousYearNetIncome130Mode,
      "UNKNOWN"
    );
  });

  it("reconcile: sources añadidas → CURRENT_BOOK / POTENTIAL_AMENDMENT", () => {
    const filed = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 104.09,
      sourceIds: { expenses: ["bambu"] },
      bookCutoffAt: "2026-07-15T10:00:00.000Z",
    });
    const current = buildFiscalModelSnapshotV1({
      model: "349",
      year: 2026,
      quarter: 2,
      result: 1390.14,
      sourceIds: { expenses: ["bambu", "xtool"] },
      bookCutoffAt: "2026-08-27T10:00:00.000Z",
    });
    const r = reconcileFiledSnapshotToCurrent({ filed, current });
    assert.equal(r.reconciliationStatus, "POTENTIAL_AMENDMENT_REQUIRED");
    assert.equal(r.changes.added.length, 1);
    assert.equal(r.changes.added[0].sourceId, "xtool");
    assert.equal(r.delta, 1286.05);
  });
});

describe("VeriFactu / 130 legacy regression (phase12)", () => {
  it("OCR legacy sin cas.07: fallback a resultado", () => {
    const presented = presentedQuarterFromFiling({
      quarter: 1,
      result: 944.7,
      boxes: [
        { code: "01", value: 11471.59 },
        { code: "19", value: 944.7 },
      ],
    });
    assert.equal(presented.box07, 944.7);
  });
});
