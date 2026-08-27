/**
 * Health checks Modelo 190 (Fase 9.6).
 * Gate aislado: blockers model="190" no bloquean 303/130.
 */

import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import { buildModel190 } from "@/lib/modelo-190/engine";
import type { Model190WithholdingRow } from "@/lib/modelo-190/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";
import { parse190PresentedSnapshot } from "@/lib/modelo-190/presentation";
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

export function runModel190HealthChecks(ctx: FiscalHealthContext): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];

  // Solo en modo anual (o siempre con datos del año)
  const rows: Model190WithholdingRow[] = ctx.practicedWithholdingsYear
    .filter(
      (w) =>
        w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
        w.kind === WITHHOLDING_KIND.PROFESSIONAL
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
      paymentDate: (w as { paymentDate?: Date | null }).paymentDate ?? null,
      year: w.year,
      quarter: w.quarter,
      perceptionKey: w.perceptionKey ?? null,
      perceptionSubKey: w.perceptionSubKey ?? null,
      counterparty: {
        id: `cp-${w.id}`,
        name: w.counterpartyName ?? "—",
        taxId: w.counterpartyTaxId ?? "",
        normalizedTaxId: (w.counterpartyTaxId ?? "")
          .replace(/[\s.-]/g, "")
          .toUpperCase(),
        kind: "PROFESSIONAL",
        countryCode: "ES",
        requiresReview: false,
      },
    }));

  const draft = buildModel190({
    year: ctx.year,
    withholdings: rows,
    censusModel190: ctx.settings?.censusModel190,
    censusModel111: ctx.settings?.censusModel111,
    hasEmployees: ctx.settings?.hasEmployees,
  });

  for (const w of draft.warnings) {
    if (w.code === "MODEL190_PAYMENT_DATE_MISSING") {
      issues.push(
        createHealthIssue({
          code: "MODEL190_PAYMENT_DATE_MISSING",
          severity: "ERROR",
          blocksFiling: true,
          title: "Falta paymentDate en retención 190",
          description: w.message,
          model: "190",
          year: ctx.year,
          sourceType: "expense",
          sourceId: w.sourceId,
        })
      );
    }
    if (w.code === "MODEL190_PAYEE_ID_MISSING") {
      issues.push(
        createHealthIssue({
          code: "MODEL190_PAYEE_ID_MISSING",
          severity: "ERROR",
          blocksFiling: true,
          title: "Perceptor 190 sin NIF válido",
          description: w.message,
          model: "190",
          year: ctx.year,
        })
      );
    }
    if (
      w.code === "MODEL190_PERCEPTION_CLASSIFICATION_MISSING" ||
      w.code === "MODEL190_CLASSIFICATION_MISSING"
    ) {
      issues.push(
        createHealthIssue({
          code: "MODEL190_CLASSIFICATION_MISSING",
          severity: "ERROR",
          blocksFiling: true,
          title: "Clave/subclave 190 ausente",
          description: w.message,
          model: "190",
          year: ctx.year,
        })
      );
    }
    if (w.code === "MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED") {
      issues.push(
        createHealthIssue({
          code: "MODEL190_EMPLOYEE_DATA_NOT_SUPPORTED",
          severity: "ERROR",
          blocksFiling: true,
          title: "190 incompleto: hay empleados",
          description: w.message,
          model: "190",
          year: ctx.year,
        })
      );
    }
    if (w.code === "MODEL190_UNSUPPORTED_SECTION") {
      issues.push(
        createHealthIssue({
          code: "MODEL190_UNSUPPORTED_SECTION",
          severity: "ERROR",
          blocksFiling: true,
          title: "Sección 190 no soportada",
          description: w.message,
          model: "190",
          year: ctx.year,
        })
      );
    }
    if (w.code === "MODEL190_111_RECONCILIATION_DIFFERENCE") {
      issues.push(
        createHealthIssue({
          code: "MODEL190_111_RECONCILIATION_DIFFERENCE",
          severity: "WARNING",
          blocksFiling: false,
          title: "Diferencia conciliación 111↔190",
          description: w.message,
          model: "190",
          year: ctx.year,
        })
      );
    }
  }

  if (
    draft.filingObligation.reasonCodes.includes("CENSUS_MODEL190_MISMATCH")
  ) {
    issues.push(
      createHealthIssue({
        code: "MODEL190_CENSUS_MISMATCH",
        severity: "WARNING",
        blocksFiling: false,
        title: "Mismatch censal 190",
        description: draft.filingObligation.reasons.join(" "),
        model: "190",
        year: ctx.year,
      })
    );
  }

  const presented = ctx.presented190;
  if (presented) {
    const snap = parse190PresentedSnapshot(presented.rawExtract);
    if (
      snap &&
      !moneyEqual(
        snap.summary.totalWithholdingAmount,
        draft.summary.totalWithholdingAmount
      )
    ) {
      issues.push(
        createHealthIssue({
          code: "MODEL190_FILING_DIVERGENCE",
          severity: "WARNING",
          blocksFiling: false,
          title: "190 presentado ≠ motor actual",
          description:
            "El snapshot histórico no coincide con el motor actual (no se sobrescribe).",
          model: "190",
          year: ctx.year,
        })
      );
    }
  }

  checks.push(
    check(
      "190-classification",
      "Claves/subclaves 190",
      !draft.records.some((r) => r.classificationMissing),
      "190"
    ),
    check(
      "190-employees",
      "Sin bloqueo empleados",
      String(ctx.settings?.hasEmployees ?? "UNKNOWN").toUpperCase() !== "YES",
      "190"
    )
  );

  return { issues, checks };
}
