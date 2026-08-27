import type { FiscalHealthResult } from "@/lib/fiscal-health";
import type {
  FiscalObligationEntry,
  FiscalObligationsResult,
} from "@/lib/fiscal-obligations/types";
import type {
  CloseLifecycleStatus,
  CloseModelCode,
  PeriodReadinessStatus,
  QuarterCloseModelCode,
} from "@/lib/fiscal-validation/types";
import type { SubmissionGate } from "@/lib/fiscal-close/pre-filing";

const QUARTER_MODELS: QuarterCloseModelCode[] = [
  "130",
  "303",
  "111",
  "115",
  "349",
];

/**
 * Readiness del trimestre: apoyado en Fiscal Health + obligaciones.
 * No crea un segundo Health.
 *
 * Contrato Fase 13–14 (Health ↔ close):
 * - NOT_READY / OPEN: hay blocker (blocksFiling), CRITICAL, o Health NOT_READY.
 * - READY_WITH_WARNINGS: sin blockers; warnings no impeditivos.
 * - readyToFile: readiness READY | READY_WITH_WARNINGS.
 * - READY_FOR_SUBMISSION: readyToFile + pre-filing snapshot vigente sin drift.
 * - STALE_REVIEW: existía snapshot pero book/censo/motor cambiaron.
 * - CLOSED: todas las REQUIRED del periodo tienen FiscalFiling (≠ READY_FOR_SUBMISSION).
 * Ausencia de ops ≠ NOT_REQUIRED.
 */
export function resolvePeriodReadiness(opts: {
  health: Pick<FiscalHealthResult, "status" | "blockers" | "issues">;
  obligations: FiscalObligationsResult;
  quarter: number;
}): {
  status: PeriodReadinessStatus;
  blockers: {
    code: string;
    title: string;
    model?: string;
    href?: string | null;
  }[];
  warnings: {
    code: string;
    title: string;
    model?: string;
    href?: string | null;
  }[];
} {
  const blockers = opts.health.blockers.map((b) => ({
    code: b.code,
    title: b.title,
    model: b.model,
    href: b.href ?? null,
  }));

  const warnings = opts.health.issues
    .filter(
      (i) =>
        !i.blocksFiling &&
        (i.severity === "WARNING" || i.severity === "INFO")
    )
    .map((i) => ({
      code: i.code,
      title: i.title,
      model: i.model,
      href: i.href ?? null,
    }));

  const quarterObs = opts.obligations.obligations.filter(
    (o) =>
      QUARTER_MODELS.includes(o.model as QuarterCloseModelCode) &&
      o.period.quarter === opts.quarter
  );

  const hasUnknownRequiredish = quarterObs.some(
    (o) => o.obligationStatus === "UNKNOWN"
  );
  const profileInsufficient =
    opts.obligations.profileCompleteness === "INSUFFICIENT";

  if (blockers.length > 0 || opts.health.status === "NOT_READY") {
    return { status: "NOT_READY", blockers, warnings };
  }

  if (
    opts.health.status === "INCOMPLETE" ||
    profileInsufficient ||
    (hasUnknownRequiredish &&
      quarterObs.some(
        (o) =>
          o.obligationStatus === "UNKNOWN" &&
          o.operationsSignal === "HAS_OPS"
      ))
  ) {
    return { status: "INCOMPLETE", blockers, warnings };
  }

  if (
    warnings.length > 0 ||
    opts.health.status === "READY_WITH_WARNINGS" ||
    hasUnknownRequiredish
  ) {
    return { status: "READY_WITH_WARNINGS", blockers, warnings };
  }

  return { status: "READY", blockers, warnings };
}

/**
 * Lifecycle de cierre trimestral.
 * READY_FOR_SUBMISSION / STALE_REVIEW requieren SubmissionGate opcional.
 * CLOSED ≠ READY_FOR_SUBMISSION.
 */
