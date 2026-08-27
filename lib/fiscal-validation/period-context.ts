/**
 * Carga agrupada del trimestre para validación/cierre.
 * Reutiliza builders existentes en Promise.all (sin N+1 secuencial).
 */

import type { FiscalQuarter, FiscalPeriodSummary } from "@/lib/fiscal";
import { buildFiscalPeriodSummary, quarterRange } from "@/lib/fiscal";
import { buildFiscalHealthCheck } from "@/lib/fiscal-health";
import type { FiscalHealthResult } from "@/lib/fiscal-health";
import { buildFiscalObligations } from "@/lib/fiscal-obligations";
import type { FiscalObligationsResult } from "@/lib/fiscal-obligations/types";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import { buildModelo111Draft } from "@/lib/modelo-111";
import { buildModelo115Draft } from "@/lib/modelo-115";
import { buildModelo349Draft } from "@/lib/fiscal-347-349";
import type { Model111Result } from "@/lib/modelo-111";
import type { Model115Result } from "@/lib/modelo-115";
import type { Model349Result } from "@/lib/modelo-349";
import { hasPostFilingRectification } from "@/lib/fiscal-health/extended-checks";
import { loadFiscalHealthContext } from "@/lib/fiscal-health/context";
import { prisma } from "@/lib/prisma";

export type PostFilingBookEvidence = {
  /** Mínimo filedAt de filings del trimestre (AEAT). */
  presentationCutoffAt: string | null;
  expenseIdsAddedAfter: string[];
  intraExpenseIdsAddedAfter: string[];
};

export type FiscalPeriodValidationContext = {
  year: number;
  quarter: FiscalQuarter;
  health: FiscalHealthResult;
  obligations: FiscalObligationsResult;
  summary: FiscalPeriodSummary;
  draft111: Model111Result;
  draft115: Model115Result;
  draft349: Model349Result;
  presented: {
    "130": PresentedFilingView | null;
    "303": PresentedFilingView | null;
    "111": PresentedFilingView | null;
    "115": PresentedFilingView | null;
    "349": PresentedFilingView | null;
  };
  explainedRectification303: boolean;
  explainedRectification130: boolean;
  postFiling: PostFilingBookEvidence;
};

/**
 * Una sola orquestación en paralelo.
 * Nota: Health y period summary aún solapan filas internas (limitación documentada);
 * evitamos cascadas secuenciales modelo→modelo.
 */
export async function loadFiscalPeriodValidationContext(
  year: number,
  quarter: FiscalQuarter
): Promise<FiscalPeriodValidationContext> {
  const [
    health,
    obligations,
    summary,
    draft111,
    draft115,
    draft349,
    p130,
    p303,
    p111,
    p115,
    p349,
  ] = await Promise.all([
    buildFiscalHealthCheck({ year, quarter }),
    buildFiscalObligations({ year, quarter }),
    buildFiscalPeriodSummary(year, quarter),
    buildModelo111Draft(year, quarter),
    buildModelo115Draft(year, quarter),
    buildModelo349Draft(year, quarter),
    getPresentedFiling("130", year, quarter),
    getPresentedFiling("303", year, quarter),
    getPresentedFiling("111", year, quarter),
    getPresentedFiling("115", year, quarter),
    getPresentedFiling("349", year, quarter),
  ]);

  // Rectificativa explicada: reutiliza helper Health (necesita contexto ligero).
  let explainedRectification303 = false;
  let explainedRectification130 = false;
  if (p303 || p130) {
    try {
      const healthCtx = await loadFiscalHealthContext({ year, quarter });
      if (p303) {
        explainedRectification303 = hasPostFilingRectification(
          healthCtx,
          "303",
          quarter
        );
      }
      if (p130) {
        explainedRectification130 = hasPostFilingRectification(
          healthCtx,
          "130",
          quarter
        );
      }
    } catch {
      // Si falla el contexto, no inventamos explicación.
    }
  }

  const filingMeta = await prisma.fiscalFiling.findMany({
    where: {
      year,
      quarter,
      modelType: { in: ["130", "303", "349", "111", "115"] },
    },
    select: { filedAt: true, createdAt: true, modelType: true },
  });
  const presentationCutoff =
    filingMeta
      .map((f) => f.filedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const { from, to } = quarterRange(year, quarter);
  let expenseIdsAddedAfter: string[] = [];
  let intraExpenseIdsAddedAfter: string[] = [];
  if (presentationCutoff) {
    const added = await prisma.expense.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        createdAt: { gte: presentationCutoff },
      },
      select: { id: true, vatOperationType: true },
    });
    expenseIdsAddedAfter = added.map((e) => e.id);
    intraExpenseIdsAddedAfter = added
      .filter((e) =>
        ["INTRACOMUNITARIA", "SERVICIO_INTRACOMUNITARIO"].includes(
          String(e.vatOperationType).toUpperCase()
        )
      )
      .map((e) => e.id);
  }

  return {
    year,
    quarter,
    health,
    obligations,
    summary,
    draft111,
    draft115,
    draft349,
    presented: {
      "130": p130,
      "303": p303,
      "111": p111,
      "115": p115,
      "349": p349,
    },
    explainedRectification303,
    explainedRectification130,
    postFiling: {
      presentationCutoffAt: presentationCutoff
        ? presentationCutoff.toISOString()
        : null,
      expenseIdsAddedAfter,
      intraExpenseIdsAddedAfter,
    },
  };
}
