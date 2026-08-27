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
  /** ERROR que no bloquea presentación → no fuerza NOT_READY (avisos). */
  const blockingErrors = issues.filter(
    (i) =>
      i.severity === "ERROR" &&
      (i.blocksFiling ||
        i.code.includes("MISSING") ||
        i.code.includes("INCOMPLETE") ||
        i.code.startsWith("MODEL303_") ||
        i.code.includes("DOUBLE_COUNT") ||
        i.code.includes("EU_OPERATION_MISSING"))
  );
  const hasCritical = issues.some((i) => i.severity === "CRITICAL");
  const hasIncomplete = issues.some((i) => i.code === "FISCAL_DATA_INCOMPLETE");
  const hasWarnings = issues.some(
    (i) =>
      i.severity === "WARNING" ||
      i.severity === "INFO" ||
      (i.severity === "ERROR" && !blockingErrors.includes(i) && !i.blocksFiling)
  );

  if (blockers.length > 0 || hasCritical) {
    return { status: "NOT_READY", blockers };
  }
  if (hasIncomplete) {
    return { status: "INCOMPLETE", blockers };
  }
  if (blockingErrors.length > 0) {
    return { status: "NOT_READY", blockers: blockingErrors };
  }
  if (hasWarnings) {
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
