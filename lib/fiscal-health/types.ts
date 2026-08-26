import type { FiscalQuarter } from "@/lib/fiscal";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";

export type FiscalHealthSeverity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";

export type FiscalHealthStatus =
  | "READY"
  | "READY_WITH_WARNINGS"
  | "NOT_READY"
  | "INCOMPLETE";

export type FiscalHealthSourceType =
  | "invoice"
  | "expense"
  | "marketplace"
  | "filing"
  | "model"
  | "series"
  | "system";

export type FiscalHealthIssue = {
  code: string;
  fingerprint: string;
  severity: FiscalHealthSeverity;
  blocksFiling: boolean;
  title: string;
  description: string;
  model?: FiscalModelType | "HEALTH";
  relatedModels?: FiscalModelType[];
  year?: number;
  quarter?: FiscalQuarter | null;
  sourceType?: FiscalHealthSourceType;
  sourceId?: string;
  href?: string;
  evidence?: Record<string, unknown>;
  originalCode?: string;
  sourceModel?: FiscalModelType | string;
  sourcePeriod?: string;
};

export type FiscalHealthCheck = {
  id: string;
  label: string;
  passed: boolean;
  model?: FiscalModelType | "HEALTH";
  detail?: string;
};

export type FiscalHealthModelStatus = {
  model: FiscalModelType | "390";
  label: string;
  status: FiscalHealthStatus;
  presented: boolean;
  obligation?: "REQUIRED" | "EXEMPT" | "UNKNOWN" | "NOT_APPLICABLE";
};

export type FiscalHealthSummary = {
  totalIssues: number;
  critical: number;
  errors: number;
  warnings: number;
  info: number;
  passedChecks: number;
  failedChecks: number;
};

export type FiscalHealthResult = {
  checkedAt: Date;
  year: number;
  quarter: FiscalQuarter | null;
  mode: "quarter" | "annual";
  status: FiscalHealthStatus;
  statusLabel: string;
  blockers: FiscalHealthIssue[];
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
  summary: FiscalHealthSummary;
  modelStatuses: FiscalHealthModelStatus[];
  /** Aproximación de round-trips Prisma en esta ejecución. */
  queryCount: number;
};

export type FiscalFilingGateResult = {
  allowed: boolean;
  status: FiscalHealthStatus;
  blockers: FiscalHealthIssue[];
  warnings: FiscalHealthIssue[];
};

export type BuildFiscalHealthCheckInput = {
  year: number;
  quarter?: FiscalQuarter;
};
