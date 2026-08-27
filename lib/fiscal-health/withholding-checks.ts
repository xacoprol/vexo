import { round2 } from "@/lib/modelo-390/money";
import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import {
  PRACTICED_WITHHOLDING_STATUS,
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_SOURCE,
  WITHHOLDING_STATUS,
  validatePracticedWithholding,
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

/**
 * Checks de consistencia de retenciones PRACTICADAS profesionales (Fase 9.1).
 * RENT se valida en lease-checks (Fase 9.3).
 */
export function runPracticedWithholdingChecks(ctx: FiscalHealthContext): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  let dataOk = true;

  const expenseById = new Map(ctx.expensesYear.map((e) => [e.id, e]));
  const withholdings = ctx.practicedWithholdingsYear ?? [];
  const activeProfessional = withholdings.filter(
    (w) =>
      w.direction === WITHHOLDING_DIRECTION.PRACTICED &&
      w.kind === WITHHOLDING_KIND.PROFESSIONAL &&
      w.status === WITHHOLDING_STATUS.ACTIVE
  );

  const activeByExpense = new Map<string, typeof activeProfessional>();
  for (const w of activeProfessional) {
    if (w.sourceType !== WITHHOLDING_SOURCE.EXPENSE) continue;
    const list = activeByExpense.get(w.sourceId) ?? [];
    list.push(w);
    activeByExpense.set(w.sourceId, list);
  }

  for (const w of activeProfessional) {
    if (w.sourceType === WITHHOLDING_SOURCE.EXPENSE) {
      const expense = expenseById.get(w.sourceId);
      if (!expense) {
        dataOk = false;
        issues.push(
          createHealthIssue({
            code: "PRACTICED_WITHHOLDING_ORPHAN",
            severity: "ERROR",
            blocksFiling: false,
            title: "Retención practicada huérfana",
            description: `FiscalWithholding ${w.id} apunta a un gasto inexistente.`,
            model: "HEALTH",
            year: ctx.year,
            sourceType: "expense",
            sourceId: w.sourceId,
            evidence: { withholdingId: w.id },
          })
        );
        continue;
      }

      if (
        expense.practicedWithholdingStatus !==
        PRACTICED_WITHHOLDING_STATUS.YES
      ) {
        dataOk = false;
        issues.push(
          createHealthIssue({
            code: "PRACTICED_WITHHOLDING_EXPENSE_MISMATCH",
            severity: "ERROR",
            blocksFiling: false,
            title: `Retención vs gasto · ${expense.supplierName}`,
            description:
              "Existe FiscalWithholding PROFESSIONAL ACTIVE pero el gasto no está marcado como sujeto a retención (YES).",
            model: "HEALTH",
            year: ctx.year,
            sourceType: "expense",
            sourceId: expense.id,
            href: `/fiscal/expenses/${expense.id}/edit`,
          })
        );
      }

      const validation = validatePracticedWithholding({
        counterpartyTaxId: w.counterpartyTaxId,
        counterpartyName: w.counterpartyName,
        baseAmount: Number(w.baseAmount),
        rate: w.rate,
        withholdingAmount: Number(w.withholdingAmount),
        accrualDate: w.accrualDate,
      });
      if (!validation.ok) {
        dataOk = false;
        issues.push(
          createHealthIssue({
            code: "PRACTICED_WITHHOLDING_INVALID",
            severity: "ERROR",
            blocksFiling: false,
            title: `Retención inválida · ${expense.supplierName}`,
            description: validation.message,
            model: "HEALTH",
            year: ctx.year,
            sourceType: "expense",
            sourceId: expense.id,
            href: `/fiscal/expenses/${expense.id}/edit`,
            evidence: { code: validation.code },
          })
        );
      }

      const gross = round2(Number(expense.total) || 0);
      const whAmt = round2(Number(w.withholdingAmount) || 0);
      if (whAmt > gross + 0.01) {
        dataOk = false;
        issues.push(
          createHealthIssue({
            code: "PRACTICED_WITHHOLDING_EXPENSE_MISMATCH",
            severity: "WARNING",
            blocksFiling: false,
            title: `Retención > bruto · ${expense.supplierName}`,
            description: `Retención ${whAmt} € supera el bruto del documento ${gross} €.`,
            model: "HEALTH",
            year: ctx.year,
            sourceType: "expense",
            sourceId: expense.id,
            href: `/fiscal/expenses/${expense.id}/edit`,
          })
        );
      }
    }
  }

  for (const [expenseId, list] of activeByExpense) {
    if (list.length > 1) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "PRACTICED_WITHHOLDING_EXPENSE_MISMATCH",
          severity: "ERROR",
          blocksFiling: false,
          title: "Retenciones profesionales duplicadas en un gasto",
          description: `${list.length} FiscalWithholding PROFESSIONAL ACTIVE para el mismo gasto.`,
          model: "HEALTH",
          year: ctx.year,
          sourceType: "expense",
          sourceId: expenseId,
          href: `/fiscal/expenses/${expenseId}/edit`,
        })
      );
    }
  }

  for (const e of ctx.expensesYear) {
    if (e.practicedWithholdingStatus !== PRACTICED_WITHHOLDING_STATUS.YES) {
      continue;
    }
    const list = activeByExpense.get(e.id) ?? [];
    if (list.length === 0) {
      dataOk = false;
      issues.push(
        createHealthIssue({
          code: "PRACTICED_WITHHOLDING_EXPENSE_MISMATCH",
          severity: "ERROR",
          blocksFiling: false,
          title: `Gasto marcado con retención sin registro · ${e.supplierName}`,
          description:
            "practicedWithholdingStatus=YES pero no hay FiscalWithholding PROFESSIONAL ACTIVE.",
          model: "HEALTH",
          year: ctx.year,
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
        })
      );
    }
  }

  for (const e of ctx.expensesYear) {
    if (
      e.practicedWithholdingStatus === PRACTICED_WITHHOLDING_STATUS.UNKNOWN &&
      e.category === "PROFESIONALES"
    ) {
      issues.push(
        createHealthIssue({
          code: "MODEL111_OBLIGATION_REVIEW_REQUIRED",
          severity: "INFO",
          blocksFiling: false,
          title: `Gasto profesional sin clasificación de retención · ${e.supplierName}`,
          description:
            "Categoría PROFESIONALES con retención UNKNOWN. Confirma si está sujeto a retención practicada.",
          model: "111",
          year: ctx.year,
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
        })
      );
    }
  }

  checks.push(
    check(
      "practiced_withholdings_consistent",
      "Retenciones practicadas consistentes",
      dataOk,
      "HEALTH"
    )
  );

  return { issues, checks };
}
