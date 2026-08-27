/**
 * Health checks Modelo 115 (Fase 9.5). Gate aislado model="115".
 */

import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import { buildModel115 } from "@/lib/modelo-115/engine";
import type {
  Model115LeaseRef,
  Model115WithholdingRow,
} from "@/lib/modelo-115/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";
import { moneyEqual } from "@/lib/modelo-390/money";
import { parse115PresentedSnapshot } from "@/lib/modelo-115/presentation";
import type { FiscalQuarter } from "@/lib/fiscal";

function check(
  id: string,
  label: string,
  passed: boolean,
  model?: FiscalHealthCheck["model"],
  detail?: string
): FiscalHealthCheck {
  return { id, label, passed, model, detail };
}

export function runModel115HealthChecks(ctx: FiscalHealthContext): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  let dataOk = true;

  if (ctx.mode !== "quarter" || ctx.quarter == null) {
    checks.push(
      check(
        "model115_quarter_scope",
        "Modelo 115 (chequeo trimestral)",
        true,
        "115",
        "Health 115 detallado en modo trimestre"
      )
    );
    return { issues, checks };
  }

  const quarter = ctx.quarter as FiscalQuarter;
  const rentWh = (ctx.practicedWithholdingsYear ?? []).filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.RENT
  );

  const expenseLease = new Map(
    ctx.expensesYear.map((e) => [e.id, e.leaseId] as const)
  );

  const rows: Model115WithholdingRow[] = rentWh.map((w) => ({
    id: w.id,
    direction: w.direction,
    kind: w.kind,
    status: w.status,
    rectifiesId: null,
    counterpartyId: `cp-${w.id}`,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    baseAmount: Number(w.baseAmount),
    rate: w.rate,
    withholdingAmount: Number(w.withholdingAmount),
    accrualDate: w.accrualDate,
    paymentDate: w.paymentDate ?? null,
    year: w.year,
    quarter: w.quarter,
    leaseId:
      w.sourceType === "EXPENSE"
        ? expenseLease.get(w.sourceId) ?? null
        : null,
    counterparty: {
      id: `cp-${w.id}`,
      name: w.counterpartyName ?? "—",
      taxId: w.counterpartyTaxId ?? "",
      normalizedTaxId: (w.counterpartyTaxId ?? "")
        .replace(/[\s.-]/g, "")
        .toUpperCase(),
      kind: "LANDLORD",
      countryCode: "ES",
      requiresReview: false,
    },
  }));

  const leases: Model115LeaseRef[] = (ctx.leasesActive ?? []).map((l) => ({
    id: l.id,
    propertyAddress: l.propertyAddress,
    withholdingStatus: l.withholdingStatus,
    withholdingExemptionReason: l.withholdingExemptionReason,
    counterpartyId: l.counterpartyId,
    active: l.active,
  }));

  // Align counterpartyId with lease when possible
  for (const row of rows) {
    if (!row.leaseId) continue;
    const lease = leases.find((l) => l.id === row.leaseId);
    if (lease) {
      row.counterpartyId = lease.counterpartyId;
      row.counterparty.id = lease.counterpartyId;
      row.counterparty.name =
        ctx.leasesActive?.find((l) => l.id === lease.id)?.landlordName ??
        row.counterparty.name;
      row.counterparty.taxId =
        ctx.leasesActive?.find((l) => l.id === lease.id)?.landlordTaxId ??
        row.counterparty.taxId;
      row.counterparty.normalizedTaxId = row.counterparty.taxId
        .replace(/[\s.-]/g, "")
        .toUpperCase();
    }
  }

  const draft = buildModel115({
    year: ctx.year,
    quarter,
    withholdings: rows,
    leases,
    censusModel115: ctx.settings?.censusModel115,
    rentsBusinessPremises: ctx.settings?.rentsBusinessPremises,
    businessRentSubjectToWithholding:
      ctx.settings?.businessRentSubjectToWithholding,
    model115Periodicity: ctx.settings?.model115Periodicity,
  });

  for (const w of draft.warnings) {
    if (
      w.code === "MODEL115_PAYMENT_DATE_MISSING" ||
      w.code === "MODEL115_LANDLORD_ID_MISSING" ||
      w.code === "MODEL115_LEASE_WITHHOLDING_MISMATCH" ||
      w.code === "MODEL115_LEASE_MISMATCH" ||
      w.code === "MODEL115_WITHHOLDING_MISMATCH"
    ) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: w.code,
          severity: "ERROR",
          blocksFiling: true,
          title: w.code.replace(/_/g, " "),
          description: w.message,
          model: "115",
          year: ctx.year,
          quarter,
          sourceType: "expense",
          sourceId: w.sourceId,
          href: w.sourceId
            ? `/fiscal/expenses/${w.sourceId}/edit`
            : "/fiscal/115",
        })
      );
    } else if (w.code === "MODEL115_EXEMPTION_REVIEW_REQUIRED") {
      issues.push(
        createHealthIssue({
          code: "MODEL115_EXEMPTION_REVIEW_REQUIRED",
          severity: "WARNING",
          blocksFiling: false,
          title: "Revisar exención / sujeción alquiler",
          description: w.message,
          model: "115",
          year: ctx.year,
          quarter,
          href: "/fiscal/leases",
        })
      );
    }
  }

  if (
    draft.filingObligation.operationsSignal === "HAS_OPS" &&
    (ctx.settings?.censusModel115 ?? "UNKNOWN") === "NO"
  ) {
    issues.push(
      createHealthIssue({
        code: "MODEL115_CENSUS_MISMATCH",
        severity: "WARNING",
        blocksFiling: false,
        title: "Mismatch censal 115",
        description:
          "Hay operaciones 115 pero censusModel115 = NO. VEXO no modifica el 036.",
        model: "115",
        year: ctx.year,
        quarter,
        href: "/settings",
      })
    );
  }

  const presented = ctx.presented115;
  if (presented) {
    const snap = parse115PresentedSnapshot(presented.rawExtract);
    if (snap && !moneyEqual(snap.boxes.box05, draft.boxes.box05)) {
      issues.push(
        createHealthIssue({
          code: "MODEL115_FILING_DIVERGENCE",
          severity: "WARNING",
          blocksFiling: false,
          title: "Presentado 115 vs motor actual",
          description: `box05 presentado ${snap.boxes.box05} € ≠ motor ${draft.boxes.box05} €.`,
          model: "115",
          year: ctx.year,
          quarter,
          href: "/fiscal/115",
        })
      );
    }
  }

  checks.push(
    check(
      "model115_data_ready",
      "Modelo 115 datos listos",
      dataOk && !draft.requiresReview,
      "115"
    )
  );

  return { issues, checks };
}
