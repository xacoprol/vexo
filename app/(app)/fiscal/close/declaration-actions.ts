/**
 * Generación / export de declaración VEXO desde freeze (Fase 15).
 * No presenta AEAT.
 */

"use server";

import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  generateFiscalDeclarationDraft,
  toCanonicalVexoExport,
  rejectGenerationWhenOpen,
  type DeclarationModelCode,
} from "@/lib/fiscal-declaration";
import { buildFiscalPeriodValidation } from "@/lib/fiscal-validation";
import type { FiscalQuarter } from "@/lib/fiscal";

export async function generateDeclarationAction(input: {
  preFilingReviewId: string;
  model: DeclarationModelCode;
  /** Si se envía, se rechaza (no es fuente de verdad). */
  boxes?: unknown;
}) {
  await requireAuth();
  const settings = await prisma.companySettings.findFirst();
  return generateFiscalDeclarationDraft({
    preFilingReviewId: input.preFilingReviewId,
    model: input.model,
    expectedTenantKey: settings?.nif ?? "default",
    clientBoxes: input.boxes,
  });
}

export async function exportVexoDeclarationAction(input: {
  preFilingReviewId: string;
  model: DeclarationModelCode;
}) {
  await requireAuth();
  const settings = await prisma.companySettings.findFirst();
  const result = await generateFiscalDeclarationDraft({
    preFilingReviewId: input.preFilingReviewId,
    model: input.model,
    expectedTenantKey: settings?.nif ?? "default",
  });
  if (!result.ok) return result;
  return {
    ok: true as const,
    export: toCanonicalVexoExport(result.draft),
    draft: result.draft,
  };
}

/** Rechazo explícito si el periodo no tiene freeze READY_FOR_SUBMISSION. */
export async function tryGenerateForPeriod(input: {
  year: number;
  quarter: FiscalQuarter;
  model: DeclarationModelCode;
}) {
  await requireAuth();
  const validation = await buildFiscalPeriodValidation({
    year: input.year,
    quarter: input.quarter,
  });
  if (
    validation.lifecycle.status !== "READY_FOR_SUBMISSION" ||
    !validation.lifecycle.preFiling?.reviewId
  ) {
    return rejectGenerationWhenOpen();
  }
  return generateDeclarationAction({
    preFilingReviewId: validation.lifecycle.preFiling.reviewId,
    model: input.model,
  });
}
