/**
 * Pre-filing snapshot + evaluación READY_FOR_SUBMISSION (Fase 14).
 * Distinto de FiscalFiling / FiscalModelSnapshotV1 de presentación.
 */

import { createHash } from "node:crypto";
import {
  FISCAL_ENGINE_VERSION,
  FISCAL_SNAPSHOT_V1,
  type FiscalModelSnapshotV1,
  type FiscalSnapshotSourceIds,
} from "@/lib/fiscal-snapshot/types";
import { computeSourceHash, normalizeSourceIds } from "@/lib/fiscal-snapshot/hash";
import { computeCensusHash } from "@/lib/fiscal-close/census-hash";

export const PRE_FILING_SNAPSHOT_VERSION = 1 as const;

export type FiscalPreFilingSnapshotV1 = {
  version: typeof PRE_FILING_SNAPSHOT_VERSION;
  id: string;
  /** Single-tenant: NIF o "default". */
  tenantKey: string;
  year: number;
  quarter: number;
  period: string;
  models: FiscalModelSnapshotV1[];
  createdAt: string;
  createdBy?: string;
  sourceHash: string;
  censusHash: string;
  engineVersion: string;
  healthStatus: string;
  warnings: string[];
  readyToFile: boolean;
  obligationSummary: {
    model: string;
    obligationStatus: string;
    filingStatus: string;
  }[];
};

export type PreFilingReviewRow = {
  id: string;
  periodKey: string;
  year: number;
  quarter: number;
  payload: unknown;
  sourceHash: string;
  censusHash: string;
  engineVersion: string;
  healthStatus: string;
  readyToFile: boolean;
  createdAt: Date;
  createdBy: string | null;
  supersededAt: Date | null;
};

export type SubmissionGateStatus =
  | "NONE"
  | "READY_FOR_SUBMISSION"
  | "STALE_REVIEW"
  | "ENGINE_CHANGED_REVIEW_REQUIRED";

export type SubmissionGate = {
  status: SubmissionGateStatus;
  readyForSubmission: boolean;
  reviewId: string | null;
  frozenAt: string | null;
  reasons: string[];
  drift: {
    sourceHashChanged: boolean;
    censusHashChanged: boolean;
    engineChanged: boolean;
  };
};

export function periodKeyClose(year: number, quarter: number): string {
  return `${year}:${quarter}`;
}

export function mergePeriodSourceIds(
  models: Pick<FiscalModelSnapshotV1, "sourceIds">[]
): FiscalSnapshotSourceIds {
  const merged: FiscalSnapshotSourceIds = {
    expenses: [],
    invoices: [],
    withholdings: [],
    leases: [],
    marketplace: [],
  };
  for (const m of models) {
    for (const k of Object.keys(merged) as (keyof FiscalSnapshotSourceIds)[]) {
      const arr = m.sourceIds[k] ?? [];
      merged[k] = [...(merged[k] ?? []), ...arr.map(String)];
    }
  }
  return normalizeSourceIds(merged);
}

export function computePeriodSourceHash(
  models: Pick<FiscalModelSnapshotV1, "sourceIds">[]
): string {
  return computeSourceHash(mergePeriodSourceIds(models));
}

export function buildPreFilingSnapshotV1(opts: {
  id: string;
  tenantKey: string;
  year: number;
  quarter: number;
  models: FiscalModelSnapshotV1[];
  censusSettings: Record<string, unknown> | null;
  healthStatus: string;
  warnings: string[];
  readyToFile: boolean;
  obligationSummary: FiscalPreFilingSnapshotV1["obligationSummary"];
  createdBy?: string;
  createdAt?: string;
  engineVersion?: string;
}): FiscalPreFilingSnapshotV1 {
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const engineVersion = opts.engineVersion ?? FISCAL_ENGINE_VERSION;
  return {
    version: PRE_FILING_SNAPSHOT_VERSION,
    id: opts.id,
    tenantKey: opts.tenantKey,
    year: opts.year,
    quarter: opts.quarter,
    period: `${opts.quarter}T${opts.year}`,
    models: opts.models,
    createdAt,
    createdBy: opts.createdBy,
    sourceHash: computePeriodSourceHash(opts.models),
    censusHash: computeCensusHash(opts.censusSettings),
    engineVersion,
    healthStatus: opts.healthStatus,
    warnings: [...opts.warnings].sort(),
    readyToFile: opts.readyToFile,
    obligationSummary: opts.obligationSummary,
  };
}

