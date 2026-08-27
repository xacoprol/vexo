/**
 * Presentación asistida + registro manual de justificante (Fase 16).
 * 0 llamadas de red a AEAT.
 */

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  generateFiscalDeclarationDraft,
  type DeclarationModelCode,
} from "@/lib/fiscal-declaration";
import { buildFiscalPeriodValidation } from "@/lib/fiscal-validation";
import {
  assertReadyForAssistedSubmission,
  decideSubmissionIdempotency,
  getSubmissionAdapter,
  prepareAssistedSubmission,
  buildManualFilingRegistration,
  type FiscalSubmissionAttemptRecord,
  type SubmissionAttemptStatus,
} from "@/lib/fiscal-submission";
import { upsertFiscalFiling } from "@/app/(app)/fiscal/filings/actions";
import type { FiscalQuarter } from "@/lib/fiscal";

async function tenantId(): Promise<string> {
  const settings = await prisma.companySettings.findFirst();
  return settings?.nif?.trim() || "default";
}

function rowToRecord(row: {
  id: string;
  tenantId: string;
  model: string;
  year: number;
  quarter: number;
  preFilingReviewId: string;
  declarationHash: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  channel: string;
  requestFingerprint: string | null;
  responseCode: string | null;
  errorCode: string | null;
  receiptId: string | null;
  filingId: string | null;
  paymentRequirement: string | null;
  reviewMatchFlag: string | null;
  safeMessage: string | null;
}): FiscalSubmissionAttemptRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    model: row.model as DeclarationModelCode,
    year: row.year,
    quarter: row.quarter,
    preFilingReviewId: row.preFilingReviewId,
    declarationHash: row.declarationHash,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    status: row.status as SubmissionAttemptStatus,
    channel: row.channel as FiscalSubmissionAttemptRecord["channel"],
    requestFingerprint: row.requestFingerprint,
    responseCode: row.responseCode,
    errorCode: row.errorCode,
    receiptId: row.receiptId,
    filingId: row.filingId,
    paymentRequirement:
      row.paymentRequirement as FiscalSubmissionAttemptRecord["paymentRequirement"],
    reviewMatchFlag:
      row.reviewMatchFlag as FiscalSubmissionAttemptRecord["reviewMatchFlag"],
    safeMessage: row.safeMessage,
  };
}

export async function prepareAssistedSubmissionAction(input: {
  preFilingReviewId: string;
  model: DeclarationModelCode;
  year: number;
  quarter: FiscalQuarter;
}) {
  await requireAuth();
  const tid = await tenantId();

  const validation = await buildFiscalPeriodValidation({
    year: input.year,
    quarter: input.quarter,
  });

  const gen = await generateFiscalDeclarationDraft({
    preFilingReviewId: input.preFilingReviewId,
    model: input.model,
    expectedTenantKey: tid,
  });
  if (!gen.ok) {
    return { ok: false as const, error: gen.error, message: gen.message };
  }

  const reviewRow = await prisma.fiscalPreFilingReview.findUnique({
    where: { id: input.preFilingReviewId },
  });
  if (!reviewRow || reviewRow.supersededAt) {
    return {
      ok: false as const,
      error: "REVIEW_NOT_FOUND",
      message: "Revisión pre-filing no encontrada o superseded.",
    };
  }

  const stale = assertReadyForAssistedSubmission({
    draft: gen.draft,
    current: {
      sourceHash: reviewRow.sourceHash,
      censusHash: reviewRow.censusHash,
      engineVersion: reviewRow.engineVersion,
      lifecycleStatus: validation.lifecycle.status,
    },
  });
  if (!stale.ok) {
    return { ok: false as const, error: stale.code, message: stale.message };
  }

  const existing = await prisma.fiscalSubmissionAttempt.findMany({
    where: {
      tenantId: tid,
      model: input.model,
      year: input.year,
      quarter: input.quarter,
      declarationHash: gen.draft.declarationHash,
    },
    orderBy: { startedAt: "desc" },
  });

  const decision = decideSubmissionIdempotency(existing.map(rowToRecord));
  if (decision.action === "BLOCK" || decision.action === "RECONCILE_REQUIRED") {
    return {
      ok: false as const,
      error: decision.action,
      message: decision.reason,
      attemptId: decision.attemptId,
    };
  }
  if (decision.action === "RETURN_EXISTING") {
    const row = existing.find((e) => e.id === decision.attemptId)!;
    const prepared = prepareAssistedSubmission(gen.draft);
    return {
      ok: true as const,
      reused: true as const,
      attemptId: row.id,
      status: row.status,
      prepared,
      capability: getSubmissionAdapter(input.model).canSubmit(gen.draft),
    };
  }

  const prepared = prepareAssistedSubmission(gen.draft);
  const row = await prisma.fiscalSubmissionAttempt.create({
    data: {
      tenantId: tid,
      model: prepared.model,
      year: prepared.year,
      quarter: prepared.quarter,
      preFilingReviewId: prepared.preFilingReviewId,
      declarationHash: prepared.declarationHash,
      status: prepared.status,
      channel: prepared.channel,
      requestFingerprint: prepared.requestFingerprint,
      paymentRequirement: prepared.payment.status,
      safeMessage:
        "Presentación asistida: abrir Sede AEAT y registrar justificante después.",
    },
  });

  revalidatePath("/fiscal/close");
  return {
    ok: true as const,
    reused: false as const,
    attemptId: row.id,
    status: row.status,
    prepared,
    capability: getSubmissionAdapter(input.model).canSubmit(gen.draft),
  };
}

