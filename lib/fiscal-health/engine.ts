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
  issue: { model?: string; relatedModels?: string[] },
  modelType: FiscalModelType
): boolean {
  if (issue.model === modelType || issue.model === "HEALTH") return true;
  if (issue.relatedModels?.includes(modelType)) return true;
  if (!issue.model && issue.relatedModels == null) return true;
  return false;
}

export function evaluateFilingGateFromHealth(
  health: Pick<FiscalHealthResult, "status" | "blockers" | "issues">,
  modelType: FiscalModelType
): FiscalFilingGateResult {
  const blockers = health.blockers.filter((i) =>
    issueAffectsModel(i, modelType)
  );

  const warnings = health.issues.filter(
    (i) =>
      !i.blocksFiling &&
      (i.severity === "WARNING" || i.severity === "INFO") &&
      issueAffectsModel(i, modelType)
  );

  const allowed =
    blockers.length === 0 &&
    health.status !== "NOT_READY" &&
    health.status !== "INCOMPLETE";

  return {
    allowed,
    status: health.status,
    blockers,
    warnings,
  };
}

export async function canFileFiscalModel(opts: {
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
}): Promise<FiscalFilingGateResult> {
  const annualModels: FiscalModelType[] = ["347", "390"];
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
