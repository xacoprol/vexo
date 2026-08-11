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
  revalidatePath("/fiscal/036");
  revalidatePath("/fiscal/annual");
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
  const rawJson =
    input.rawExtract != null
      ? (input.rawExtract as Prisma.InputJsonValue)
      : undefined;

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

/** Borra presentados trimestrales que no sean 3T 2026. */
export async function cleanupNonCurrentQuarterFilings(): Promise<{
  ok: true;
  deleted: number;
}> {
  await requireAuth();
  const result = await prisma.fiscalFiling.deleteMany({
    where: {
      quarter: { not: null },
      NOT: { AND: [{ year: 2026 }, { quarter: 3 }] },
    },
  });
  revalidateFilings();
  return { ok: true, deleted: result.count };
}
