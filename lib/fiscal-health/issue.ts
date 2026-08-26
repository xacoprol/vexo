import { createHash } from "node:crypto";
import type {
  FiscalHealthIssue,
  FiscalHealthSeverity,
  FiscalHealthStatus,
} from "@/lib/fiscal-health/types";

export function healthFingerprint(parts: {
  code: string;
  sourceType?: string;
  sourceId?: string;
  year?: number;
  quarter?: number | null;
  model?: string;
}): string {
  const raw = [
    parts.code,
    parts.sourceType ?? "",
    parts.sourceId ?? "",
    parts.year ?? "",
    parts.quarter ?? "",
    parts.model ?? "",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function createHealthIssue(
  opts: Omit<FiscalHealthIssue, "fingerprint"> & { fingerprint?: string }
): FiscalHealthIssue {
  return {
    ...opts,
    fingerprint:
      opts.fingerprint ??
      healthFingerprint({
        code: opts.code,
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
        year: opts.year,
        quarter: opts.quarter,
        model: opts.model,
      }),
  };
}

export function resolveHealthStatus(issues: FiscalHealthIssue[]): {
  status: FiscalHealthStatus;
  blockers: FiscalHealthIssue[];
} {
  const blockers = issues.filter((i) => i.blocksFiling);
  const hasCriticalOrError = issues.some(
    (i) => i.severity === "CRITICAL" || i.severity === "ERROR"
  );
  const hasIncomplete = issues.some((i) => i.code === "FISCAL_DATA_INCOMPLETE");
  const hasWarnings = issues.some((i) => i.severity === "WARNING");

  if (blockers.length > 0 || issues.some((i) => i.severity === "CRITICAL")) {
    return { status: "NOT_READY", blockers };
  }
  if (hasIncomplete) {
    return { status: "INCOMPLETE", blockers };
  }
  if (hasCriticalOrError) {
    return { status: "NOT_READY", blockers: issues.filter((i) => i.severity === "ERROR") };
  }
  if (hasWarnings || issues.some((i) => i.severity === "INFO")) {
    return { status: "READY_WITH_WARNINGS", blockers: [] };
  }
  return { status: "READY", blockers: [] };
}

export function statusLabel(status: FiscalHealthStatus): string {
  switch (status) {
    case "READY":
      return "LISTO";
    case "READY_WITH_WARNINGS":
      return "LISTO CON AVISOS";
    case "NOT_READY":
      return "NO LISTO";
    default:
      return "INCOMPLETO";
  }
}

export function severityRank(s: FiscalHealthSeverity): number {
  switch (s) {
    case "CRITICAL":
      return 0;
    case "ERROR":
      return 1;
    case "WARNING":
      return 2;
    default:
      return 3;
  }
}

export function sortIssues(issues: FiscalHealthIssue[]): FiscalHealthIssue[] {
  return [...issues].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.code.localeCompare(b.code)
  );
}
