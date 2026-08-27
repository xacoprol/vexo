"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  fiscalFilingPeriodKey,
  isAnnualOrCensusModel,
  FISCAL_MODEL_TYPES,
  type FiscalModelType,
  type FilingBox,
} from "@/lib/gemini-fiscal-filing";
import {
  createFiscalDocument,
  blobConfigured,
} from "@/lib/fiscal-blob";
import {
  attachFiscalSnapshotV1,
  buildFiscalModelSnapshotV1,
  boxesArrayToRecord,
  hasFiscalSnapshotV1,
} from "@/lib/fiscal-snapshot";

export type FilingDraftInput = {
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
  filedAt: string | null;
  result: number;
  incomeBase: number | null;
  expensesBase: number | null;
  vatRepercutida: number | null;
  vatDeductible: number | null;
  boxes: FilingBox[];
  notes: string | null;
  confidence: string;
  sourceFileName: string | null;
  rawExtract?: Record<string, unknown> | null;
  /** PDF en base64 para archivar en Blob (opcional). */
  fileBase64?: string | null;
  fileMimeType?: string | null;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function validate(input: FilingDraftInput): string | null {
  if (!FISCAL_MODEL_TYPES.includes(input.modelType)) {
    return "Tipo de modelo no válido";
  }
  if (!Number.isFinite(input.year) || input.year < 2000 || input.year > 2100) {
    return "Año no válido";
  }
  if (isAnnualOrCensusModel(input.modelType)) {
    if (input.quarter != null) return `${input.modelType} no lleva trimestre`;
  } else {
    if (
      input.quarter !== 1 &&
      input.quarter !== 2 &&
      input.quarter !== 3 &&
      input.quarter !== 4
    ) {
      return "Trimestre no válido (1–4)";
    }
  }
  return null;
}

function revalidateFilings() {
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/filings");
  revalidatePath("/fiscal/archive");
  revalidatePath("/fiscal/303");
  revalidatePath("/fiscal/130");
  revalidatePath("/fiscal/390");
  revalidatePath("/fiscal/347");
  revalidatePath("/fiscal/349");
  revalidatePath("/fiscal/111");
  revalidatePath("/fiscal/115");
  revalidatePath("/fiscal/180");
  revalidatePath("/fiscal/190");
  revalidatePath("/fiscal/036");
  revalidatePath("/fiscal/annual");
  revalidatePath("/fiscal/close");
  revalidatePath("/fiscal/health");
  revalidatePath("/stats");
}

export async function upsertFiscalFiling(
  input: FilingDraftInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAuth();
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const quarter = isAnnualOrCensusModel(input.modelType) ? null : input.quarter;
  const periodKey = fiscalFilingPeriodKey(input.modelType, input.year, quarter);
  const filedAt = input.filedAt ? new Date(`${input.filedAt}T12:00:00`) : null;
  const boxes = input.boxes.map((b) => ({
    code: b.code,
    label: b.label,
    value: round2(b.value),
  }));

  const boxesJson = boxes as Prisma.InputJsonValue;

  // Snapshot v1 para filings nuevos desde VEXO (no reconstruye OCR legacy).
  let rawMerged: Record<string, unknown> =
    input.rawExtract != null && typeof input.rawExtract === "object"
      ? { ...input.rawExtract }
      : { source: "manual-mark-presented" };

  const isLegacyOcrImport =
    Boolean(input.sourceFileName) ||
    Boolean(rawMerged.sourceFileName) ||
    String(rawMerged.source ?? "").toLowerCase().includes("ocr") ||
    String(rawMerged.source ?? "").toLowerCase().includes("gestoria");

  if (!isLegacyOcrImport && !hasFiscalSnapshotV1(rawMerged, input.modelType)) {
    const snap = buildFiscalModelSnapshotV1({
      model: input.modelType,
      year: input.year,
      quarter,
      period:
        quarter != null
          ? `${quarter}T ${input.year}`
          : String(input.year),
      result: round2(input.result),
      boxes: boxesArrayToRecord(boxes),
      bases: {
        incomeBase: input.incomeBase,
        expensesBase: input.expensesBase,
        vatRepercutida: input.vatRepercutida,
        vatDeductible: input.vatDeductible,
      },
      sourceIds: {},
      warnings: [],
      census: {},
      bookCutoffAt: new Date(),
      computedAt: new Date(),
    });
    rawMerged = attachFiscalSnapshotV1(rawMerged, snap);
  }

  const rawJson = rawMerged as Prisma.InputJsonValue;

  const toDec = (n: number | null) =>
    n == null ? null : new Prisma.Decimal(round2(n));

  try {
    const row = await prisma.fiscalFiling.upsert({
      where: { periodKey },
      create: {
        periodKey,
        modelType: input.modelType,
        year: input.year,
        quarter,
        filedAt,
        result: new Prisma.Decimal(round2(input.result)),
        incomeBase: toDec(input.incomeBase),
        expensesBase: toDec(input.expensesBase),
        vatRepercutida: toDec(input.vatRepercutida),
        vatDeductible: toDec(input.vatDeductible),
        boxes: boxesJson,
        rawExtract: rawJson,
        sourceFileName: input.sourceFileName,
        notes: input.notes,
        confidence: input.confidence || "medium",
      },
      update: {
        modelType: input.modelType,
        year: input.year,
        quarter,
        filedAt,
        result: new Prisma.Decimal(round2(input.result)),
        incomeBase: toDec(input.incomeBase),
        expensesBase: toDec(input.expensesBase),
        vatRepercutida: toDec(input.vatRepercutida),
        vatDeductible: toDec(input.vatDeductible),
        boxes: boxesJson,
        rawExtract: rawJson,
        sourceFileName: input.sourceFileName,
        notes: input.notes,
        confidence: input.confidence || "medium",
      },
    });

    if (
      input.fileBase64 &&
      input.sourceFileName &&
      blobConfigured()
    ) {
      try {
        const buffer = Buffer.from(input.fileBase64, "base64");
        await createFiscalDocument({
          buffer,
          fileName: input.sourceFileName,
          mimeType: input.fileMimeType || "application/pdf",
          category: input.modelType === "036" ? "CENSUS" : "FILING",
          title: `Modelo ${input.modelType}${
            quarter ? ` ${quarter}T` : ""
          } ${input.year}`,
          year: input.year,
          quarter,
          modelType: input.modelType,
          filingId: row.id,
        });
      } catch {
        // El filing ya está guardado; el archivo puede subirse luego al Archivo
      }
    }

    revalidateFilings();
    return { ok: true, id: row.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar",
    };
  }
}

export async function deleteFiscalFiling(id: string) {
  await requireAuth();
  await prisma.fiscalFiling.delete({ where: { id } });
  revalidateFilings();
}

/** Desactivado: no borrar presentados históricos (riesgo legal). */
export async function cleanupNonCurrentQuarterFilings(): Promise<{
  ok: true;
  deleted: number;
}> {
  await requireAuth();
  return { ok: true, deleted: 0 };
}
