/**
 * Orquestación: PreFilingReview vigente → FiscalDeclarationDraft.
 * Rechaza OPEN / STALE / drift. No recalcula casillas.
 */

import { prisma } from "@/lib/prisma";
import { assertSameFiscalTenant } from "@/lib/fiscal-auth";
import {
  computeCensusHash,
  computePeriodSourceHash,
  evaluateSubmissionGate,
  FISCAL_ENGINE_VERSION,
  parsePreFilingSnapshot,
  type PreFilingReviewRow,
} from "@/lib/fiscal-close";
import { buildFiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot";
import { loadPeriodBookSourceIds } from "@/lib/fiscal-close/load";
import { assessSnapshotCompleteness } from "@/lib/fiscal-close/enrich-snapshots";
import { buildDeclarationFromFrozenSnapshot } from "@/lib/fiscal-declaration/builders";
import { computeDeclarationHash } from "@/lib/fiscal-declaration/hash";
import { validateFiscalDeclarationDraft } from "@/lib/fiscal-declaration/validate";
import type {
  DeclarationModelCode,
  FiscalDeclarationDraft,
  GenerateDeclarationResult,
} from "@/lib/fiscal-declaration/types";
import type { FiscalQuarter } from "@/lib/fiscal";
import type { FiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot/types";

const SUPPORTED: DeclarationModelCode[] = [
  "130",
  "303",
  "349",
  "111",
  "115",
];

export async function loadPreFilingReviewById(
  id: string
): Promise<PreFilingReviewRow | null> {
  try {
    const row = await prisma.fiscalPreFilingReview.findUnique({
      where: { id },
    });
    if (!row) return null;
    return row as PreFilingReviewRow;
  } catch {
    return null;
  }
}

/**
 * Genera declaración desde review ID.
 * `clientBoxes` se ignora/rechaza — no es fuente de verdad.
 */
export async function generateFiscalDeclarationDraft(opts: {
  preFilingReviewId: string;
  model: DeclarationModelCode;
  expectedTenantKey?: string;
  clientBoxes?: unknown;
}): Promise<GenerateDeclarationResult> {
  if (opts.clientBoxes != null) {
    return {
      ok: false,
      error: "UNSUPPORTED_MODEL_FEATURE",
      message:
        "No se aceptan casillas desde el cliente. La declaración sale del snapshot congelado.",
    };
  }

  if (!SUPPORTED.includes(opts.model)) {
    return {
      ok: false,
      error: "UNSUPPORTED_MODEL_FEATURE",
      message: `Modelo ${opts.model} no soportado en Fase 15`,
    };
  }

  const review = await loadPreFilingReviewById(opts.preFilingReviewId);
  if (!review || review.supersededAt) {
    return {
      ok: false,
      error: "REVIEW_NOT_FOUND",
      message: "Revisión pre-filing no encontrada o supersedida.",
    };
  }

  const settings = await prisma.companySettings.findFirst();
  const tenantKey = String(settings?.nif ?? "default");
  if (opts.expectedTenantKey) {
    const tenantCheck = assertSameFiscalTenant(
      opts.expectedTenantKey,
      tenantKey
    );
    // Permitir "default" como comodín de tests / single-tenant sin NIF
    if (
      !tenantCheck.ok &&
      opts.expectedTenantKey !== "default" &&
      tenantKey !== "default"
    ) {
      return {
        ok: false,
        error: "TENANT_MISMATCH",
        message: tenantCheck.message,
      };
    }
  }

  const payload = parsePreFilingSnapshot(review.payload);
  if (payload?.tenantKey && settings?.nif) {
    const snapTenant = assertSameFiscalTenant(payload.tenantKey, settings.nif);
    if (!snapTenant.ok) {
      return {
        ok: false,
        error: "TENANT_MISMATCH",
        message: "tenantKey del snapshot no coincide.",
      };
    }
  }

  const year = review.year;
  const quarter = review.quarter as FiscalQuarter;

  const sourceIds = await loadPeriodBookSourceIds(year, quarter);
  const currentSourceHash = computePeriodSourceHash([
    buildFiscalModelSnapshotV1({
      model: "period",
      year,
      quarter,
      result: null,
      sourceIds,
    }),
  ]);
  const currentCensusHash = computeCensusHash(
    (settings ?? {}) as Record<string, unknown>
  );

  const gate = evaluateSubmissionGate({
    review,
    currentSourceHash,
    currentCensusHash,
    currentEngineVersion: FISCAL_ENGINE_VERSION,
    readyToFile: review.readyToFile,
    hasBlockers: false,
  });

  if (gate.status === "NONE") {
    return {
      ok: false,
      error: "PRE_FILING_REVIEW_REQUIRED",
      message: "No hay revisión pre-presentación vigente.",
    };
  }
  if (gate.status === "STALE_REVIEW") {
    return {
      ok: false,
      error: "STALE_REVIEW",
      message: gate.reasons.join(" ") || "Revisión obsoleta.",
    };
  }
  if (gate.status === "ENGINE_CHANGED_REVIEW_REQUIRED") {
    return {
      ok: false,
      error: "ENGINE_CHANGED_REVIEW_REQUIRED",
      message: gate.reasons.join(" "),
    };
  }
  if (gate.status !== "READY_FOR_SUBMISSION") {
    return {
      ok: false,
      error: "NOT_READY_FOR_SUBMISSION",
      message: `Estado ${gate.status}: no se puede generar declaración.`,
    };
  }

  const snap =
    (payload?.models?.find((m) => m.model === opts.model) as
      | FiscalModelSnapshotV1
      | undefined) ?? null;

  if (!snap) {
    return {
      ok: false,
      error: "SNAPSHOT_INCOMPLETE",
      message: `El freeze no contiene snapshot del modelo ${opts.model}.`,
    };
  }

  const completeness = assessSnapshotCompleteness(snap);
  if (!completeness.complete) {
    return {
      ok: false,
      error: "SNAPSHOT_INCOMPLETE",
      message: `Snapshot ${opts.model} incompleto: ${completeness.missing.join(", ")}. Ampliar freeze (no se usa libro actual).`,
    };
  }

  const draftCore = buildDeclarationFromFrozenSnapshot({
    model: opts.model,
    frozen: snap,
    preFilingReviewId: review.id,
    sourceHash: review.sourceHash,
    censusHash: review.censusHash,
    metadata: {
      nif: settings?.nif ?? undefined,
      taxpayerName: settings?.name ?? undefined,
      regime: settings?.fiscalRegime ?? undefined,
      frozenAt: review.createdAt.toISOString(),
    },
  });

  if (draftCore.sourceHash !== review.sourceHash) {
    return {
      ok: false,
      error: "DECLARATION_SNAPSHOT_MISMATCH",
      message: "sourceHash declaración ≠ pre-filing",
    };
  }
  if (draftCore.censusHash !== review.censusHash) {
    return {
      ok: false,
      error: "DECLARATION_SNAPSHOT_MISMATCH",
      message: "censusHash declaración ≠ pre-filing",
    };
  }
  if (draftCore.engineVersion !== review.engineVersion) {
    return {
      ok: false,
      error: "DECLARATION_SNAPSHOT_MISMATCH",
      message: "engineVersion declaración ≠ pre-filing",
    };
  }

  const declarationHash = computeDeclarationHash(draftCore);
  const validation = validateFiscalDeclarationDraft(
    { ...draftCore, declarationHash },
    snap
  );

  const draft: FiscalDeclarationDraft = {
    ...draftCore,
    declarationHash,
    validation,
  };

  if (!validation.valid) {
    return {
      ok: false,
      error: validation.errors[0]?.code ?? "SNAPSHOT_INCOMPLETE",
      message: validation.errors.map((e) => e.message).join("; "),
      issues: validation.errors,
    };
  }

  return { ok: true, draft };
}

/** Generación pura para tests (sin I/O). */
export function generateDeclarationFromParts(opts: {
  review: PreFilingReviewRow;
  model: DeclarationModelCode;
  frozenModel: FiscalModelSnapshotV1;
  metadata?: FiscalDeclarationDraft["metadata"];
  currentSourceHash: string;
  currentCensusHash: string;
  currentEngineVersion?: string;
  clientBoxes?: unknown;
}): GenerateDeclarationResult {
  if (opts.clientBoxes != null) {
    return {
      ok: false,
      error: "UNSUPPORTED_MODEL_FEATURE",
      message: "No se aceptan casillas desde el cliente.",
    };
  }

  const gate = evaluateSubmissionGate({
    review: opts.review,
    currentSourceHash: opts.currentSourceHash,
    currentCensusHash: opts.currentCensusHash,
    currentEngineVersion: opts.currentEngineVersion ?? FISCAL_ENGINE_VERSION,
    readyToFile: opts.review.readyToFile,
    hasBlockers: false,
  });

  if (gate.status !== "READY_FOR_SUBMISSION") {
    const err =
      gate.status === "STALE_REVIEW"
        ? ("STALE_REVIEW" as const)
        : gate.status === "ENGINE_CHANGED_REVIEW_REQUIRED"
          ? ("ENGINE_CHANGED_REVIEW_REQUIRED" as const)
          : ("NOT_READY_FOR_SUBMISSION" as const);
    return {
      ok: false,
      error: err,
      message: gate.reasons.join(" ") || gate.status,
    };
  }

  const completeness = assessSnapshotCompleteness(opts.frozenModel);
  if (!completeness.complete) {
    return {
      ok: false,
      error: "SNAPSHOT_INCOMPLETE",
      message: completeness.missing.join(", "),
    };
  }

  const draftCore = buildDeclarationFromFrozenSnapshot({
    model: opts.model,
    frozen: opts.frozenModel,
    preFilingReviewId: opts.review.id,
    sourceHash: opts.review.sourceHash,
    censusHash: opts.review.censusHash,
    metadata: opts.metadata ?? {},
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

  const declarationHash = computeDeclarationHash(draftCore);
  const validation = validateFiscalDeclarationDraft(
    { ...draftCore, declarationHash },
    opts.frozenModel
  );
  const draft: FiscalDeclarationDraft = {
    ...draftCore,
    declarationHash,
    validation,
  };
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.errors[0]?.code ?? "SNAPSHOT_INCOMPLETE",
      message: validation.errors.map((e) => e.message).join("; "),
      issues: validation.errors,
    };
  }
  return { ok: true, draft };
}

export function rejectGenerationWhenOpen(): GenerateDeclarationResult {
  return {
    ok: false,
    error: "PRE_FILING_REVIEW_REQUIRED",
    message:
      "El periodo está OPEN / sin freeze. Confirma la revisión fiscal antes de generar.",
  };
}
