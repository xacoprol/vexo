import { loadFiscalHealthContext } from "@/lib/fiscal-health/context";
import { runFiscalHealthChecks } from "@/lib/fiscal-health/checks";
import {
  resolveHealthStatus,
  sortIssues,
  statusLabel,
} from "@/lib/fiscal-health/issue";
import type {
  BuildFiscalHealthCheckInput,
  FiscalFilingGateResult,
  FiscalHealthResult,
  FiscalHealthSummary,
} from "@/lib/fiscal-health/types";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";

function buildSummary(
  issues: ReturnType<typeof runFiscalHealthChecks>["issues"],
  checks: ReturnType<typeof runFiscalHealthChecks>["checks"]
): FiscalHealthSummary {
  return {
    totalIssues: issues.length,
    critical: issues.filter((i) => i.severity === "CRITICAL").length,
    errors: issues.filter((i) => i.severity === "ERROR").length,
    warnings: issues.filter((i) => i.severity === "WARNING").length,
    info: issues.filter((i) => i.severity === "INFO").length,
    passedChecks: checks.filter((c) => c.passed).length,
    failedChecks: checks.filter((c) => !c.passed).length,
  };
}

export async function buildFiscalHealthCheck(
  input: BuildFiscalHealthCheckInput
): Promise<FiscalHealthResult> {
  const ctx = await loadFiscalHealthContext(input);
  const { issues: rawIssues, checks, modelStatuses } = runFiscalHealthChecks(ctx);
  const issues = sortIssues(rawIssues);
  const { status, blockers } = resolveHealthStatus(issues);

  return {
    checkedAt: new Date(),
    year: ctx.year,
    quarter: ctx.quarter,
    mode: ctx.mode,
    status,
    statusLabel: statusLabel(status),
    blockers: sortIssues(blockers),
    issues,
    checks,
    summary: buildSummary(issues, checks),
    modelStatuses,
    queryCount: ctx.queryCount,
  };
}

function issueAffectsModel(
  issue: { model?: string; relatedModels?: string[]; code?: string },
  modelType: FiscalModelType
): boolean {
  if (issue.model === modelType) return true;
  if (issue.relatedModels?.includes(modelType)) return true;
  // HEALTH genérico: solo incompleción de datos del emisor afecta a todos
  if (issue.model === "HEALTH") {
    return (
      issue.code === "FISCAL_DATA_INCOMPLETE" ||
      issue.code === "CENSUS_PROFILE_INCOMPLETE"
    );
  }
  if (!issue.model && issue.relatedModels == null) return false;
  return false;
}

export function evaluateFilingGateFromHealth(
  health: Pick<FiscalHealthResult, "status" | "blockers" | "issues">,
  modelType: FiscalModelType
): FiscalFilingGateResult {
  const blockers = health.blockers.filter((i) =>
    issueAffectsModel(i, modelType)
  );

  const incompleteForModel = health.issues.filter(
    (i) =>
      (i.code === "FISCAL_DATA_INCOMPLETE" ||
        i.code === "CENSUS_PROFILE_INCOMPLETE") &&
      issueAffectsModel(i, modelType)
  );

  const warnings = health.issues.filter(
    (i) =>
      !i.blocksFiling &&
      (i.severity === "WARNING" || i.severity === "INFO") &&
      issueAffectsModel(i, modelType)
  );

  // Aislamiento por modelo: blockers + incompleción relevante (no status global)
  const allowed = blockers.length === 0 && incompleteForModel.length === 0;

  return {
    allowed,
    status:
      blockers.length > 0
        ? "NOT_READY"
        : incompleteForModel.length > 0
          ? "INCOMPLETE"
          : health.status,
    blockers,
    warnings,
  };
}

export async function canFileFiscalModel(opts: {
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
}): Promise<FiscalFilingGateResult> {
  const annualModels: FiscalModelType[] = ["347", "390", "180", "190"];
  const health = await buildFiscalHealthCheck(
    annualModels.includes(opts.modelType)
      ? { year: opts.year }
      : {
          year: opts.year,
          quarter: (opts.quarter ?? 1) as 1 | 2 | 3 | 4,
        }
  );

  return evaluateFilingGateFromHealth(health, opts.modelType);
}
