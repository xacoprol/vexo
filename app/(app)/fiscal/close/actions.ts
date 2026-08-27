/**
 * Carga y confirma revisión pre-presentación (Fase 14).
 * Backend recalcula siempre; el cliente no envía casillas.
 */

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import type { FiscalQuarter } from "@/lib/fiscal";
import { isExpenseReverseCharge, parseExpenseVatOperationType } from "@/lib/fiscal";
import { buildFiscalPeriodValidation } from "@/lib/fiscal-validation";
import { buildFiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot";
import {
  buildPreFilingSnapshotV1,
  computeCensusHash,
  computePeriodSourceHash,
  periodKeyClose,
  FISCAL_ENGINE_VERSION,
} from "@/lib/fiscal-close";
import {
  loadLatestPreFilingReview,
  loadPeriodBookSourceIds,
  buildEuReviewsForPeriod,
} from "@/lib/fiscal-close/load";
import { buildEnrichedModelSnapshotsForFreeze } from "@/lib/fiscal-close/enrich-snapshots";

export { loadLatestPreFilingReview, buildEuReviewsForPeriod };

/**
 * Confirma revisión fiscal del periodo.
 * Recalcula en servidor; no acepta resultados del cliente.
 * Fase 15: congela casillas + detail (349 ops, 111 payees, 115 landlords).
 */
export async function confirmFiscalPeriodReview(input: {
  year: number;
  quarter: FiscalQuarter;
  expectedSourceHash?: string;
  expectedCensusHash?: string;
}): Promise<
  | { ok: true; reviewId: string; status: "READY_FOR_SUBMISSION" }
  | { ok: false; error: string }
> {
  const session = await requireAuth();
  const { year, quarter } = input;

  const validation = await buildFiscalPeriodValidation({ year, quarter });
  if (!validation.lifecycle.readyToFile) {
    return {
      ok: false,
      error: "El periodo no está READY_TO_FILE; resuelve blockers primero.",
    };
  }
  if (validation.health.blockers.length > 0) {
    return { ok: false, error: "Hay blockers de Health activos." };
  }

  const settings = await prisma.companySettings.findFirst();
  const censusSettings = (settings ?? {}) as Record<string, unknown>;
  const sourceIds = await loadPeriodBookSourceIds(year, quarter);
  const censusSlice = {
    censusModel303: censusSettings.censusModel303,
    vatPeriodicity: censusSettings.vatPeriodicity,
    censusModel130: censusSettings.censusModel130,
    censusModel111: censusSettings.censusModel111,
    censusModel115: censusSettings.censusModel115,
    censusModel349: censusSettings.censusModel349,
  };

  const modelSnaps = await buildEnrichedModelSnapshotsForFreeze({
    year,
    quarter,
    sourceIds,
    census: censusSlice,
  });

  const sourceHash = computePeriodSourceHash([
    buildFiscalModelSnapshotV1({
      model: "period",
      year,
      quarter,
      result: null,
      sourceIds,
    }),
  ]);
  const censusHash = computeCensusHash(censusSettings);

  if (input.expectedSourceHash && input.expectedSourceHash !== sourceHash) {
    return {
      ok: false,
      error:
        "El libro cambió durante la confirmación. Recarga el cierre e inténtalo de nuevo.",
    };
  }
  if (input.expectedCensusHash && input.expectedCensusHash !== censusHash) {
    return {
      ok: false,
      error:
        "El censo cambió durante la confirmación. Recarga el cierre e inténtalo de nuevo.",
    };
  }

  const sourceIds2 = await loadPeriodBookSourceIds(year, quarter);
  const sourceHash2 = computePeriodSourceHash([
    buildFiscalModelSnapshotV1({
      model: "period",
      year,
      quarter,
      result: null,
      sourceIds: sourceIds2,
    }),
  ]);
  if (sourceHash2 !== sourceHash) {
    return {
      ok: false,
      error: "Condición de carrera: el libro cambió al congelar. Reintenta.",
    };
  }

  const id = randomUUID();
  const snapshot = buildPreFilingSnapshotV1({
    id,
    tenantKey: String(settings?.nif ?? "default"),
    year,
    quarter,
    models: modelSnaps,
    censusSettings,
    healthStatus: validation.health.status,
    warnings: validation.health.issues
      .filter((i) => !i.blocksFiling)
      .map((i) => i.code),
    readyToFile: true,
    obligationSummary: validation.obligations.obligations
      .filter((o) => o.period.quarter === quarter)
      .map((o) => ({
        model: o.model,
        obligationStatus: o.obligationStatus,
        filingStatus: o.filingStatus,
      })),
    createdBy: session.user?.id ?? undefined,
    engineVersion: FISCAL_ENGINE_VERSION,
  });
  // Alinear con gate: hash de libro del periodo (IDs deduplicados)
  snapshot.sourceHash = sourceHash;

  const periodKey = periodKeyClose(year, quarter);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.fiscalPreFilingReview.updateMany({
        where: { periodKey, supersededAt: null },
        data: { supersededAt: new Date() },
      });
      await tx.fiscalPreFilingReview.create({
        data: {
          id,
          periodKey,
          year,
          quarter,
          payload: snapshot as object,
          sourceHash: snapshot.sourceHash,
          censusHash: snapshot.censusHash,
          engineVersion: snapshot.engineVersion,
          healthStatus: snapshot.healthStatus,
          readyToFile: true,
          createdBy: session.user?.id ?? null,
        },
      });
    });
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `No se pudo guardar la revisión: ${e.message}`
          : "No se pudo guardar la revisión.",
    };
  }

  revalidatePath("/fiscal/close");
  revalidatePath("/fiscal/health");

  return { ok: true, reviewId: id, status: "READY_FOR_SUBMISSION" };
}

/**
 * Actualiza solo vatOperationType (reclasificación UE controlada).
 */
export async function updateExpenseVatOperationType(input: {
  expenseId: string;
  vatOperationType: string;
  confirm: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  if (!input.confirm) {
    return { ok: false, error: "Confirmación explícita requerida." };
  }

  const next = parseExpenseVatOperationType(input.vatOperationType);
  const exp = await prisma.expense.findUnique({
    where: { id: input.expenseId },
  });
  if (!exp) return { ok: false, error: "Gasto no encontrado." };

  if (String(exp.vatOperationType) === next) return { ok: true };

  if (isExpenseReverseCharge(next) && !exp.supplierNif) {
    return {
      ok: false,
      error: "Operación UE requiere NIF/VAT del proveedor.",
    };
  }

  await prisma.expense.update({
    where: { id: input.expenseId },
    data: { vatOperationType: next },
  });

  revalidatePath("/fiscal");
  revalidatePath("/fiscal/expenses");
  revalidatePath(`/fiscal/expenses/${input.expenseId}/edit`);
  revalidatePath("/fiscal/303");
  revalidatePath("/fiscal/349");
  revalidatePath("/fiscal/health");
  revalidatePath("/fiscal/close");

  return { ok: true };
}
