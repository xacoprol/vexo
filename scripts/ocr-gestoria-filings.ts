/**
 * OCR de PDFs de gestoría ya en Archivo → FiscalFiling (Presentados).
 * No vuelve a subir Blob; enlaza el FiscalDocument existente.
 *
 * Uso:
 *   npx tsx scripts/ocr-gestoria-filings.ts [ruta-carpeta]
 *   # o con secrets de Vercel:
 *   vercel env run -e production -- npx tsx scripts/ocr-gestoria-filings.ts
 *
 * Requiere DATABASE_URL y GEMINI_API_KEY.
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";

function loadLocalEnv() {
  const root = process.cwd();
  if (existsSync(path.join(root, ".env"))) {
    loadEnv({ path: path.join(root, ".env") });
  }
  if (existsSync(path.join(root, ".env.local"))) {
    loadEnv({ path: path.join(root, ".env.local") });
  }
  for (const key of [
    "BLOB_READ_WRITE_TOKEN",
    "DATABASE_URL",
    "DIRECT_URL",
    "GEMINI_API_KEY",
  ]) {
    const v = process.env[key];
    if (v === "[SENSITIVE]" || v === "Hidden") {
      delete process.env[key];
    }
  }
}

loadLocalEnv();

import { readdir, readFile } from "fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  classifyGestoriaFileName,
  shouldUpsertOperativeFiling,
} from "../lib/gestoria-classify";
import {
  geminiConfigured,
  parseFiscalFilingDocument,
  fiscalFilingPeriodKey,
  isAnnualOrCensusModel,
  type FiscalModelType,
} from "../lib/gemini-fiscal-filing";

const DEFAULT_DIR = path.join(
  process.env.HOME ?? "",
  "Downloads",
  "RE_ SOLICITUDE DOCUMENTACIÓN"
);

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  const force = process.argv.includes("--force");
  console.log("OCR gestoría filings desde:", dir);
  console.log(force ? "Modo --force: reescribe presentados existentes" : "Solo faltantes");

  if (!geminiConfigured()) {
    throw new Error("Falta GEMINI_API_KEY");
  }

  const entries = await readdir(dir);
  const files = entries
    .filter((f) => !f.startsWith(".") && f !== ".DS_Store")
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, "es"));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const fileName of files) {
    const classified = classifyGestoriaFileName(fileName);
    if (classified.kind !== "filing") {
      continue;
    }

    if (
      !shouldUpsertOperativeFiling(
        classified.modelType,
        classified.year,
        classified.quarter
      )
    ) {
      console.log(`skip policy: ${fileName}`);
      skipped += 1;
      continue;
    }

    const periodKeyHint = fiscalFilingPeriodKey(
      classified.modelType as FiscalModelType,
      classified.year,
      classified.quarter
    );

    const existing = await prisma.fiscalFiling.findUnique({
      where: { periodKey: periodKeyHint },
      select: { id: true, boxes: true },
    });
    if (existing && !force) {
      const boxes = Array.isArray(existing.boxes) ? existing.boxes : [];
      if (boxes.length > 0) {
        console.log(`ya existe: ${periodKeyHint}`);
        skipped += 1;
        continue;
      }
    }

    const full = path.join(dir, fileName);
    const buffer = await readFile(full);
    console.log(`\n→ OCR ${fileName}`);

    try {
      const draft = await parseFiscalFilingDocument({
        buffer,
        mimeType: "application/pdf",
        fileName,
      });

      // Preferir año/trimestre del nombre de archivo (más fiable que OCR)
      const modelType = classified.modelType as FiscalModelType;
      const year = classified.year;
      const quarter = isAnnualOrCensusModel(modelType)
        ? null
        : classified.quarter;
      const periodKey = fiscalFilingPeriodKey(modelType, year, quarter);

      const before = await prisma.fiscalFiling.findUnique({
        where: { periodKey },
        select: { id: true },
      });

      const row = await prisma.fiscalFiling.upsert({
        where: { periodKey },
        create: {
          periodKey,
          modelType,
          year,
          quarter,
          filedAt: draft.filedAt ? new Date(`${draft.filedAt}T12:00:00`) : null,
          result: new Prisma.Decimal(draft.result),
          incomeBase:
            draft.incomeBase == null
              ? null
              : new Prisma.Decimal(draft.incomeBase),
          expensesBase:
            draft.expensesBase == null
              ? null
              : new Prisma.Decimal(draft.expensesBase),
          vatRepercutida:
            draft.vatRepercutida == null
              ? null
              : new Prisma.Decimal(draft.vatRepercutida),
          vatDeductible:
            draft.vatDeductible == null
              ? null
              : new Prisma.Decimal(draft.vatDeductible),
          boxes: draft.boxes,
          rawExtract: draft.rawExtract as object,
          sourceFileName: fileName,
          notes: draft.notes,
          confidence: draft.confidence,
        },
        update: {
          filedAt: draft.filedAt ? new Date(`${draft.filedAt}T12:00:00`) : null,
          result: new Prisma.Decimal(draft.result),
          incomeBase:
            draft.incomeBase == null
              ? null
              : new Prisma.Decimal(draft.incomeBase),
          expensesBase:
            draft.expensesBase == null
              ? null
              : new Prisma.Decimal(draft.expensesBase),
          vatRepercutida:
            draft.vatRepercutida == null
              ? null
              : new Prisma.Decimal(draft.vatRepercutida),
          vatDeductible:
            draft.vatDeductible == null
              ? null
              : new Prisma.Decimal(draft.vatDeductible),
          boxes: draft.boxes,
          rawExtract: draft.rawExtract as object,
          sourceFileName: fileName,
          notes: draft.notes,
          confidence: draft.confidence,
        },
      });

      const doc = await prisma.fiscalDocument.findFirst({
        where: { sourceFileName: fileName },
        orderBy: { createdAt: "desc" },
      });
      if (doc) {
        await prisma.fiscalDocument.update({
          where: { id: doc.id },
          data: { filingId: row.id },
        });
      }

      if (before) {
        updated += 1;
        console.log(`  updated ${periodKey} (boxes=${draft.boxes.length})`);
      } else {
        created += 1;
        console.log(`  created ${periodKey} (boxes=${draft.boxes.length})`);
      }
    } catch (e) {
      errors += 1;
      console.error(`  ERROR:`, e instanceof Error ? e.message : e);
    }
  }

  const all = await prisma.fiscalFiling.findMany({
    select: { periodKey: true, sourceFileName: true, result: true },
    orderBy: [{ year: "desc" }, { modelType: "asc" }, { quarter: "asc" }],
  });

  console.log("\n=== Resumen ===");
  console.log(`Creados: ${created}`);
  console.log(`Actualizados: ${updated}`);
  console.log(`Saltados: ${skipped}`);
  console.log(`Errores: ${errors}`);
  console.log(`Presentados totales: ${all.length}`);
  for (const f of all) {
    console.log(`  ${f.periodKey} · ${f.sourceFileName} · ${Number(f.result)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
