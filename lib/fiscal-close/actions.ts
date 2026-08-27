/**
 * Acciones operativas derivadas de Health (Fase 14).
 * No persisten: se agrupan para UX de cierre.
 */

import type { FiscalHealthIssue } from "@/lib/fiscal-health/types";

export type FiscalCloseActionSeverity = "BLOCKER" | "WARNING" | "INFO";

export type FiscalCloseActionType =
  | "OPEN_FISCAL_SETTINGS"
  | "OPEN_EXPENSE"
  | "OPEN_INVOICE"
  | "OPEN_FILING"
  | "REVIEW_EU_OPERATION"
  | "UPLOAD_DOCUMENT"
  | "MANUAL_REVIEW";

export type FiscalCloseActionGroup =
  | "census"
  | "invoices"
  | "expenses"
  | "eu"
  | "documentation"
  | "verifactu"
  | "other";

export type FiscalCloseAction = {
  id: string;
  code: string;
  severity: FiscalCloseActionSeverity;
  title: string;
  description: string;
  impact: string;
  model?: string;
  entityType?: string;
  entityIds: string[];
  actionType: FiscalCloseActionType;
  href?: string;
  group: FiscalCloseActionGroup;
  blocksReadyToFile: boolean;
  blocksReadyForSubmission: boolean;
  count: number;
};

function severityFromIssue(i: FiscalHealthIssue): FiscalCloseActionSeverity {
  if (i.blocksFiling || i.severity === "CRITICAL") return "BLOCKER";
  if (i.severity === "ERROR") return "BLOCKER";
  if (i.severity === "INFO") return "INFO";
  return "WARNING";
}

function censusHref(model?: string | null): string {
  if (model === "303") return "/settings#census-303";
  if (model === "111") return "/settings#census-111";
  if (model === "115") return "/settings#census-115";
  if (model === "130") return "/settings#census-130";
  if (model === "349") return "/settings#census-349";
  return "/settings#census-pending";
}

function mapIssueToSeed(i: FiscalHealthIssue): {
  groupKey: string;
  actionType: FiscalCloseActionType;
  group: FiscalCloseActionGroup;
  href?: string;
  title: string;
  description: string;
  impact: string;
} {
  const code = i.code;
  const entityId = i.sourceId ?? undefined;

  if (code === "OBLIGATION_UNKNOWN" || code === "CENSUS_PROFILE_INCOMPLETE") {
    return {
      groupKey: `census:${i.model ?? "all"}:${code}`,
      actionType: "OPEN_FISCAL_SETTINGS",
      group: "census",
      href: censusHref(i.model),
      title:
        i.model === "303"
          ? "Completar censo IVA / Modelo 303"
          : i.model
            ? `Completar configuración ${i.model}`
            : "Completar configuración fiscal",
      description: i.description || i.title,
      impact: i.blocksFiling
        ? "Bloquea READY_TO_FILE hasta configurar."
        : "Revisión censal pendiente.",
    };
  }

  if (code === "EU_PURCHASE_NATURE_REVIEW") {
    const evidence =
      i.evidence && typeof i.evidence === "object"
        ? (i.evidence as Record<string, unknown>)
        : {};
    const insufficient = Boolean(evidence.insufficient);
    return {
      groupKey: insufficient
        ? `eu-manual:${entityId ?? "x"}`
        : "eu:nature-review",
      actionType: insufficient ? "MANUAL_REVIEW" : "REVIEW_EU_OPERATION",
      group: "eu",
      href: entityId
        ? `/fiscal/expenses/${entityId}/edit`
        : i.href ?? undefined,
      title: insufficient
        ? "Revisión manual operación UE (datos insuficientes)"
        : "Revisar naturaleza de compras UE",
      description: i.description || i.title,
      impact:
        "Puede mover bases 349 A↔I; casillas 303 AIB suelen permanecer equivalentes.",
    };
  }

  if (
    code === "DOCUMENTATION_INCOMPLETE" ||
    code.includes("IMPORT_DOCUMENT_MISSING") ||
    code.includes("DOCUMENT_MISSING")
  ) {
    return {
      groupKey: `docs:${code}`,
      actionType: entityId ? "UPLOAD_DOCUMENT" : "OPEN_EXPENSE",
      group: "documentation",
      href:
        i.href ??
        (entityId ? `/fiscal/expenses/${entityId}/edit` : "/fiscal/expenses"),
      title: "Completar documentación",
      description: i.description || i.title,
      impact: i.blocksFiling
        ? "Bloquea presentación."
        : "Documentación incompleta.",
    };
  }

  if (
    code.includes("VERIFACTU") ||
    code === "ISSUED_LEGACY_PRE_VERIFACTU_UNSEALED"
  ) {
    return {
      groupKey: `verifactu:${code}`,
      actionType: entityId ? "OPEN_INVOICE" : "MANUAL_REVIEW",
      group: "verifactu",
      href:
        i.href ??
        (entityId ? `/invoices/${entityId}` : "/fiscal/verifactu"),
      title:
        code === "ISSUED_LEGACY_PRE_VERIFACTU_UNSEALED"
          ? "Facturas legacy pre-VeriFactu"
          : "Revisar VeriFactu",
      description: i.description || i.title,
      impact: i.blocksFiling
        ? "Bloquea presentación."
        : "Aviso VeriFactu (no siempre bloqueante).",
    };
  }

  if (code.includes("MARKETPLACE")) {
    return {
      groupKey: `mkt:${code}`,
      actionType: "MANUAL_REVIEW",
      group: "invoices",
      href: i.href ?? "/fiscal",
      title: "Revisar operaciones marketplace",
      description: i.description || i.title,
      impact: "Revisión OSS/marketplace; no bloquea por sí sola.",
    };
  }

  if (i.sourceType === "invoice" && entityId) {
    return {
      groupKey: `inv:${code}`,
      actionType: "OPEN_INVOICE",
      group: "invoices",
      href: i.href ?? `/invoices/${entityId}`,
      title: i.title,
      description: i.description,
      impact: i.blocksFiling ? "Bloquea presentación." : "Revisión de factura.",
    };
  }

  if (i.sourceType === "expense" && entityId) {
    return {
      groupKey: `exp:${code}`,
      actionType: "OPEN_EXPENSE",
      group: "expenses",
      href: i.href ?? `/fiscal/expenses/${entityId}/edit`,
      title: i.title,
      description: i.description,
      impact: i.blocksFiling ? "Bloquea presentación." : "Revisión de gasto.",
    };
  }

  if (i.sourceType === "filing") {
    return {
      groupKey: `filing:${code}:${i.model ?? ""}`,
      actionType: "OPEN_FILING",
      group: "other",
      href: i.href ?? undefined,
      title: i.title,
      description: i.description,
      impact: "Comparación con filing presentado.",
    };
  }

  return {
    groupKey: `other:${code}`,
    actionType: "MANUAL_REVIEW",
    group: "other",
    href: i.href ?? undefined,
    title: i.title,
    description: i.description,
    impact: i.blocksFiling ? "Bloquea presentación." : "Aviso.",
  };
}