export async function registerManualAeatFilingAction(input: {
  preFilingReviewId: string;
  model: DeclarationModelCode;
  year: number;
  quarter: FiscalQuarter;
  filedAt: string;
  receiptId: string;
  csv?: string | null;
  filedResult?: string | null;
  /** Si true, usa casillas del draft (MATCH esperado). */
  useFrozenBoxes?: boolean;
  /** Casillas distintas al freeze → FILED_DIFFERS_FROM_REVIEW */
  filedBoxes?: Record<string, string | null>;
  notes?: string | null;
  nrc?: string | null;
  attemptId?: string | null;
}) {
  await requireAuth();
  const tid = await tenantId();

  const gen = await generateFiscalDeclarationDraft({
    preFilingReviewId: input.preFilingReviewId,
    model: input.model,
    expectedTenantKey: tid,
  });
  if (!gen.ok) {
    return { ok: false as const, error: gen.error, message: gen.message };
  }

  const reviewRow = await prisma.fiscalPreFilingReview.findUnique({
    where: { id: input.preFilingReviewId },
  });
  if (!reviewRow || reviewRow.supersededAt) {
    return {
      ok: false as const,
      error: "REVIEW_NOT_FOUND",
      message: "Revisión pre-filing no encontrada o superseded.",
    };
  }

  // Tras presentar, lifecycle puede ya no ser READY_FOR_SUBMISSION;
  // permitir registro si hashes del draft siguen alineados con la review.
  const hashCheck = assertReadyForAssistedSubmission({
    draft: gen.draft,
    current: {
      sourceHash: reviewRow.sourceHash,
      censusHash: reviewRow.censusHash,
      engineVersion: reviewRow.engineVersion,
      lifecycleStatus: "READY_FOR_SUBMISSION",
    },
  });
  if (!hashCheck.ok) {
    return {
      ok: false as const,
      error: hashCheck.code,
      message: hashCheck.message,
    };
  }

  const existing = await prisma.fiscalSubmissionAttempt.findMany({
    where: {
      tenantId: tid,
      model: input.model,
      year: input.year,
      quarter: input.quarter,
      declarationHash: gen.draft.declarationHash,
    },
    orderBy: { startedAt: "desc" },
  });
  const accepted = existing.find((e) => e.status === "ACCEPTED");
  if (accepted) {
    return {
      ok: false as const,
      error: "ALREADY_ACCEPTED",
      message: "Ya existe intento ACCEPTED para esta declaración.",
      attemptId: accepted.id,
      filingId: accepted.filingId,
    };
  }

  let attemptId = input.attemptId ?? null;
  if (attemptId) {
    const owned = existing.find((e) => e.id === attemptId);
    if (!owned) {
      return {
        ok: false as const,
        error: "ATTEMPT_NOT_FOUND",
        message: "Intento no encontrado para esta declaración.",
      };
    }
  } else {
    const open = existing.find(
      (e) =>
        e.status === "USER_ACTION_REQUIRED" ||
        e.status === "PREPARED" ||
        e.status === "PAYMENT_REQUIRED"
    );
    if (open) {
      attemptId = open.id;
    } else {
      const prepared = prepareAssistedSubmission(gen.draft);
      const created = await prisma.fiscalSubmissionAttempt.create({
        data: {
          tenantId: tid,
          model: prepared.model,
          year: prepared.year,
          quarter: prepared.quarter,
          preFilingReviewId: prepared.preFilingReviewId,
          declarationHash: prepared.declarationHash,
          status: "USER_ACTION_REQUIRED",
          channel: "ASSISTED_WEB",
          requestFingerprint: prepared.requestFingerprint,
          paymentRequirement: prepared.payment.status,
          safeMessage: "Registro manual iniciado sin prepare previo.",
        },
      });
      attemptId = created.id;
    }
  }

  const filedResult =
    input.filedResult !== undefined ? input.filedResult : gen.draft.result;
  const filedBoxes =
    input.useFrozenBoxes === false && input.filedBoxes
      ? input.filedBoxes
      : input.filedBoxes ?? gen.draft.boxes;

  const built = buildManualFilingRegistration(
    {
      tenantId: tid,
      draft: gen.draft,
      filedAt: input.filedAt,
      receiptId: input.receiptId.trim(),
      csv: input.csv ?? null,
      filedResult,
      filedBoxes,
      notes: input.notes ?? null,
      nrc: input.nrc ?? null,
    },
    attemptId!
  );

  const up = await upsertFiscalFiling({
    modelType: built.filingPayload.modelType,
    year: built.filingPayload.year,
    quarter: built.filingPayload.quarter,
    filedAt: built.filingPayload.filedAt,
    result: built.filingPayload.result,
    incomeBase: null,
    expensesBase: null,
    vatRepercutida: null,
    vatDeductible: null,
    boxes: built.filingPayload.boxes,
    notes:
      input.notes ??
      `Justificante AEAT ${built.filingPayload.receiptId} · ${built.reviewMatchFlag}`,
    confidence: "high",
    sourceFileName: null,
    rawExtract: built.filingPayload.rawExtract,
  });

  if (!up.ok) {
    return { ok: false as const, error: "FILING_UPSERT_FAILED", message: up.error };
  }

  await prisma.fiscalSubmissionAttempt.update({
    where: { id: attemptId! },
    data: {
      status: "ACCEPTED",
      channel: "MANUAL_AEAT",
      finishedAt: new Date(),
      receiptId: built.filingPayload.receiptId,
      filingId: up.id,
      reviewMatchFlag: built.reviewMatchFlag,
      responseCode: "MANUAL",
      safeMessage:
        built.reviewMatchFlag === "FILED_MATCHES_REVIEW"
          ? "Justificante registrado; coincide con freeze."
          : "Justificante registrado; difiere del freeze (FILED_DIFFERS_FROM_REVIEW).",
    },
  });

  revalidatePath("/fiscal/close");
  revalidatePath("/fiscal/filings");
  revalidatePath("/fiscal");

  return {
    ok: true as const,
    filingId: up.id,
    attemptId: attemptId!,
    reviewMatchFlag: built.reviewMatchFlag,
    lineage: built.lineage,
  };
}

/** Solo lectura de capacidad — sin side effects. */
export async function getAeatCapabilityAction(model: DeclarationModelCode) {
  await requireAuth();
  const { getAeatCapability } = await import("@/lib/fiscal-submission");
  return getAeatCapability(model);
}
