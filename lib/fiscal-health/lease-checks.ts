/**
 * Health checks de arrendamientos de local (Fase 9.3).
 * No afirma obligación legal 115 REQUIRED.
 */

import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import {
  assessLeaseWithholdingDataCompleteness,
  LEASE_WITHHOLDING_STATUS,
} from "@/lib/fiscal-leases";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_SOURCE,
  WITHHOLDING_STATUS,
} from "@/lib/fiscal-withholding";

function check(
  id: string,
  label: string,
  passed: boolean,
  model?: FiscalHealthCheck["model"],
  detail?: string
): FiscalHealthCheck {
  return { id, label, passed, model, detail };
}

export function runLeaseHealthChecks(ctx: FiscalHealthContext): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  let dataOk = true;

  const leases = ctx.leasesActive ?? [];
  const expenseById = new Map(ctx.expensesYear.map((e) => [e.id, e]));
  const rentByExpense = new Map<string, (typeof ctx.practicedWithholdingsYear)[number][]>();

  for (const w of ctx.practicedWithholdingsYear ?? []) {
    if (
      w.direction !== WITHHOLDING_DIRECTION.PRACTICED ||
      w.kind !== WITHHOLDING_KIND.RENT ||
      w.status !== WITHHOLDING_STATUS.ACTIVE
    ) {
      continue;
    }
    if (w.sourceType !== WITHHOLDING_SOURCE.EXPENSE) continue;
    const list = rentByExpense.get(w.sourceId) ?? [];
    list.push(w);
    rentByExpense.set(w.sourceId, list);
  }

  for (const lease of leases) {
    const completeness = assessLeaseWithholdingDataCompleteness({
      withholdingStatus: lease.withholdingStatus,
      withholdingExemptionReason: lease.withholdingExemptionReason,
      landlordTaxId: lease.landlordTaxId,
      landlordName: lease.landlordName,
      propertyAddress: lease.propertyAddress,
      defaultWithholdingRate: lease.defaultWithholdingRate,
      activityUse: lease.activityUse,
    });

    for (const issue of completeness.issues) {
      if (issue.code === "LEASE_PROPERTY_ADDRESS_MISSING") continue;
      if (issue.code === "LEASE_DEFAULT_RATE_MISSING") continue;

      dataOk = false;
      const severity =
        issue.code === "LEASE_WITHHOLDING_UNKNOWN" ||
        issue.code === "LEASE_EXEMPTION_REASON_MISSING"
          ? "WARNING"
          : "ERROR";

      issues.push(
        createHealthIssue({
          code: issue.code,
          severity,
          blocksFiling: false,
          title: `${issue.code.replace(/_/g, " ")} · ${lease.propertyAddress}`,
          description: issue.message,
          model: "115",
          year: ctx.year,
          sourceType: "expense",
          sourceId: lease.id,
          href: "/fiscal/leases",
          evidence: { leaseId: lease.id },
        })
      );
    }
  }

  // Expense linked to lease YES but no RENT withholding / mismatch
  for (const e of ctx.expensesYear) {
    if (!e.leaseId) continue;
    const lease = leases.find((l) => l.id === e.leaseId);
    if (!lease) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "LEASE_EXPENSE_WITHHOLDING_MISMATCH",
          severity: "WARNING",
          blocksFiling: false,
          title: `Gasto con leaseId huérfano · ${e.supplierName}`,
          description: "El gasto apunta a un local que no está activo o no existe.",
          model: "115",
          year: ctx.year,
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
        })
      );
      continue;
    }

    const rents = rentByExpense.get(e.id) ?? [];
    if (lease.withholdingStatus === LEASE_WITHHOLDING_STATUS.YES) {
      if (rents.length === 0) {
        dataOk = false;
        issues.push(
          createHealthIssue({
            code: "LEASE_EXPENSE_WITHHOLDING_MISMATCH",
            severity: "ERROR",
            blocksFiling: false,
            title: `Alquiler sin retención RENT · ${e.supplierName}`,
            description:
              "Local con withholdingStatus=YES pero el gasto no tiene FiscalWithholding PRACTICED RENT ACTIVE.",
            model: "115",
            year: ctx.year,
            sourceType: "expense",
            sourceId: e.id,
            href: `/fiscal/expenses/${e.id}/edit`,
          })
        );
      }
    } else if (rents.length > 0) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "LEASE_EXPENSE_WITHHOLDING_MISMATCH",
          severity: "ERROR",
          blocksFiling: false,
          title: `Retención RENT vs local · ${e.supplierName}`,
          description: `Existe FiscalWithholding RENT pero el local declara withholdingStatus=${lease.withholdingStatus}.`,
          model: "115",
          year: ctx.year,
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
        })
      );
    }

    if (rents.length > 1) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "LEASE_EXPENSE_WITHHOLDING_MISMATCH",
          severity: "ERROR",
          blocksFiling: false,
          title: "Retenciones RENT duplicadas",
          description: `${rents.length} FiscalWithholding RENT ACTIVE en el mismo gasto.`,
          model: "115",
          year: ctx.year,
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
        })
      );
    }
  }

  // Orphan RENT withholdings
  for (const [expenseId, list] of rentByExpense) {
    const expense = expenseById.get(expenseId);
    if (!expense) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "LEASE_EXPENSE_WITHHOLDING_MISMATCH",
          severity: "ERROR",
          blocksFiling: false,
          title: "Retención RENT huérfana",
          description: `FiscalWithholding RENT apunta a gasto inexistente (${expenseId}).`,
          model: "115",
          year: ctx.year,
          sourceType: "expense",
          sourceId: expenseId,
        })
      );
      void list;
    }
  }

  // Census mismatches vs leases / rent withholdings (no auto-fix)
  const rentsCensus = ctx.settings?.rentsBusinessPremises ?? "UNKNOWN";
  const census115 = ctx.settings?.censusModel115 ?? "UNKNOWN";
  const hasActiveLease = leases.some((l) => l.active);
  const hasRentWh = (ctx.practicedWithholdingsYear ?? []).some(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.RENT &&
      w.status === WITHHOLDING_STATUS.ACTIVE
  );

  if (hasActiveLease && rentsCensus === "NO") {
    issues.push(
      createHealthIssue({
        code: "CENSUS_RENT_ACTIVITY_MISMATCH",
        severity: "WARNING",
        blocksFiling: false,
        title: "Mismatch: locales arrendados vs censo",
        description:
          "Hay BusinessPremisesLease activos pero rentsBusinessPremises = NO. Revisa el 036; VEXO no cambia el censo.",
        model: "115",
        year: ctx.year,
        href: "/settings",
      })
    );
  }

  if (hasRentWh && census115 === "NO") {
    issues.push(
      createHealthIssue({
        code: "CENSUS_MODEL115_MISMATCH",
        severity: "WARNING",
        blocksFiling: false,
        title: "Mismatch censal Modelo 115",
        description:
          "Hay retenciones PRACTICED RENT ACTIVE, pero censusModel115 = NO. No se auto-corrige.",
        model: "115",
        year: ctx.year,
        href: "/settings",
      })
    );
  }

  if (hasRentWh && census115 === "UNKNOWN") {
    issues.push(
      createHealthIssue({
        code: "MODEL115_OBLIGATION_REVIEW_REQUIRED",
        severity: "WARNING",
        blocksFiling: false,
        title: "Revisar obligación Modelo 115",
        description:
          "Existen retenciones de alquiler y el censo 115 está en UNKNOWN. Confirma en Ajustes; el motor 115 aún no afirma REQUIRED.",
        model: "115",
        year: ctx.year,
        href: "/settings",
      })
    );
  }

  checks.push(
    check(
      "business_premises_leases_consistent",
      "Arrendamientos de local consistentes",
      dataOk,
      "115"
    )
  );

  return { issues, checks };
}