/**
 * Agrupa issues técnicos en acciones UX deduplicadas.
 * Conserva entityIds de todos los issues del grupo.
 */
export function buildFiscalCloseActions(
  issues: FiscalHealthIssue[]
): FiscalCloseAction[] {
  const buckets = new Map<
    string,
    {
      seed: ReturnType<typeof mapIssueToSeed>;
      issues: FiscalHealthIssue[];
    }
  >();

  for (const i of issues) {
    const seed = mapIssueToSeed(i);
    const cur = buckets.get(seed.groupKey);
    if (cur) cur.issues.push(i);
    else buckets.set(seed.groupKey, { seed, issues: [i] });
  }

  const out: FiscalCloseAction[] = [];
  for (const [groupKey, { seed, issues: group }] of buckets) {
    const primary = group[0]!;
    const entityIds = [
      ...new Set(
        group.map((g) => g.sourceId).filter((x): x is string => Boolean(x))
      ),
    ];
    const sev = group.some(
      (g) => g.blocksFiling || g.severity === "CRITICAL" || g.severity === "ERROR"
    )
      ? ("BLOCKER" as const)
      : severityFromIssue(primary);
    const blocks = group.some((g) => g.blocksFiling);
    const count = group.length;
    const title =
      count > 1 && !seed.title.includes(`${count}`)
        ? `${seed.title} (${count})`
        : seed.title;

    out.push({
      id: groupKey,
      code: primary.code,
      severity: sev,
      title,
      description: seed.description,
      impact: seed.impact,
      model: primary.model,
      entityType: primary.sourceType,
      entityIds,
      actionType: seed.actionType,
      href:
        count === 1 && entityIds[0] && seed.href
          ? seed.href
          : seed.group === "eu" && entityIds.length > 1
            ? `/fiscal/expenses?year=${primary.year ?? ""}&q=${primary.quarter ?? ""}`
            : seed.href ?? primary.href ?? undefined,
      group: seed.group,
      blocksReadyToFile: blocks,
      blocksReadyForSubmission: blocks || sev === "BLOCKER",
      count,
    });
  }

  const order: FiscalCloseActionGroup[] = [
    "census",
    "eu",
    "documentation",
    "verifactu",
    "invoices",
    "expenses",
    "other",
  ];
  return out.sort(
    (a, b) =>
      (a.severity === "BLOCKER" ? 0 : 1) - (b.severity === "BLOCKER" ? 0 : 1) ||
      order.indexOf(a.group) - order.indexOf(b.group) ||
      a.title.localeCompare(b.title)
  );
}

export function groupCloseActionsByArea(
  actions: FiscalCloseAction[]
): Record<FiscalCloseActionGroup, FiscalCloseAction[]> {
  const empty: Record<FiscalCloseActionGroup, FiscalCloseAction[]> = {
    census: [],
    invoices: [],
    expenses: [],
    eu: [],
    documentation: [],
    verifactu: [],
    other: [],
  };
  for (const a of actions) empty[a.group].push(a);
  return empty;
}
