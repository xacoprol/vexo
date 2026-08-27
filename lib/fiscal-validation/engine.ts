import { round2 } from "@/lib/modelo-390/money";
import {
  aggregateReconciliationStatus,
  compareEngineToPresented,
  hasStructuredSnapshot,
} from "@/lib/fiscal-validation/compare";
import {
  modelHref,
  resolveCloseLifecycle,
  resolvePeriodReadiness,
} from "@/lib/fiscal-validation/readiness";
import { loadFiscalPeriodValidationContext } from "@/lib/fiscal-validation/period-context";
import type {
  BuildFiscalPeriodValidationInput,
  FiscalPeriodValidation,
  ModelValidationEntry,
  QuarterCloseModelCode,
} from "@/lib/fiscal-validation/types";
import { evaluateFilingGateFromHealth } from "@/lib/fiscal-health";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";
import type { FiscalObligationEntry } from "@/lib/fiscal-obligations/types";
import { parseFiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot";
import { buildFiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot/build";
import {
  buildFiscalCloseActions,
  computeCensusHash,
  computePeriodSourceHash,
  evaluateSubmissionGate,
  FISCAL_ENGINE_VERSION,
} from "@/lib/fiscal-close";
import {
  buildEuReviewsForPeriod,
  loadLatestPreFilingReview,
  loadPeriodBookSourceIds,
} from "@/lib/fiscal-close/load";
import { prisma } from "@/lib/prisma";

function engineResultForModel(
  model: QuarterCloseModelCode,
  ctx: Awaited<ReturnType<typeof loadFiscalPeriodValidationContext>>
): number | null {
  switch (model) {
    case "130":
      return round2(ctx.summary.modelo130.result);
    case "303":
      return round2(ctx.summary.modelo303.result);
    case "111":
      return round2(ctx.draft111.boxes.box30);
    case "115":
      return round2(ctx.draft115.boxes.box05);
    case "349": {
      if (!ctx.draft349.hasOps) return 0;
      const totals = Object.values(ctx.draft349.totalsByKey ?? {}).reduce(
        (s, v) => s + (Number(v) || 0),
        0
      );
      return round2(totals);
    }
    default:
      return null;
  }
}

function warningsForModel(
  model: QuarterCloseModelCode,
  ctx: Awaited<ReturnType<typeof loadFiscalPeriodValidationContext>>
): ModelValidationEntry["warnings"] {
  const fromHealth = ctx.health.issues
    .filter((i) => i.model === model && !i.blocksFiling)
    .map((i) => ({
      code: i.code,
      message: i.description || i.title,
      href: i.href ?? null,
    }));

  if (model === "130") {
    for (const w of ctx.summary.modelo130.warnings ?? []) {
      fromHealth.push({
        code: w.code,
        message: w.message,
        href: w.sourceId ? `/fiscal/expenses/${w.sourceId}/edit` : null,
      });
    }
  }
  if (model === "303") {
    for (const w of ctx.summary.modelo303.warnings ?? []) {
      fromHealth.push({
        code: w.code,
        message: w.message,
        href: w.sourceId ? `/fiscal/expenses/${w.sourceId}/edit` : null,
      });
    }
  }
  if (model === "111") {
    for (const w of ctx.draft111.warnings) {
      fromHealth.push({
        code: w.code,
        message: w.message,
        href: w.sourceId ? `/fiscal/expenses/${w.sourceId}/edit` : null,
      });
    }
  }
  if (model === "115") {
    for (const w of ctx.draft115.warnings) {
      fromHealth.push({
        code: w.code,
        message: w.message,
        href: w.sourceId ? `/fiscal/expenses/${w.sourceId}/edit` : null,
      });
    }
  }
  return fromHealth;
}

function buildModelEntry(
  model: QuarterCloseModelCode,
  obligation: FiscalObligationEntry | undefined,
  ctx: Awaited<ReturnType<typeof loadFiscalPeriodValidationContext>>
): ModelValidationEntry {
  const presented = ctx.presented[model];
  const engineResult = engineResultForModel(model, ctx);
  const snapshotAvailable = presented
    ? hasStructuredSnapshot(model, presented.rawExtract)
    : false;
  const legacyLimited = Boolean(presented && !snapshotAvailable);

  const explained =
    model === "303"
      ? ctx.explainedRectification303
      : model === "130"
        ? ctx.explainedRectification130
        : false;

  const postFilingRelevant =
    model === "303" || model === "349"
      ? ctx.postFiling.intraExpenseIdsAddedAfter
      : ctx.postFiling.expenseIdsAddedAfter;
  const postFilingDataDetected = postFilingRelevant.length > 0;

  const filedSnap = presented
    ? parseFiscalModelSnapshotV1(presented.rawExtract, model)
    : null;
  const bookChangedAfterFiling = Boolean(
    filedSnap &&
      ctx.postFiling.expenseIdsAddedAfter.length > 0 &&
      snapshotAvailable
  );

  const cmp = compareEngineToPresented({
    model,
    engineResult,
    presented,
    snapshotAvailable,
    explainedRectification: explained,
    legacyLimited,
    postFilingDataDetected,
    postFilingAddedCount: postFilingRelevant.length,
    bookChangedAfterFiling,
  });

  const blockers = ctx.health.blockers
    .filter((b) => b.model === model)
    .map((b) => ({
      code: b.code,
      title: b.title,
      href: b.href ?? null,
    }));

  const gate = evaluateFilingGateFromHealth(
    ctx.health,
    model as FiscalModelType
  );

  const notes: string[] = [];
  if (obligation?.operationsSignal === "ZERO_OPS") {
    notes.push(
      "ZERO_OPS: sin operaciones relevantes este período (no implica NOT_REQUIRED)."
    );
  }
  if (obligation?.obligationStatus === "UNKNOWN") {
    notes.push("obligationStatus=UNKNOWN: no se trata como NOT_REQUIRED.");
  }
  if (postFilingDataDetected) {
    notes.push(
      `POST_FILING_DATA_DETECTED: ${postFilingRelevant.length} gasto(s) del periodo con createdAt ≥ filedAt.`
    );
  }

  const presentedResult = presented ? Number(presented.result) || 0 : null;
  const bookDrift =
    presented && (postFilingDataDetected || bookChangedAfterFiling)
      ? {
          addedCount: postFilingRelevant.length,
          removedCount: 0,
          filedResult: presentedResult,
          currentResult: engineResult,
          delta:
            engineResult != null && presentedResult != null
              ? round2(engineResult - presentedResult)
              : null,
          evidenceCodes: [
            ...(postFilingDataDetected ? ["POST_FILING_DATA_DETECTED"] : []),
            ...(legacyLimited ? ["LEGACY_LIMITED"] : []),
            ...(bookChangedAfterFiling
              ? ["CURRENT_BOOK_CHANGED_AFTER_FILING"]
              : []),
          ],
        }
      : null;

  return {
    model,
    domain: "AEAT",
    obligationStatus: obligation?.obligationStatus ?? "UNKNOWN",
    operationsSignal: obligation?.operationsSignal ?? "UNKNOWN",
    filingStatus: obligation?.filingStatus ?? "REQUIRES_REVIEW",
    dueDate: obligation?.dueDate ?? null,
    dueDateReliable: obligation?.dueDateReliable ?? false,
    engineResult,
    presentedResult,
    difference: cmp.difference,
    differenceKind: cmp.differenceKind,
    reconciliationStatus: cmp.reconciliationStatus,
    snapshotAvailable,
    presentedAt: null,
    filingId: obligation?.filingId ?? null,
    warnings: [...warningsForModel(model, ctx)],
    blockers,
    readyToFile: gate.allowed && obligation?.obligationStatus === "REQUIRED",
    href: modelHref(model, ctx.year, ctx.quarter),
    notes,
    bookDrift,
  };
}

/**
 * API principal Fase 10 — validación / cierre de trimestre.
 * No implementa fórmulas fiscales nuevas.
 */
export async function buildFiscalPeriodValidation(
  input: BuildFiscalPeriodValidationInput
): Promise<FiscalPeriodValidation> {
  const ctx = await loadFiscalPeriodValidationContext(
    input.year,
    input.quarter
  );

  const quarterObs = ctx.obligations.obligations.filter(
    (o) =>
      o.period.quarter === input.quarter &&
      ["130", "303", "111", "115", "349"].includes(o.model)
  );

  const models: ModelValidationEntry[] = (
    ["130", "303", "111", "115", "349"] as QuarterCloseModelCode[]
  ).map((model) => {
    const ob = quarterObs.find((o) => o.model === model);
    return buildModelEntry(model, ob, ctx);
  });

  // Solo mostrar en UI los que tienen interés: REQUIRED, UNKNOWN, HAS_OPS, FILED
  // Pero la API completa incluye todos; la UI filtrará.

  const reconIssues = models.flatMap((m) => {
    const postFilingRelevant =
      m.model === "303" || m.model === "349"
        ? ctx.postFiling.intraExpenseIdsAddedAfter
        : ctx.postFiling.expenseIdsAddedAfter;
    const cmp = compareEngineToPresented({
      model: m.model,
      engineResult: m.engineResult,
      presented: ctx.presented[m.model as QuarterCloseModelCode],
      snapshotAvailable: m.snapshotAvailable,
      explainedRectification:
        m.differenceKind === "explained_rectification",
      legacyLimited: m.differenceKind === "legacy_limited",
      postFilingDataDetected: postFilingRelevant.length > 0,
      postFilingAddedCount: postFilingRelevant.length,
      bookChangedAfterFiling:
        m.differenceKind === "post_presentation_change",
    });
    return cmp.issues;
  });

  const reconciliation = {
    status: aggregateReconciliationStatus(
      models.map((m) => m.reconciliationStatus)
    ),
    issues: reconIssues,
  };

  const readiness = resolvePeriodReadiness({
    health: ctx.health,
    obligations: ctx.obligations,
    quarter: input.quarter,
  });

  const [review, sourceIds, settings, euReviews] = await Promise.all([
    loadLatestPreFilingReview(input.year, input.quarter),
    loadPeriodBookSourceIds(input.year, input.quarter),
    prisma.companySettings.findFirst(),
    buildEuReviewsForPeriod(input.year, input.quarter),
  ]);

  const periodSnap = buildFiscalModelSnapshotV1({
    model: "period",
    year: input.year,
    quarter: input.quarter,
    result: null,
    sourceIds,
  });
  const currentSourceHash = computePeriodSourceHash([periodSnap]);
  const currentCensusHash = computeCensusHash(
    (settings ?? {}) as Record<string, unknown>
  );
  const submissionGate = evaluateSubmissionGate({
    review,
    currentSourceHash,
    currentCensusHash,
    currentEngineVersion: FISCAL_ENGINE_VERSION,
    readyToFile:
      readiness.status === "READY" ||
      readiness.status === "READY_WITH_WARNINGS",
    hasBlockers: ctx.health.blockers.length > 0,
  });

  const lifecycle = resolveCloseLifecycle({
    readinessStatus: readiness.status,
    quarterObligations: quarterObs,
    submissionGate,
  });

  const closeActions = buildFiscalCloseActions(ctx.health.issues);

  return {
    period: {
      year: input.year,
      quarter: input.quarter,
      label: `${input.quarter}T ${input.year}`,
    },
    health: {
      status: ctx.health.status,
      statusLabel: ctx.health.statusLabel,
      summary: ctx.health.summary,
      blockers: ctx.health.blockers,
      issues: ctx.health.issues,
      checks: ctx.health.checks,
      queryCount: ctx.health.queryCount,
    },
    obligations: ctx.obligations,
    models,
    reconciliation,
    readiness,
    lifecycle,
    closeActions,
    euReviews,
    performance: {
      queryCountApprox: ctx.health.queryCount,
      note:
        "Orquestación en Promise.all de Health + Obligations + PeriodSummary + 111/115/349 + presented. " +
        "Health y summary aún solapan lecturas internas (mejora futura: contexto compartido único). " +
        "queryCount≈ contador Health (no Prisma raw).",
    },
  };
}

/**
 * Construcción pura para tests (sin I/O).
 */
export function buildFiscalPeriodValidationFromParts(opts: {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  health: FiscalPeriodValidation["health"] & {
    status: FiscalPeriodValidation["health"]["status"];
  };
  obligations: FiscalPeriodValidation["obligations"];
  models: ModelValidationEntry[];
}): FiscalPeriodValidation {
  const readiness = resolvePeriodReadiness({
    health: {
      status: opts.health.status,
      blockers: opts.health.blockers,
      issues: opts.health.issues,
    },
    obligations: opts.obligations,
    quarter: opts.quarter,
  });
  const quarterObs = opts.obligations.obligations.filter(
    (o) => o.period.quarter === opts.quarter
  );
  const lifecycle = resolveCloseLifecycle({
    readinessStatus: readiness.status,
    quarterObligations: quarterObs,
  });
  return {
    period: {
      year: opts.year,
      quarter: opts.quarter,
      label: `${opts.quarter}T ${opts.year}`,
    },
    health: opts.health,
    obligations: opts.obligations,
    models: opts.models,
    reconciliation: {
      status: aggregateReconciliationStatus(
        opts.models.map((m) => m.reconciliationStatus)
      ),
      issues: [],
    },
    readiness,
    lifecycle,
    closeActions: buildFiscalCloseActions(opts.health.issues ?? []),
    performance: {
      queryCountApprox: opts.health.queryCount ?? 0,
      note: "from-parts (test)",
    },
  };
}
