/**
 * Health checks Modelo 180 (Fase 9.6).
 * Gate aislado: blockers model="180" no bloquean 130/303.
 */

import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import { buildModel180 } from "@/lib/modelo-180/engine";
import type {
  Model180LeaseRef,
  Model180WithholdingRow,
} from "@/lib/modelo-180/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";
import { parse180PresentedSnapshot } from "@/lib/modelo-180/presentation";
import { moneyEqual } from "@/lib/modelo-390/money";

function check(
  id: string,
  label: string,
  passed: boolean,
  model?: FiscalHealthCheck["model"],
  detail?: string
): FiscalHealthCheck {
  return { id, label, passed, model, detail };
}

export function runModel180HealthChecks(ctx: FiscalHealthContext): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];

  const expenseLease = new Map(
    ctx.expensesYear.map((e) => [e.id, e.leaseId] as const)
  );

  const leases: Model180LeaseRef[] = (ctx.leasesActive ?? []).map((l) => ({
    id: l.id,
    counterpartyId: l.counterpartyId,
    propertyAddress: l.propertyAddress ?? "—",
    cadastralReference: l.cadastralReference ?? null,
    withholdingStatus: l.withholdingStatus,
    active: l.active,
  }));

  const rows: Model180WithholdingRow[] = ctx.practicedWithholdingsYear
    .filter(
      (w) =>
        w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
        w.kind === WITHHOLDING_KIND.RENT
    )
    .map((w) => ({
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

  const draft = buildModel180({
    year: ctx.year,
    withholdings: rows,
    leases,
    censusModel180: ctx.settings?.censusModel180,
    censusModel115: ctx.settings?.censusModel115,
  });

  for (const w of draft.warnings) {
    if (w.code === "MODEL180_LANDLORD_ID_MISSING") {
      issues.push(
        createHealthIssue({
          code: "MODEL180_LANDLORD_ID_MISSING",
          severity: "ERROR",
          blocksFiling: true,
          title: "Arrendador 180 sin identificar",
          description: w.message,
          model: "180",
          year: ctx.year,
        })
      );
    }
    if (
      w.code === "MODEL180_PROPERTY_DATA_MISSING" ||
      w.code === "MODEL180_CADASTRAL_DATA_MISSING"
    ) {
      issues.push(
        createHealthIssue({
          code: "MODEL180_PROPERTY_DATA_MISSING",
          severity: w.severity === "ERROR" ? "ERROR" : "WARNING",
          blocksFiling: w.severity === "ERROR",
          title: "Datos de inmueble 180 incompletos",
          description: w.message,
          model: "180",
          year: ctx.year,
        })
      );
    }
    if (w.code === "MODEL180_115_RECONCILIATION_DIFFERENCE") {
      issues.push(
        createHealthIssue({
          code: "MODEL180_115_RECONCILIATION_DIFFERENCE",
          severity: "WARNING",
          blocksFiling: false,
          title: "Diferencia conciliación 115↔180",
          description: w.message,
          model: "180",
          year: ctx.year,
        })
      );
    }
  }

  if (
    draft.filingObligation.reasonCodes.includes("CENSUS_MODEL180_MISMATCH")
  ) {
    issues.push(
      createHealthIssue({
        code: "MODEL180_CENSUS_MISMATCH",
        severity: "WARNING",
        blocksFiling: false,
        title: "Mismatch censal 180",
        description: draft.filingObligation.reasons.join(" "),
        model: "180",
        year: ctx.year,
      })
    );
  }

  const presented = ctx.presented180;
  if (presented) {
    const snap = parse180PresentedSnapshot(presented.rawExtract);
    if (
      snap &&
      !moneyEqual(
        snap.summary.totalWithholdingAmount,
        draft.summary.totalWithholdingAmount
      )
    ) {
      issues.push(
        createHealthIssue({
          code: "MODEL180_FILING_DIVERGENCE",
          severity: "WARNING",
          blocksFiling: false,
          title: "180 presentado ≠ motor actual",
          description:
            "El snapshot histórico no coincide con el motor actual.",
          model: "180",
          year: ctx.year,
        })
      );
    }
  }

  checks.push(
    check(
      "180-property",
      "Datos inmueble 180",
      !draft.records.some((r) => !r.leaseId),
      "180"
    )
  );

  return { issues, checks };
}
