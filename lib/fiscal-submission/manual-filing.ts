/**
 * Registro manual de filing tras presentación en Sede.
 * No marca ACCEPTED automático de AEAT network.
 */

import { parseMoney, moneyStringsEqual } from "@/lib/fiscal-declaration/money";
import type {
  ManualFilingRegistrationInput,
  ManualFilingRegistrationResult,
  ReviewMatchFlag,
} from "@/lib/fiscal-submission/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function compareFiledToDraft(opts: {
  draftResult: string | null;
  draftBoxes: Record<string, string | null>;
  filedResult: string | null;
  filedBoxes: Record<string, string | null>;
}): ReviewMatchFlag {
  if (!moneyStringsEqual(opts.draftResult, opts.filedResult)) {
    return "FILED_DIFFERS_FROM_REVIEW";
  }
  const codes = new Set([
    ...Object.keys(opts.draftBoxes),
    ...Object.keys(opts.filedBoxes),
  ]);
  for (const code of codes) {
    if (
      !moneyStringsEqual(
        opts.draftBoxes[code] ?? null,
        opts.filedBoxes[code] ?? null
      )
    ) {
      return "FILED_DIFFERS_FROM_REVIEW";
    }
  }
  return "FILED_MATCHES_REVIEW";
}

export function buildManualFilingRegistration(
  input: ManualFilingRegistrationInput,
  attemptId: string
): ManualFilingRegistrationResult {
  const filedBoxes = input.filedBoxes ?? input.draft.boxes;
  const flag = compareFiledToDraft({
    draftResult: input.draft.result,
    draftBoxes: input.draft.boxes,
    filedResult: input.filedResult,
    filedBoxes,
  });

  const resultNum = parseMoney(input.filedResult) ?? 0;
  const boxes = Object.entries(filedBoxes)
    .filter(([, v]) => v != null && v !== "")
    .map(([code, value]) => ({
      code,
      label: `Casilla ${code}`,
      value: round2(parseMoney(value) ?? 0),
    }));

  return {
    ok: true,
    filingSource: "MANUAL_AEAT",
    reviewMatchFlag: flag,
    attemptStatus: "ACCEPTED",
    lineage: {
      preFilingReviewId: input.draft.preFilingReviewId,
      declarationHash: input.draft.declarationHash,
      sourceHash: input.draft.sourceHash,
      censusHash: input.draft.censusHash,
      engineVersion: input.draft.engineVersion,
      submissionAttemptId: attemptId,
    },
    filingPayload: {
      modelType: input.draft.model,
      year: input.draft.year,
      quarter: input.draft.quarter,
      result: round2(resultNum),
      boxes,
      filedAt: input.filedAt,
      receiptId: input.receiptId,
      rawExtract: {
        source: "MANUAL_AEAT",
        filingOrigin: "MANUAL_AEAT",
        receiptId: input.receiptId,
        csv: input.csv ?? null,
        nrcRegistered: input.nrc ? "[REDACTED_PRESENT]" : null,
        reviewMatchFlag: flag,
        preFilingReviewId: input.draft.preFilingReviewId,
        declarationHash: input.draft.declarationHash,
        sourceHash: input.draft.sourceHash,
        censusHash: input.draft.censusHash,
        engineVersion: input.draft.engineVersion,
        submissionAttemptId: attemptId,
        // Snapshot congelado NO se sobreescribe; se referencia
        frozenDeclarationResult: input.draft.result,
        frozenBoxes: input.draft.boxes,
      },
    },
  };
}
