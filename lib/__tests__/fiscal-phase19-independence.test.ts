/**
 * Fase 3 — Independencia operativa: enmiendas, overdue/late, calendario,
 * anuales, unsupported, professional review, checklist, invariantes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertOriginalImmutable,
  detectAmendmentRequired,
  fileAmendment,
  prepareAmendment,
  reconcileAmendmentChain,
  type ImmutablePresentedFiling,
} from "../fiscal-amendment";
import {
  buildFiscalCalendarForYear,
  guideDueDate,
  buildUpcomingDeadlines,
} from "../fiscal-calendar";
import {
  buildIndependencePeriodChecklist,
  buildIndependenceYearChecklist,
  buildIndependenceDashboard,
} from "../fiscal-independence";
import {
  buildLateFilingEvidence,
  canPrepareWhileOverdue,
  resolveFilingStatus,
  resolveObligationDueDate,
} from "../fiscal-obligations/filing-status";
import {
  assess347UnsupportedSignals,
  assess390SupportLevel,
  createUnsupportedFiscalCase,
  mapWarningToUnsupportedCase,
} from "../fiscal-unsupported";
import {
  buildFiscalYearOverview,
  detectAnnualQuarterContradictions,
  employmentUnsupportedCase,
} from "../fiscal-year/overview";
import { resolveCloseLifecycle } from "../fiscal-validation/readiness";
import { makeObligation } from "./fixtures/fiscal-real-period";

const originalFiling = (): ImmutablePresentedFiling => ({
  filingId: "f-orig-303",
  model: "303",
  year: 2026,
  quarter: 1,
  periodKey: "303:2026:1",
  declarationHash: "decl-hash-original",
  sourceHash: "source-hash-v1",
  result: 1000,
  boxes: [
    { code: "71", value: 1000 },
    { code: "27", value: 2100 },
  ],
  filedAt: "2026-04-15T10:00:00.000Z",
  receiptId: "CSV-ORIG",
  nrc: "NRC-ORIG",
});

describe("Fase 3 — Enmiendas / rectificativas", () => {
  it("filing original inmutable tras prepare + file", () => {
    const original = originalFiling();
    const before = structuredClone(original);
    const prepared = prepareAmendment({
      original,
      amendmentId: "amd-1",
      amendmentDeclarationHash: "decl-hash-amend",
      amendmentSourceHash: "source-hash-v2",
      result: 1200,
      boxes: [{ code: "71", value: 1200 }],
      reason: "Factura añadida tras presentar",
    });
    const { original: afterFile, amendment } = fileAmendment({
      amendment: prepared,
      original,
      filedAt: "2026-05-01T12:00:00.000Z",
      receiptId: "CSV-AMD",
    });
    assert.equal(assertOriginalImmutable(before, afterFile), true);
    assert.equal(afterFile.declarationHash, "decl-hash-original");
    assert.equal(afterFile.receiptId, "CSV-ORIG");
    assert.equal(amendment.status, "AMENDMENT_FILED");
    assert.equal(amendment.originalFilingId, original.filingId);
    assert.notEqual(
      amendment.amendmentDeclarationHash,
      original.declarationHash
    );
  });

  it("drift detectado → AMENDMENT_REQUIRED", () => {
    const original = originalFiling();
    const need = detectAmendmentRequired({
      original,
      currentSourceHash: "source-hash-CHANGED",
      currentResult: 1500,
    });
    assert.equal(need.required, true);
    const chain = reconcileAmendmentChain({
      original,
      amendments: [],
      currentSourceHash: "source-hash-CHANGED",
    });
    assert.equal(chain.status, "AMENDMENT_REQUIRED");
  });

  it("amendment generado desde books actuales referencia original", () => {
    const original = originalFiling();
    const amd = prepareAmendment({
      original,
      kind: "RECTIFICATIVA",
      amendmentId: "amd-2",
      amendmentDeclarationHash: "hash-new",
      amendmentSourceHash: "books-now",
      result: 1100,
      boxes: [{ code: "71", value: 1100 }],
      reason: "Corrección por drift",
    });
    assert.equal(amd.status, "AMENDMENT_PREPARED");
    assert.equal(amd.originalDeclarationHash, original.declarationHash);
    assert.equal(amd.originalPeriodKey, original.periodKey);
    assert.equal(amd.kind, "RECTIFICATIVA");
  });

  it("amendment filed + reconcile → RECONCILED; periodo resuelto", () => {
    const original = originalFiling();
    const prepared = prepareAmendment({
      original,
      amendmentId: "amd-3",
      amendmentDeclarationHash: "h-amd",
      amendmentSourceHash: "source-hash-v2",
      result: 1300,
      boxes: [{ code: "71", value: 1300 }],
      reason: "drift",
    });
    const { amendment } = fileAmendment({
      amendment: prepared,
      original,
      filedAt: "2026-05-10T00:00:00.000Z",
    });
    const chain = reconcileAmendmentChain({
      original,
      amendments: [amendment],
      currentSourceHash: "source-hash-v2",
    });
    assert.equal(chain.status, "RECONCILED");
    assert.equal(chain.originalIntact, true);
    assert.equal(chain.original.declarationHash, original.declarationHash);
  });
});

describe("Fase 3 — Presentación fuera de plazo", () => {
  it("dueDate < today + no filing → OVERDUE", () => {
    const due = resolveObligationDueDate({
      model: "303",
      year: 2025,
      quarter: 1,
    });
    assert.ok(due.dueDate);
    const st = resolveFilingStatus({
      obligationStatus: "REQUIRED",
      filed: false,
      filingId: null,
      dueDate: due.dueDate,
      dueDateReliable: true,
      now: new Date("2026-09-01"),
    });
    assert.equal(st, "OVERDUE");
  });

  it("overdue + prepare → permitido", () => {
    assert.equal(canPrepareWhileOverdue("OVERDUE"), true);
  });

  it("overdue + filed → FILED_LATE; evidencia histórica", () => {
    const due = new Date("2026-04-20T23:59:59");
    const filedAt = new Date("2026-05-10T12:00:00");
    const st = resolveFilingStatus({
      obligationStatus: "REQUIRED",
      filed: true,
      filingId: "f1",
      dueDate: due,
      dueDateReliable: true,
      now: new Date("2026-09-01"),
      filedAt,
    });
    assert.equal(st, "FILED_LATE");
    const ev = buildLateFilingEvidence({
      model: "303",
      year: 2026,
      quarter: 1,
      dueDate: due,
      filedAt,
    });
    assert.ok(ev);
    assert.equal(ev!.wasLate, true);
    assert.equal(ev!.filingStatus, "FILED_LATE");
  });

  it("FILED_LATE no aparece pendiente; CLOSED permitido", () => {
    const life = resolveCloseLifecycle({
      readinessStatus: "READY",
      quarterObligations: [
        makeObligation({
          model: "130",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED_LATE",
          filingId: "a",
        }),
        makeObligation({
          model: "303",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          filingId: "b",
        }),
        makeObligation({
          model: "111",
          quarter: 1,
          obligationStatus: "NOT_APPLICABLE",
        }),
        makeObligation({
          model: "115",
          quarter: 1,
          obligationStatus: "NOT_APPLICABLE",
        }),
        makeObligation({
          model: "349",
          quarter: 1,
          obligationStatus: "NOT_APPLICABLE",
        }),
      ],
    });
    assert.equal(life.status, "CLOSED");
    assert.equal(life.closed, true);
  });
});

describe("Fase 3 — Calendario completo multi-año", () => {
  it("incluye 111/115/180/190/130/303/349/347/390", () => {
    const cal = buildFiscalCalendarForYear({
      year: 2027,
      now: new Date("2027-06-01"),
    });
    const models = new Set(cal.map((e) => e.model));
    for (const m of [
      "130",
      "303",
      "349",
      "111",
      "115",
      "180",
      "190",
      "347",
      "390",
    ]) {
      assert.ok(models.has(m as never), m);
    }
    assert.equal(cal.filter((e) => e.model === "130").length, 4);
    assert.equal(cal.filter((e) => e.model === "180").length, 1);
  });

  it("plazos multi-año no hardcodean 2026", () => {
    const d2025 = guideDueDate("303", 2025, 2);
    const d2028 = guideDueDate("303", 2028, 2);
    assert.ok(d2025);
    assert.ok(d2028);
    assert.equal(d2025!.getFullYear(), 2025);
    assert.equal(d2028!.getFullYear(), 2028);
    const a180 = guideDueDate("180", 2024, null);
    assert.ok(a180);
    assert.ok(a180!.getFullYear() >= 2025);
  });

  it("buildUpcomingDeadlines incluye 111/115 cuando toca", () => {
    const list = buildUpcomingDeadlines(new Date("2026-04-10"));
    const models = new Set(list.map((d) => d.model));
    assert.ok(models.has("303"));
    assert.ok(models.has("130"));
    assert.ok(models.has("111"));
    assert.ok(models.has("115"));
  });
});

describe("Fase 3 — Anuales ↔ trimestres", () => {
  it("115 REQUIRED + 180 NOT_APPLICABLE → contradicción bloqueante", () => {
    const issues = detectAnnualQuarterContradictions({
      year: 2026,
      quarters: [
        {
          model: "115",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          hasOps: true,
        },
      ],
      annuals: [
        {
          model: "180",
          obligationStatus: "NOT_APPLICABLE",
          filingStatus: "NOT_APPLICABLE",
        },
      ],
    });
    assert.ok(
      issues.some((i) => i.code === "ANNUAL_QUARTER_CONTRADICTION_180_115")
    );
    assert.ok(issues[0]!.blocksFiling);
  });

  it("111 ops + 190 NOT_APPLICABLE → contradicción", () => {
    const issues = detectAnnualQuarterContradictions({
      year: 2026,
      quarters: [
        {
          model: "111",
          quarter: 2,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          hasOps: true,
        },
      ],
      annuals: [
        {
          model: "190",
          obligationStatus: "NOT_APPLICABLE",
          filingStatus: "NOT_APPLICABLE",
        },
      ],
    });
    assert.ok(
      issues.some((i) => i.code === "ANNUAL_QUARTER_CONTRADICTION_190_111")
    );
  });

  it("303 filed + 390 NOT_APPLICABLE → contradicción", () => {
    const issues = detectAnnualQuarterContradictions({
      year: 2026,
      quarters: [
        {
          model: "303",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
        },
      ],
      annuals: [
        {
          model: "390",
          obligationStatus: "NOT_APPLICABLE",
          filingStatus: "NOT_APPLICABLE",
        },
      ],
    });
    assert.ok(
      issues.some((i) => i.code === "ANNUAL_QUARTER_CONTRADICTION_390_303")
    );
  });

  it("anual UNKNOWN → fiscalYearComplete false", () => {
    const ov = buildFiscalYearOverview({
      year: 2026,
      quarters: [1, 2, 3, 4].flatMap((q) => [
        {
          model: "130" as const,
          quarter: q as 1 | 2 | 3 | 4,
          obligationStatus: "REQUIRED" as const,
          filingStatus: "FILED" as const,
        },
        {
          model: "303" as const,
          quarter: q as 1 | 2 | 3 | 4,
          obligationStatus: "REQUIRED" as const,
          filingStatus: "FILED" as const,
        },
      ]),
      annuals: [
        {
          model: "390",
          obligationStatus: "UNKNOWN",
          filingStatus: "REQUIRES_REVIEW",
        },
      ],
    });
    assert.equal(ov.fiscalYearComplete, false);
  });

  it("todos trimestrales + anuales filed → fiscalYearComplete true", () => {
    const ov = buildFiscalYearOverview({
      year: 2026,
      quarters: [1, 2, 3, 4].flatMap((q) =>
        (["130", "303", "111", "115", "349"] as const).map((model) => ({
          model,
          quarter: q as 1 | 2 | 3 | 4,
          obligationStatus:
            model === "111" || model === "115" || model === "349"
              ? ("NOT_APPLICABLE" as const)
              : ("REQUIRED" as const),
          filingStatus:
            model === "111" || model === "115" || model === "349"
              ? ("NOT_APPLICABLE" as const)
              : ("FILED" as const),
        }))
      ),
      annuals: [
        {
          model: "180",
          obligationStatus: "NOT_APPLICABLE",
          filingStatus: "NOT_APPLICABLE",
        },
        {
          model: "190",
          obligationStatus: "NOT_APPLICABLE",
          filingStatus: "NOT_APPLICABLE",
        },
        {
          model: "347",
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
        },
        {
          model: "390",
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
        },
      ],
    });
    assert.equal(ov.closedQuarters.length, 4);
    assert.equal(ov.fiscalYearComplete, true);
  });
});

describe("Fase 3 — Unsupported + professional review", () => {
  it("empleados → UNSUPPORTED + NEEDS_PROFESSIONAL", () => {
    const c = employmentUnsupportedCase();
    assert.equal(c.blocksFiling, true);
    assert.equal(c.code, "UNSUPPORTED_190_EMPLOYMENT");
    const mapped = mapWarningToUnsupportedCase({
      warningCode: "MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED",
      model: "190",
      message: "empleados",
    });
    assert.ok(mapped);
    assert.equal(mapped!.kind, "UNSUPPORTED");
  });

  it("347 RECC incompleto → unsupported case", () => {
    const cases = assess347UnsupportedSignals({
      hasIncompleteRecc: true,
      hasCashPaymentHintsWithoutLedger: false,
      hasRentalAnnexRequired: false,
      hasOperatorWithoutTaxId: false,
    });
    assert.ok(cases.some((c) => c.code === "UNSUPPORTED_347_CASE"));
    assert.equal(cases[0]!.blocksFiling, true);
  });

  it("390 COMPLETE vs UNSUPPORTED", () => {
    const ok = assess390SupportLevel({
      hasRecc: false,
      hasProrrataSignal: false,
      hasIncompleteImport: false,
      quarters303Complete: true,
    });
    assert.equal(ok.level, "COMPLETE_FOR_CURRENT_CASE");
    const bad = assess390SupportLevel({
      hasRecc: true,
      hasProrrataSignal: true,
      hasIncompleteImport: false,
      quarters303Complete: true,
    });
    assert.equal(bad.level, "UNSUPPORTED_CASE");
    assert.ok(bad.cases.some((c) => c.code === "UNSUPPORTED_RECC"));
  });

  it("NEEDS_PROFESSIONAL_REVIEW distinto de DATA_ERROR", () => {
    const c = createUnsupportedFiscalCase({
      code: "NEEDS_PROFESSIONAL_REVIEW",
      kind: "PROFESSIONAL_REVIEW",
      model: "390",
      title: "Prorrata",
      description: "Requiere asesor",
    });
    assert.equal(c.kind, "PROFESSIONAL_REVIEW");
    assert.equal(c.blocksFiling, true);
    assert.ok(c.recommendation.includes("profesional"));
  });
});

describe("Fase 3 — Independence checklist + invariantes", () => {
  it("A) caso soportado + datos completos → puede avanzar", () => {
    const period = buildIndependencePeriodChecklist({
      year: 2026,
      quarter: 2,
      obligations: [
        {
          model: "130",
          periodLabel: "2T 2026",
          obligationStatus: "REQUIRED",
          filingStatus: "UPCOMING",
          overdue: false,
          filedLate: false,
        },
        {
          model: "303",
          periodLabel: "2T 2026",
          obligationStatus: "REQUIRED",
          filingStatus: "UPCOMING",
          overdue: false,
          filedLate: false,
        },
      ],
      blockers: [],
      warnings: [],
      readinessOk: true,
    });
    assert.equal(period.CAN_FILE_PERIOD, true);
  });

  it("B) caso no soportado → blocker profesional", () => {
    const period = buildIndependencePeriodChecklist({
      year: 2026,
      quarter: 2,
      obligations: [
        {
          model: "190",
          periodLabel: "Año 2026",
          obligationStatus: "REQUIRED",
          filingStatus: "UPCOMING",
          overdue: false,
          filedLate: false,
        },
      ],
      blockers: [
        {
          code: "UNSUPPORTED_FISCAL_CASE",
          title: "empleados",
          model: "190",
          blocksFiling: true,
        },
      ],
      warnings: [],
      readinessOk: true,
    });
    assert.equal(period.CAN_FILE_PERIOD, false);
    assert.equal(period.PROFESSIONAL_REVIEW_REQUIRED, true);
  });

  it("C–E) fiscal year complete flags", () => {
    const incomplete = buildFiscalYearOverview({
      year: 2026,
      quarters: [],
      annuals: [
        {
          model: "390",
          obligationStatus: "REQUIRED",
          filingStatus: "DUE",
        },
      ],
    });
    assert.equal(incomplete.fiscalYearComplete, false);
    const yearCheck = buildIndependenceYearChecklist(incomplete);
    assert.equal(yearCheck.FISCAL_YEAR_COMPLETE, false);
  });

  it("F–G) filing + drift → amendment; filed + reconcile → resuelto", () => {
    const original = originalFiling();
    assert.equal(
      detectAmendmentRequired({
        original,
        currentSourceHash: "drift",
      }).required,
      true
    );
    const prepared = prepareAmendment({
      original,
      amendmentId: "x",
      amendmentDeclarationHash: "h2",
      amendmentSourceHash: "drift",
      result: 1,
      boxes: [],
      reason: "drift",
    });
    const { amendment } = fileAmendment({
      amendment: prepared,
      original,
      filedAt: "2026-06-01T00:00:00.000Z",
    });
    assert.equal(
      reconcileAmendmentChain({
        original,
        amendments: [amendment],
        currentSourceHash: "drift",
      }).status,
      "RECONCILED"
    );
  });

  it("H) overdue filed → no pendiente, late histórico", () => {
    const st = resolveFilingStatus({
      obligationStatus: "REQUIRED",
      filed: true,
      filingId: "f",
      dueDate: new Date("2026-01-20"),
      dueDateReliable: true,
      now: new Date("2026-09-01"),
      filedAt: new Date("2026-02-01"),
    });
    assert.equal(st, "FILED_LATE");
    assert.notEqual(st, "OVERDUE");
  });

  it("I) modelo anual contradice trimestres → blocker", () => {
    const issues = detectAnnualQuarterContradictions({
      year: 2026,
      quarters: [
        {
          model: "115",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
          hasOps: true,
        },
      ],
      annuals: [
        {
          model: "180",
          obligationStatus: "NOT_APPLICABLE",
          filingStatus: "NOT_APPLICABLE",
        },
      ],
    });
    assert.ok(issues.every((i) => i.blocksFiling));
  });

  it("dashboard DTO agrega periodo + año + calendario", () => {
    const ov = buildFiscalYearOverview({
      year: 2026,
      quarters: [
        {
          model: "130",
          quarter: 1,
          obligationStatus: "REQUIRED",
          filingStatus: "FILED",
        },
      ],
      annuals: [
        {
          model: "390",
          obligationStatus: "REQUIRED",
          filingStatus: "DUE",
        },
      ],
      unsupported: [employmentUnsupportedCase()],
    });
    const dash = buildIndependenceDashboard({
      period: buildIndependencePeriodChecklist({
        year: 2026,
        quarter: 1,
        obligations: [],
        blockers: [],
        warnings: [],
        readinessOk: true,
      }),
      year: buildIndependenceYearChecklist(ov),
      calendar: buildFiscalCalendarForYear({
        year: 2026,
        now: new Date("2026-04-01"),
      }),
    });
    assert.equal(dash.year.PROFESSIONAL_REVIEW_REQUIRED, true);
    assert.ok(dash.calendar.length > 10);
  });
});
