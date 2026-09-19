/**
 * Fase 4 — golden test del caso fiscal real 2026 (titular, datos anonimizados).
 *
 * Expected = conclusión auditada del motor sobre los libros, NO copia ciega del OCR gestoría.
 * Origen de cada cifra: lib/__tests__/fixtures/fiscal-real-golden/load-books.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { quarterRange } from "../fiscal";
import { buildFiscalCensusProfileFromSettings } from "../fiscal-obligations";
import { adapt111Obligation } from "../fiscal-obligations/adapters/model-111";
import { adapt115Obligation } from "../fiscal-obligations/adapters/model-115";
import { adapt130Obligation } from "../fiscal-obligations/adapters/model-130";
import { adapt303Obligation } from "../fiscal-obligations/adapters/model-303";
import { adapt347Obligation } from "../fiscal-obligations/adapters/model-347";
import { adapt349Obligation } from "../fiscal-obligations/adapters/model-349";
import { adapt390Obligation } from "../fiscal-obligations/adapters/model-390";
import { adapt180Obligation } from "../fiscal-obligations/adapters/model-180";
import { adapt190Obligation } from "../fiscal-obligations/adapters/model-190";
import { normalizeMotorWarning } from "../fiscal-health/checks";
import { resolvePeriodReadiness } from "../fiscal-validation";
import { collect349ExpenseLines, group349Operations } from "../modelo-349/aggregate";
import { resolveEuVatId } from "../modelo-349/vat-id";
import {
  computeGolden130,
  computeGolden303,
  goldenCensusSettings,
  goldenDir,
  loadGoldenExtract,
  PRESENTED_130_Q2,
  PRESENTED_303_Q2,
  PRESENTED_349_Q2,
  Q2_349_OPERATORS,
  VEXO_130_Q1,
  VEXO_130_Q2,
  VEXO_303_Q2,
} from "./fixtures/fiscal-real-golden/load-books";
import { makeObligationsResult } from "./fixtures/fiscal-real-period";

const NOW = new Date("2026-09-03T12:00:00");

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

describe("Fase 4 golden — censo real", () => {
  it("todos los flags censales operativos están UNKNOWN (causa OBLIGATION_UNKNOWN:303)", () => {
    const s = goldenCensusSettings();
    assert.equal(s.fiscalRegime, "130");
    assert.equal(s.irpfDirectEstimationMode, "NORMAL");
    assert.equal(s.activityKind130, "UNKNOWN");
    assert.equal(s.vatPeriodicity, "UNKNOWN");
    assert.equal(s.censusModel130, "UNKNOWN");
    assert.equal(s.censusModel303, "UNKNOWN");
    assert.equal(s.censusModel111, "UNKNOWN");
    assert.equal(s.censusModel115, "UNKNOWN");
    assert.equal(s.censusModel349, "UNKNOWN");
    assert.equal(s.censusModel347, "UNKNOWN");
    assert.equal(s.censusModel390, "UNKNOWN");
    assert.equal(s.censusLastUpdatedAt, null);
  });

  it("303 Q2 es UNKNOWN por VAT_PERIODICITY_UNKNOWN + CENSUS_303_UNKNOWN", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a = adapt303Obligation({
      profile,
      year: 2026,
      quarter: 2,
      filed: true,
      filingId: "filed-303-q2",
      now: NOW,
      hasVatActivity: true,
    });
    assert.equal(a.entry.obligationStatus, "UNKNOWN");
    assert.ok(a.entry.reasonCodes.includes("VAT_PERIODICITY_UNKNOWN"));
    assert.ok(a.entry.reasonCodes.includes("CENSUS_303_UNKNOWN"));
  });

  it("130 Q2 es UNKNOWN por activityKind130 UNKNOWN", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a = adapt130Obligation({
      profile,
      year: 2026,
      quarter: 2,
      incomeBaseYtd: VEXO_130_Q2.box01,
      incomeWithWithholdingYtd: 0,
      filed: true,
      filingId: "filed-130-q2",
      now: NOW,
    });
    assert.equal(a.entry.obligationStatus, "UNKNOWN");
  });

  it("349 Q2 es REQUIRED por HAS_OPS pese a censo UNKNOWN", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a = adapt349Obligation({
      profile,
      year: 2026,
      quarter: 2,
      hasOps: true,
      filed: true,
      filingId: "filed-349-q2",
      now: NOW,
    });
    assert.equal(a.entry.obligationStatus, "REQUIRED");
    assert.ok(a.entry.reasonCodes.includes("HAS_OPS"));
  });
});

describe("Fase 4 golden — Modelo 130 Q2 (acumulado Q1+Q2)", () => {
  it("reproduce casillas VEXO auditadas, no las de gestoría", () => {
    const chain = computeGolden130();
    const q1 = chain[1].boxes;
    const q2 = chain[2].boxes;
    assert.equal(q1.box01, VEXO_130_Q1.box01);
    assert.equal(q1.box02, VEXO_130_Q1.box02);
    assert.equal(q2.box01, VEXO_130_Q2.box01);
    assert.equal(q2.box02, VEXO_130_Q2.box02);
    assert.equal(q2.box03, VEXO_130_Q2.box03);
    assert.equal(q2.box04, VEXO_130_Q2.box04);
    assert.equal(q2.box05, VEXO_130_Q2.box05);
    assert.equal(q2.box06, VEXO_130_Q2.box06);
    assert.equal(q2.box07, VEXO_130_Q2.box07);
    assert.equal(q2.box15, 0);
    assert.equal(q2.box19, VEXO_130_Q2.box19);
    assert.equal(chain[2].unusedNegativeResultsAfter, 0);
  });

  it("cas.05 Q2 usa el 130 Q1 presentado (944.70), no el borrador VEXO Q1", () => {
    const q2 = computeGolden130()[2].boxes;
    assert.equal(q2.box05, PRESENTED_130_Q2.boxes.find((b) => b.code === "05")?.value);
    assert.notEqual(q2.box05, VEXO_130_Q1.box07);
  });

  it("documenta deltas vs gestoría: MATCH en 05/06; DATA gap en 01/02", () => {
    const q2 = computeGolden130()[2].boxes;
    assert.equal(q2.box05, 944.7);
    assert.equal(q2.box06, 235.2);
    assert.equal(round2(q2.box01 - 21785.72), -114.85);
    assert.equal(round2(q2.box02 - 14480.67), -1964.12);
    assert.equal(round2(q2.box19 - 281.11), 369.85);
  });

  it("pool negativo Fase 2 no altera este caso (rendimiento Q1/Q2 > 0)", () => {
    const chain = computeGolden130();
    assert.ok(chain[1].boxes.box03 > 0);
    assert.ok(chain[2].boxes.box03 > 0);
    assert.equal(chain[1].boxes.box15, 0);
    assert.equal(chain[2].boxes.box15, 0);
    assert.equal(chain[2].unusedNegativeResultsAfter, 0);
  });
});

describe("Fase 4 golden — Modelo 303 Q2", () => {
  it("reproduce casillas VEXO auditadas (23 % PT fuera de cas.27)", () => {
    const r = computeGolden303(2);
    const b = r.modelo303.boxes;
    for (const [k, v] of Object.entries(VEXO_303_Q2)) {
      assert.equal(b[k as keyof typeof b], v, k);
    }
  });

  it("Shopify mayo SUMMARY con país inválido → IMPORT_DATA_INVALID (no otherQuota ni 07)", () => {
    const r = computeGolden303(2);
    assert.equal(r.modelo303.boxes.otherBase, 0);
    assert.equal(r.modelo303.boxes.otherQuota, 0);
    assert.ok(
      r.modelo303.warnings.some((w) => w.code === "IMPORT_DATA_INVALID")
    );
    // No congelar 23 % = PT/OSS: solo metadata imposible.
    assert.ok(
      !r.modelo303.warnings.some(
        (w) =>
          w.code === "NON_STANDARD_VAT_RATE_REVIEW_REQUIRED" &&
          /tipo 23/.test(w.message) &&
          /IVA/.test(w.message)
      )
    );
  });

  it("delta 07 vs gestoría incluye Shopify SUMMARY sin país ISO (WAIT_FOR_GESTORIA)", () => {
    const b = computeGolden303(2).modelo303.boxes;
    const presented07 = PRESENTED_303_Q2.boxes.find((x) => x.code === "07")!.value;
    // VEXO no liquida resúmenes con shipToCountry=IVA; gestoría sí mete parte en 07.
    assert.equal(round2(presented07 - b.box07), 1433.47);
  });

  it("cas.10 VEXO incluye AIB reales; gestoría solo Bambu 104.09", () => {
    const b = computeGolden303(2).modelo303.boxes;
    assert.equal(b.box10, 1390.14);
    assert.equal(PRESENTED_303_Q2.boxes.find((x) => x.code === "10")!.value, 104.09);
    assert.equal(round2(b.box10 - 104.09), 1286.05);
  });

  it("Canarias en cas.60; OSS Amazon en cas.123; prorrata por EXEMPT marketplace", () => {
    const r = computeGolden303(2);
    assert.equal(r.modelo303.boxes.box60, 365);
    assert.equal(r.modelo303.boxes.box123, 116.5);
    assert.equal(r.modelo303.boxes.baseExenta, 2602.8);
    assert.ok(
      r.modelo303.warnings.some((w) => w.code === "VAT_PRORATA_REVIEW_REQUIRED")
    );
  });
});

describe("Fase 4 golden — Modelo 349 Q2", () => {
  it("agrupa operadores UE con VAT ID público y no copia el 349 de gestoría", () => {
    const { from, to } = quarterRange(2026, 2);
    const expenses = Q2_349_OPERATORS.map((op, i) => ({
      id: `eu-${i}`,
      issueDate: new Date(2026, 4, 15, 12),
      subtotal: op.amount,
      vatOperationType: "INTRACOMUNITARIA",
      supplierName: op.name,
      supplierNif: op.vatId,
    }));
    const warnings: { code: string }[] = [];
    const { lines, skippedMissingVatId } = collect349ExpenseLines(
      expenses,
      from,
      to,
      warnings
    );
    assert.equal(skippedMissingVatId, 0);
    const grouped = group349Operations(lines);
    assert.equal(grouped.length, 5);
    assert.equal(
      round2(grouped.reduce((s, o) => s + o.amount, 0)),
      1390.14
    );
    assert.equal(PRESENTED_349_Q2.operators, 1);
    assert.equal(PRESENTED_349_Q2.amount, 104.09);
    const shopify = grouped.find((o) => o.vatId === "IE3347697KH");
    assert.equal(shopify?.key, "A");
    assert.equal(
      Q2_349_OPERATORS.find((o) => o.vatId === "IE3347697KH")?.verdict,
      "NEEDS_REVIEW"
    );
  });
});

describe("Fase 4 golden — 111 / 115", () => {
  it("no infiere NOT_APPLICABLE con censo UNKNOWN y tablas vacías", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a111 = adapt111Obligation({
      profile,
      year: 2026,
      quarter: 2,
      hasRelevantPayments: false,
      totalWithholdingAmount: 0,
      filed: false,
      filingId: null,
      now: NOW,
    });
    const a115 = adapt115Obligation({
      profile,
      year: 2026,
      quarter: 2,
      hasRelevantPayments: false,
      totalWithholdingAmount: 0,
      filed: false,
      filingId: null,
      now: NOW,
    });
    assert.equal(a111.entry.obligationStatus, "UNKNOWN");
    assert.equal(a115.entry.obligationStatus, "UNKNOWN");
  });

  it("libros Q2 tienen 1 gasto PROFESIONALES con withholding UNKNOWN — no NOT_APPLICABLE", () => {
    const extract = loadGoldenExtract();
    const pro = extract.q2.expenses.filter((e) => e.category === "PROFESIONALES");
    assert.equal(pro.length, 1);
    assert.equal(pro[0].practicedWithholdingStatus, "UNKNOWN");
    const leases = extract.q2.expenses.filter((e) =>
      String(e.category ?? "").toUpperCase().includes("ALQUILER")
    );
    assert.equal(leases.length, 0);
  });
});

describe("Fase 4 golden — anuales proyectadas", () => {
  it("347 2026 REQUIRED por HAS_OPS (histórico 347:2025) con censo UNKNOWN", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a = adapt347Obligation({
      profile,
      year: 2026,
      hasDeclarableOps: true,
      filed: false,
      filingId: null,
      now: NOW,
    });
    assert.equal(a.entry.obligationStatus, "REQUIRED");
  });

  it("390 queda UNKNOWN hasta completar periodicidad/SII/territorio", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a = adapt390Obligation({
      profile,
      year: 2026,
      filed: false,
      filingId: null,
      now: NOW,
    });
    assert.equal(a.entry.obligationStatus, "UNKNOWN");
  });

  it("180/190 UNKNOWN — no se infiere NOT_EXPECTED solo por censo UNKNOWN", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a180 = adapt180Obligation({
      profile,
      year: 2026,
      hasRelevantRentPayments: false,
      filed: false,
      filingId: null,
      now: NOW,
    });
    const a190 = adapt190Obligation({
      profile,
      year: 2026,
      hasRelevantPerceptions: false,
      filed: false,
      filingId: null,
      now: NOW,
    });
    assert.equal(a180.entry.obligationStatus, "UNKNOWN");
    assert.equal(a190.entry.obligationStatus, "UNKNOWN");
  });
});

describe("Fase 4 golden — health / readiness 2T", () => {
  it("UNKNOWN 303 bloquea cierre aunque el 303/130/349 estén presentados", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a303 = adapt303Obligation({
      profile,
      year: 2026,
      quarter: 2,
      filed: true,
      filingId: "x",
      now: NOW,
      hasVatActivity: true,
    });
    const readiness = resolvePeriodReadiness({
      health: { status: "READY_WITH_WARNINGS", blockers: [], issues: [] },
      obligations: makeObligationsResult([a303.entry]),
      quarter: 2,
    });
    assert.equal(readiness.status, "NOT_READY");
    assert.ok(readiness.blockers.some((b) => b.code === "OBLIGATION_UNKNOWN"));
  });
});

describe("Fase 4 golden — Q3 2026 en curso", () => {
  it("hay entrega UE a PT con VAT ID inválido (bloquea 349)", () => {
    const meta = JSON.parse(
      readFileSync(join(goldenDir(), "q3-meta.json"), "utf8")
    ) as {
      intraInvoices: {
        vatIdOk: boolean;
        vatIdCode: string | null;
        clientCountry: string;
        subtotal: number;
      }[];
    };
    assert.equal(meta.intraInvoices.length, 1);
    assert.equal(meta.intraInvoices[0].clientCountry, "PT");
    assert.equal(meta.intraInvoices[0].vatIdOk, false);
    assert.equal(meta.intraInvoices[0].vatIdCode, "EU_VAT_ID_INVALID");
    const issue = normalizeMotorWarning(
      { code: "EU_VAT_ID_INVALID", message: "NIF-IVA PT inválido" },
      "349",
      2026,
      3
    );
    assert.equal(issue.blocksFiling, true);
  });

  it("censo sigue bloqueando 303/130 en Q3", () => {
    const profile = buildFiscalCensusProfileFromSettings(goldenCensusSettings());
    const a303 = adapt303Obligation({
      profile,
      year: 2026,
      quarter: 3,
      filed: false,
      filingId: null,
      now: NOW,
      hasVatActivity: true,
    });
    assert.equal(a303.entry.obligationStatus, "UNKNOWN");
  });

  it("resolveEuVatId no inventa identificadores", () => {
    const miss = resolveEuVatId("", "PT");
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.code, "EU_VAT_ID_MISSING");
  });
});