export function parsePreFilingSnapshot(
  raw: unknown
): FiscalPreFilingSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.sourceHash !== "string" || typeof o.censusHash !== "string") {
    return null;
  }
  return raw as FiscalPreFilingSnapshotV1;
}

/**
 * Evalúa si la revisión congelada sigue vigente frente al cálculo actual.
 */
export function evaluateSubmissionGate(opts: {
  review: PreFilingReviewRow | null;
  currentSourceHash: string;
  currentCensusHash: string;
  currentEngineVersion?: string;
  readyToFile: boolean;
  hasBlockers: boolean;
}): SubmissionGate {
  const engineVersion = opts.currentEngineVersion ?? FISCAL_ENGINE_VERSION;
  if (!opts.review || opts.review.supersededAt) {
    return {
      status: "NONE",
      readyForSubmission: false,
      reviewId: null,
      frozenAt: null,
      reasons: ["Sin revisión pre-presentación vigente."],
      drift: {
        sourceHashChanged: false,
        censusHashChanged: false,
        engineChanged: false,
      },
    };
  }

  const sourceHashChanged =
    opts.review.sourceHash !== opts.currentSourceHash;
  const censusHashChanged =
    opts.review.censusHash !== opts.currentCensusHash;
  const engineChanged = opts.review.engineVersion !== engineVersion;
  const drift = { sourceHashChanged, censusHashChanged, engineChanged };

  if (engineChanged) {
    return {
      status: "ENGINE_CHANGED_REVIEW_REQUIRED",
      readyForSubmission: false,
      reviewId: opts.review.id,
      frozenAt: opts.review.createdAt.toISOString(),
      reasons: [
        "ENGINE_CHANGED_REVIEW_REQUIRED",
        `Congelado ${opts.review.engineVersion} ≠ actual ${engineVersion}`,
      ],
      drift,
    };
  }

  if (sourceHashChanged || censusHashChanged) {
    const reasons = ["STALE_REVIEW"];
    if (sourceHashChanged) reasons.push("CURRENT_BOOK_CHANGED_AFTER_REVIEW");
    if (censusHashChanged) reasons.push("CENSUS_CHANGED_AFTER_REVIEW");
    return {
      status: "STALE_REVIEW",
      readyForSubmission: false,
      reviewId: opts.review.id,
      frozenAt: opts.review.createdAt.toISOString(),
      reasons,
      drift,
    };
  }

  if (!opts.review.readyToFile || !opts.readyToFile || opts.hasBlockers) {
    return {
      status: "STALE_REVIEW",
      readyForSubmission: false,
      reviewId: opts.review.id,
      frozenAt: opts.review.createdAt.toISOString(),
      reasons: [
        "La revisión congelada ya no cumple readyToFile / sin blockers.",
      ],
      drift,
    };
  }

  return {
    status: "READY_FOR_SUBMISSION",
    readyForSubmission: true,
    reviewId: opts.review.id,
    frozenAt: opts.review.createdAt.toISOString(),
    reasons: [],
    drift,
  };
}

/** Fingerprint corto para UI / compare-and-set. */
export function shortHash(hex: string): string {
  return createHash("sha256").update(hex).digest("hex").slice(0, 12);
}

export { FISCAL_ENGINE_VERSION, FISCAL_SNAPSHOT_V1 };
