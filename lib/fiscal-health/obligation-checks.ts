import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
  FiscalHealthModelStatus,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import { buildFiscalObligationsFromSnapshot } from "@/lib/fiscal-obligations/engine";
import type { FiscalObligationEntry } from "@/lib/fiscal-obligations/types";
import type { FiscalQuarter } from "@/lib/fiscal";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";

function check(
  id: string,
  label: string,
  passed: boolean,
  model?: FiscalHealthCheck["model"],
  detail?: string
): FiscalHealthCheck {
  return { id, label, passed, model, detail };
}

function mapObligationToHealth(
  status: FiscalObligationEntry["obligationStatus"]
): FiscalHealthModelStatus["obligation"] {
  if (status === "REQUIRED") return "REQUIRED";
  if (status === "NOT_REQUIRED" || status === "NOT_APPLICABLE") {
    return status === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_APPLICABLE";
  }
  return "UNKNOWN";
}

function statusForModel(
  allIssues: FiscalHealthIssue[],
  model: FiscalHealthModelStatus["model"],
  quarter: FiscalQuarter | null
): FiscalHealthModelStatus["status"] {
  const relevant = allIssues.filter(
    (i) =>
      (i.model === model || i.relatedModels?.includes(model as "303")) &&
      (quarter == null || i.quarter == null || i.quarter === quarter)
  );
  if (relevant.some((i) => i.blocksFiling)) return "NOT_READY";
  if (relevant.some((i) => i.severity === "ERROR" || i.severity === "CRITICAL"))
    return "NOT_READY";
  if (relevant.some((i) => i.severity === "WARNING" || i.severity === "INFO"))
    return "READY_WITH_WARNINGS";
  return "READY";
}

/**
 * Fuente única de obligaciones: buildFiscalObligationsFromSnapshot.
 * @deprecated La lógica paralela previa (hasOps→NOT_APPLICABLE, 303 siempre REQUIRED) ya no aplica.
 */
