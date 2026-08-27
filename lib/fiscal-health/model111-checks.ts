/**
 * Health checks Modelo 111 (Fase 9.4).
 * Aislados: blockers con model="111" no bloquean 303/130.
 */

import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import { buildModel111 } from "@/lib/modelo-111/engine";
import type { Model111WithholdingRow } from "@/lib/modelo-111/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_STATUS,
} from "@/lib/fiscal-withholding";
import { moneyEqual } from "@/lib/modelo-390/money";
import { parse111PresentedSnapshot } from "@/lib/modelo-111/presentation";
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

function toRow(
  w: FiscalHealthContext["practicedWithholdingsYear"][number],
  counterpartyFallback?: {
    id: string;
    name: string;
    taxId: string;
    kind: string;
  }
): Model111WithholdingRow {
  return {
    id: w.id,
    direction: w.direction,
    kind: w.kind,
    status: w.status,
    rectifiesId: null,
    counterpartyId: counterpartyFallback?.id ?? `cp-${w.id}`,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    baseAmount: Number(w.baseAmount),
    rate: w.rate,
    withholdingAmount: Number(w.withholdingAmount),
    accrualDate: w.accrualDate,
    paymentDate: (w as { paymentDate?: Date | null }).paymentDate ?? null,
    year: w.year,
    quarter: w.quarter,
    counterparty: {
      id: counterpartyFallback?.id ?? `cp-${w.id}`,
      name: w.counterpartyName ?? counterpartyFallback?.name ?? "—",
      taxId: w.counterpartyTaxId ?? counterpartyFallback?.taxId ?? "",
      normalizedTaxId: (
        w.counterpartyTaxId ??
        counterpartyFallback?.taxId ??
        ""
      )
        .replace(/[\s.-]/g, "")
        .toUpperCase(),
      kind: counterpartyFallback?.kind ?? "PROFESSIONAL",
      countryCode: "ES",
      requiresReview: false,
    },
  };
}

export function runModel111HealthChecks(ctx: FiscalHealthContext): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  let dataOk = true;

  if (ctx.mode !== "quarter" || ctx.quarter == null) {
    checks.push(
      check(
        "model111_quarter_scope",
        "Modelo 111 (chequeo trimestral)",
        true,
        "111",
        "Health 111 detallado en modo trimestre"
      )
    );
    return { issues, checks };
  }

  const quarter = ctx.quarter as FiscalQuarter;
  const professional = (ctx.practicedWithholdingsYear ?? []).filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.PROFESSIONAL
  );

  const rows = professional.map((w) => toRow(w));
  const draft = buildModel111({
    year: ctx.year,
    quarter,
    withholdings: rows,
    censusModel111: ctx.settings?.censusModel111,
    paysProfessionalsSubjectToWithholding:
      ctx.settings?.paysProfessionalsSubjectToWithholding,
    hasEmployees: ctx.settings?.hasEmployees,
    model111Periodicity:
      (ctx.settings as { model111Periodicity?: string } | null)
        ?.model111Periodicity ?? "UNKNOWN",
  });

  for (const w of draft.warnings) {
    if (
      w.code === "MODEL111_PAYMENT_DATE_MISSING" ||
      w.code === "MODEL111_PAYEE_ID_MISSING" ||
      w.code === "MODEL111_EMPLOYEE_DATA_NOT_SUPPORTED"
    ) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: w.code,
          severity: "ERROR",
          blocksFiling: true,
          title: w.code.replace(/_/g, " "),
          description: w.message,
          model: "111",
          year: ctx.year,
          quarter,
          sourceType: "expense",
          sourceId: w.sourceId,
          href: w.sourceId
            ? `/fiscal/expenses/${w.sourceId}/edit`
            : "/fiscal/111",
        })
      );
    } else if (w.code === "MODEL111_UNSUPPORTED_SECTION") {
      issues.push(
        createHealthIssue({
          code: "MODEL111_UNSUPPORTED_SECTION",
          severity: "WARNING",
          blocksFiling: false,
          title: "Sección 111 no soportada",
          description: w.message,
          model: "111",
          year: ctx.year,
          quarter,
          href: "/fiscal/111",
        })
      );
    }
  }

  // Expense YES sin withholding ACTIVE profesional
  for (const e of ctx.expensesYear) {
    if (e.practicedWithholdingStatus !== "YES") continue;
    const has = professional.some(
      (w) =>
        w.sourceType === "EXPENSE" &&
        w.sourceId === e.id &&
        w.status === WITHHOLDING_STATUS.ACTIVE
    );
    if (!has) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL111_WITHHOLDING_MISMATCH",
          severity: "ERROR",
          blocksFiling: true,
          title: `Mismatch retención · ${e.supplierName}`,
          description:
            "Gasto con practicedWithholdingStatus=YES sin FiscalWithholding PROFESSIONAL ACTIVE.",
          model: "111",
          year: ctx.year,
          quarter,
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
        })
      );
    }
  }

  if (
    draft.filingObligation.operationsSignal === "HAS_OPS" &&
    (ctx.settings?.censusModel111 ?? "UNKNOWN") === "NO"
  ) {
    issues.push(
      createHealthIssue({
        code: "MODEL111_CENSUS_MISMATCH",
        severity: "WARNING",
        blocksFiling: false,
        title: "Mismatch censal 111",
        description:
          "Hay operaciones 111 pero censusModel111 = NO. VEXO no modifica el 036.",
        model: "111",
        year: ctx.year,
        quarter,
        href: "/settings",
      })
    );
  }

  // Filing divergence
  const presented = ctx.presented111;
  if (presented) {
    const snap = parse111PresentedSnapshot(presented.rawExtract);
    if (snap) {
      if (!moneyEqual(snap.boxes.box30, draft.boxes.box30)) {
        issues.push(
          createHealthIssue({
            code: "MODEL111_FILING_DIVERGENCE",
            severity: "WARNING",
            blocksFiling: false,
            title: "Presentado 111 vs motor actual",
            description: `box30 presentado ${snap.boxes.box30} € ≠ motor ${draft.boxes.box30} €. El histórico no se sobrescribe.`,
            model: "111",
            year: ctx.year,
            quarter,
            href: "/fiscal/111",
          })
        );
      }
    }
  }

  checks.push(
    check(
      "model111_data_ready",
      "Modelo 111 datos listos",
      dataOk && !draft.requiresReview,
      "111"
    )
  );

  return { issues, checks };
}