export function resolveCloseLifecycle(opts: {
  readinessStatus: PeriodReadinessStatus;
  quarterObligations: FiscalObligationEntry[];
  submissionGate?: SubmissionGate | null;
}): {
  status: CloseLifecycleStatus;
  readyToFile: boolean;
  readyForSubmission: boolean;
  closed: boolean;
  requiredModels: CloseModelCode[];
  filedRequiredModels: CloseModelCode[];
  unknownModels: CloseModelCode[];
  reason: string;
  preFiling?: {
    reviewId: string | null;
    frozenAt: string | null;
    status: string;
    drift: SubmissionGate["drift"];
  };
} {
  const required = opts.quarterObligations.filter(
    (o) => o.obligationStatus === "REQUIRED"
  );
  const unknown = opts.quarterObligations.filter(
    (o) => o.obligationStatus === "UNKNOWN"
  );
  const requiredModels = required.map((o) => o.model as CloseModelCode);
  const filedRequiredModels = required
    .filter((o) => o.filingStatus === "FILED")
    .map((o) => o.model as CloseModelCode);
  const unknownModels = unknown.map((o) => o.model as CloseModelCode);

  const readyToFile =
    opts.readinessStatus === "READY" ||
    opts.readinessStatus === "READY_WITH_WARNINGS";

  const gate = opts.submissionGate ?? null;
  const preFiling = gate
    ? {
        reviewId: gate.reviewId,
        frozenAt: gate.frozenAt,
        status: gate.status,
        drift: gate.drift,
      }
    : undefined;

  const closed =
    unknownModels.length === 0 &&
    required.length > 0 &&
    required.every((o) => o.filingStatus === "FILED");

  if (closed) {
    return {
      status: "CLOSED",
      readyToFile: false,
      readyForSubmission: false,
      closed: true,
      requiredModels,
      filedRequiredModels,
      unknownModels,
      reason:
        "Todas las obligaciones REQUIRED del período tienen FiscalFiling presentado.",
      preFiling,
    };
  }

  if (gate?.status === "ENGINE_CHANGED_REVIEW_REQUIRED") {
    return {
      status: "STALE_REVIEW",
      readyToFile,
      readyForSubmission: false,
      closed: false,
      requiredModels,
      filedRequiredModels,
      unknownModels,
      reason:
        "El motor fiscal cambió desde la revisión congelada. Vuelve a confirmar la revisión.",
      preFiling,
    };
  }

  if (gate?.status === "STALE_REVIEW") {
    return {
      status: "STALE_REVIEW",
      readyToFile,
      readyForSubmission: false,
      closed: false,
      requiredModels,
      filedRequiredModels,
      unknownModels,
      reason:
        gate.reasons.join(" ") ||
        "La revisión pre-presentación está obsoleta.",
      preFiling,
    };
  }

  if (gate?.status === "READY_FOR_SUBMISSION" && readyToFile) {
    return {
      status: "READY_FOR_SUBMISSION",
      readyToFile: true,
      readyForSubmission: true,
      closed: false,
      requiredModels,
      filedRequiredModels,
      unknownModels,
      reason:
        "Revisión confirmada y congelada. Lista para presentar (sin envío AEAT automático).",
      preFiling,
    };
  }

  if (unknownModels.length > 0) {
    return {
      status: readyToFile ? "READY_TO_FILE" : "OPEN",
      readyToFile,
      readyForSubmission: false,
      closed: false,
      requiredModels,
      filedRequiredModels,
      unknownModels,
      reason:
        "Hay obligaciones UNKNOWN: el trimestre no puede mostrarse como CLOSED definitivo.",
      preFiling,
    };
  }

  if (readyToFile) {
    return {
      status: "READY_TO_FILE",
      readyToFile: true,
      readyForSubmission: false,
      closed: false,
      requiredModels,
      filedRequiredModels,
      unknownModels,
      reason:
        "Cálculo listo. Confirma la revisión para congelar y pasar a READY_FOR_SUBMISSION.",
      preFiling,
    };
  }

  return {
    status: "OPEN",
    readyToFile: false,
    readyForSubmission: false,
    closed: false,
    requiredModels,
    filedRequiredModels,
    unknownModels,
    reason: "Trimestre no listo para presentar ni cerrado.",
    preFiling,
  };
}

export function modelHref(
  model: string,
  year: number,
  quarter: number
): string {
  if (model === "180" || model === "190" || model === "347" || model === "390") {
    return `/fiscal/${model}?year=${year}`;
  }
  return `/fiscal/${model}?year=${year}&q=${quarter}`;
}