export function runObligationChecks(
  ctx: FiscalHealthContext,
  allIssues: FiscalHealthIssue[] = []
): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
  modelStatuses: FiscalHealthModelStatus[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  const modelStatuses: FiscalHealthModelStatus[] = [];

  const hasPracticedProfessional = (ctx.practicedWithholdingsYear ?? []).some(
    (w) =>
      w.direction === "PRACTICED" &&
      w.kind === "PROFESSIONAL" &&
      w.status === "ACTIVE"
  );
  const hasPracticedRent = (ctx.practicedWithholdingsYear ?? []).some(
    (w) =>
      w.direction === "PRACTICED" &&
      w.kind === "RENT" &&
      w.status === "ACTIVE"
  );
  const hasActiveLease = (ctx.leasesActive ?? []).some((l) => l.active);

  const model111HasOps: Partial<Record<FiscalQuarter, boolean>> = {
    1: false,
    2: false,
    3: false,
    4: false,
  };
  for (const w of ctx.practicedWithholdingsYear ?? []) {
    if (
      w.direction !== "PRACTICED" ||
      w.kind !== "PROFESSIONAL" ||
      w.status !== "ACTIVE"
    ) {
      continue;
    }
    if (!w.paymentDate) continue;
    const m = w.paymentDate.getMonth() + 1;
    const y = w.paymentDate.getFullYear();
    if (y !== ctx.year) continue;
    const q = Math.ceil(m / 3) as FiscalQuarter;
    model111HasOps[q] = true;
  }

  const model115HasOps: Partial<Record<FiscalQuarter, boolean>> = {
    1: false,
    2: false,
    3: false,
    4: false,
  };
  for (const w of ctx.practicedWithholdingsYear ?? []) {
    if (
      w.direction !== "PRACTICED" ||
      w.kind !== "RENT" ||
      w.status !== "ACTIVE"
    ) {
      continue;
    }
    if (!w.paymentDate) continue;
    const m = w.paymentDate.getMonth() + 1;
    const y = w.paymentDate.getFullYear();
    if (y !== ctx.year) continue;
    const q = Math.ceil(m / 3) as FiscalQuarter;
    model115HasOps[q] = true;
  }

  const model349HasOps: Partial<Record<FiscalQuarter, boolean>> = {};
  for (const d of ctx.draft349All) {
    if (d.quarter != null) {
      model349HasOps[d.quarter as FiscalQuarter] = Boolean(d.hasOps);
    }
  }

  const incomeYtd =
    ctx.chain130?.[4]?.boxes?.find((b) => b.code === "01")?.value ??
    ctx.chain130?.[ctx.quarter ?? 4]?.boxes?.find((b) => b.code === "01")
      ?.value ??
    0;

  const result = buildFiscalObligationsFromSnapshot({
    year: ctx.year,
    quarter: ctx.mode === "quarter" ? ctx.quarter : null,
    settings: ctx.settings,
    filings: ctx.filingsYear.map((f) => ({
      id: f.id,
      modelType: f.modelType,
      year: f.year,
      quarter: f.quarter,
    })),
    incomeBaseYtd: Number(incomeYtd) || 0,
    incomeWithWithholdingYtd: 0,
    model349HasOps,
    model347HasDeclarableOps:
      ctx.draft347 != null ? (ctx.draft347.operators?.length ?? 0) > 0 : null,
    model390Status: ctx.model390?.filingObligation.status,
    model390Reasons: ctx.model390?.filingObligation.reasons,
    hasPracticedProfessionalWithholding: hasPracticedProfessional,
    hasPracticedRentWithholding: hasPracticedRent,
    hasActiveBusinessPremisesLease: hasActiveLease,
    model111HasOps,
    model111Periodicity: ctx.settings?.model111Periodicity,
    model115HasOps,
    model115Periodicity: ctx.settings?.model115Periodicity,
    hasLeaseWithholdingUnknown: (ctx.leasesActive ?? []).some(
      (l) => l.active && l.withholdingStatus === "UNKNOWN"
    ),
  });

  if (result.profileCompleteness === "INSUFFICIENT") {
    issues.push(
      createHealthIssue({
        code: "CENSUS_PROFILE_INCOMPLETE",
        severity: "WARNING",
        blocksFiling: false,
        title: "Perfil censal insuficiente",
        description: result.warnings[0] ?? "Completa datos fiscales en Ajustes.",
        model: "HEALTH",
        year: ctx.year,
        href: "/settings",
      })
    );
  }

  for (const m of result.mismatches) {
    const preserved =
      m.code === "CENSUS_MODEL111_MISMATCH" ||
      m.code === "CENSUS_MODEL115_MISMATCH" ||
      m.code === "CENSUS_RENT_ACTIVITY_MISMATCH" ||
      m.code === "MODEL111_OBLIGATION_REVIEW_REQUIRED" ||
      m.code === "MODEL115_OBLIGATION_REVIEW_REQUIRED"
        ? m.code
        : m.code.startsWith("CENSUS_MODEL") && m.code.includes("MISMATCH")
          ? "CENSUS_OBLIGATION_MISMATCH"
          : m.code.startsWith("CENSUS_MODEL") && m.code.includes("REVIEW")
            ? m.code
            : m.code;

    issues.push(
      createHealthIssue({
        code:
          m.code === "CENSUS_MODEL111_MISMATCH"
            ? "CENSUS_OBLIGATION_MISMATCH"
            : preserved,
        severity: m.severity,
        blocksFiling: false,
        title: m.title,
        description: m.description,
        model: (m.model === "HEALTH" ? "HEALTH" : m.model) as FiscalModelType | "HEALTH",
        year: ctx.year,
        href: "/settings",
      })
    );
  }

  // Deduplicate by fingerprint code+model for display statuses
  const relevantEntries =
    ctx.mode === "quarter" && ctx.quarter != null
      ? result.obligations.filter(
          (o) =>
            o.period.quarter === ctx.quarter ||
            o.period.quarter == null
        )
      : result.obligations;

  for (const entry of relevantEntries) {
    if (entry.obligationStatus === "UNKNOWN") {
      issues.push(
        createHealthIssue({
          code: "OBLIGATION_UNKNOWN",
          severity: "WARNING",
          blocksFiling:
            entry.model === "303" &&
            entry.statusSource === "INSUFFICIENT_DATA",
          title: `${entry.model}: obligación desconocida`,
          description: entry.reason,
          model: entry.model as FiscalModelType,
          year: entry.period.year,
          quarter: entry.period.quarter ?? null,
          href: "/settings",
        })
      );
    }

    if (
      entry.obligationStatus === "REQUIRED" &&
      entry.filingStatus !== "FILED" &&
      entry.dueDateReliable &&
      entry.filingStatus === "OVERDUE"
    ) {
      issues.push(
        createHealthIssue({
          code: "REQUIRED_FILING_OVERDUE",
          severity: "WARNING",
          blocksFiling: false,
          title: `${entry.model}: presentación fuera de plazo`,
          description: entry.reason,
          model: entry.model as FiscalModelType,
          year: entry.period.year,
          quarter: entry.period.quarter ?? null,
        })
      );
    } else if (
      entry.obligationStatus === "REQUIRED" &&
      entry.filingStatus !== "FILED" &&
      (entry.filingStatus === "DUE" || entry.filingStatus === "UPCOMING")
    ) {
      // INFO only for missing — not OVERDUE
      if (entry.filingStatus === "DUE") {
        issues.push(
          createHealthIssue({
            code: "REQUIRED_FILING_MISSING",
            severity: "INFO",
            blocksFiling: false,
            title: `${entry.model}: pendiente de presentar`,
            description: entry.reason,
            model: entry.model as FiscalModelType,
            year: entry.period.year,
            quarter: entry.period.quarter ?? null,
          })
        );
      }
    }

    const presented = entry.filingStatus === "FILED";
    let obligation = mapObligationToHealth(entry.obligationStatus);
    // Preserve EXEMPT label for 390 when NOT_REQUIRED from exempt resolver
    if (
      entry.model === "390" &&
      entry.reasonCodes.includes("390_EXEMPT")
    ) {
      obligation = "EXEMPT";
    }

    modelStatuses.push({
      model: entry.model as FiscalHealthModelStatus["model"],
      label: entry.period.label.includes("T")
        ? `${entry.model} ${entry.period.quarter}T`
        : entry.model,
      status: statusForModel(
        [...allIssues, ...issues],
        entry.model as FiscalHealthModelStatus["model"],
        entry.period.quarter ?? null
      ),
      presented,
      obligation,
    });
  }

  const ok = !issues.some(
    (i) =>
      i.code === "CENSUS_OBLIGATION_MISMATCH" ||
      i.code === "CENSUS_PROFILE_INCOMPLETE"
  );

  checks.push(
    check(
      "obligations_coherent",
      "Obligaciones fiscales sin incoherencias detectadas",
      ok,
      "HEALTH"
    )
  );

  return { issues, checks, modelStatuses };
}
