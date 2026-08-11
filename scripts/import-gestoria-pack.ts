/**
 * Importa el paquete de gestoría:
 * - Sube todos los archivos a Vercel Blob (FiscalDocument)
 * - Importa Excel → libros registro (+ bienes/amortizaciones)
 * - OCR Gemini → FiscalFiling (años recientes; ver shouldUpsertOperativeFiling)
 *
 * Para rellenar Presentados desde PDFs ya en Archivo / carpeta:
 *   npm run ocr:gestoria-filings
 *
 * Uso:
 *   npx tsx scripts/import-gestoria-pack.ts [ruta-carpeta]
 *
 * Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y (para OCR) GEMINI_API_KEY.
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";

function loadLocalEnv() {
  const root = process.cwd();
  // No pisar vars ya inyectadas (p. ej. `vercel env run`)
  if (existsSync(path.join(root, ".env"))) {
    loadEnv({ path: path.join(root, ".env") });
  }
  if (existsSync(path.join(root, ".env.local"))) {
    loadEnv({ path: path.join(root, ".env.local") });
  }
  // vercel env pull marca Sensitive como literal "[SENSITIVE]"
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
import { createFiscalDocument, blobConfigured } from "../lib/fiscal-blob";
import {
  classifyGestoriaFileName,
  shouldUpsertOperativeFiling,
  titleForGestoriaFile,
} from "../lib/gestoria-classify";
import { parseRegisterBookExcel } from "../lib/register-book-import";
import { buildLinearAmortization } from "../lib/investment-amortization";
import {
  geminiConfigured,
  parseFiscalFilingDocument,
  fiscalFilingPeriodKey,
  isAnnualOrCensusModel,
} from "../lib/gemini-fiscal-filing";

const DEFAULT_DIR = path.join(
  process.env.HOME ?? "",
  "Downloads",
  "RE_ SOLICITUDE DOCUMENTACIÓN"
);

function mimeFor(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function importBook(
  buffer: Buffer,
  fileName: string,
  documentId: string | null
) {
  const parsed = parseRegisterBookExcel(buffer, fileName);

  const existing = await prisma.registerBook.findUnique({
    where: {
      bookType_year: { bookType: parsed.bookType, year: parsed.year },
    },
  });
  if (existing) {
    await prisma.registerBookLine.deleteMany({ where: { bookId: existing.id } });
    await prisma.registerBook.delete({ where: { id: existing.id } });
  }

  const book = await prisma.registerBook.create({
    data: {
      bookType: parsed.bookType,
      year: parsed.year,
      documentId,
      sourceFile: fileName,
    },
  });

  // Neon HTTP no soporta createMany (usa transacción interna)
  for (const l of parsed.lines) {
    await prisma.registerBookLine.create({
      data: {
        bookId: book.id,
        sortOrder: l.sortOrder,
        reference: l.reference,
        invoiceNumber: l.invoiceNumber,
        issueDate: l.issueDate,
        concept: l.concept,
        nif: l.nif,
        counterparty: l.counterparty,
        base: new Prisma.Decimal(l.base),
        vatRate: l.vatRate,
        vatAmount: new Prisma.Decimal(l.vatAmount),
        withholding: new Prisma.Decimal(l.withholding),
        total: new Prisma.Decimal(l.total),
      },
    });
  }

  if (parsed.bookType === "BIENES") {
    for (const l of parsed.lines) {
      const startYear = l.issueDate?.getFullYear() ?? parsed.year;
      const amort = buildLinearAmortization({
        base: l.base,
        usefulLifeYears: 4,
        startYear,
      });
      const inv = l.invoiceNumber;
      if (inv) {
        const old = await prisma.investmentAsset.findMany({
          where: { invoiceNumber: inv },
          select: { id: true },
        });
        for (const o of old) {
          await prisma.investmentAmortization.deleteMany({
            where: { assetId: o.id },
          });
          await prisma.investmentAsset.delete({ where: { id: o.id } });
        }
      }
      const asset = await prisma.investmentAsset.create({
        data: {
          description: l.concept || inv || "Bien de inversión",
          supplierName: l.counterparty,
          supplierNif: l.nif,
          invoiceNumber: inv,
          purchaseDate: l.issueDate,
          base: new Prisma.Decimal(l.base),
          vatAmount: new Prisma.Decimal(l.vatAmount),
          usefulLifeYears: 4,
          method: "LINEAL",
          startYear,
          documentId,
        },
      });
      for (const a of amort) {
        await prisma.investmentAmortization.create({
          data: {
            assetId: asset.id,
            year: a.year,
            amount: new Prisma.Decimal(a.amount),
          },
        });
      }
    }
  }

  console.log(`  libro ${parsed.bookType} ${parsed.year}: ${parsed.lines.length} líneas`);
}

async function upsertFilingFromOcr(
  buffer: Buffer,
  fileName: string,
  documentId: string | null,
  mimeType: string
) {
  if (!geminiConfigured()) {
    console.log(`  skip OCR (sin GEMINI_API_KEY): ${fileName}`);
    return;
  }
  const draft = await parseFiscalFilingDocument({
    buffer,
    mimeType,
    fileName,
  });
  if (
    !shouldUpsertOperativeFiling(draft.modelType, draft.year, draft.quarter)
  ) {
    console.log(
      `  archivo solo (no operativo): ${draft.modelType} ${draft.year} T${draft.quarter ?? "-"}`
    );
    return;
  }

  const quarter = isAnnualOrCensusModel(draft.modelType) ? null : draft.quarter;
  const periodKey = fiscalFilingPeriodKey(
    draft.modelType,
    draft.year,
    quarter
  );
  const row = await prisma.fiscalFiling.upsert({
    where: { periodKey },
    create: {
      periodKey,
      modelType: draft.modelType,
      year: draft.year,
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

  if (documentId) {
    await prisma.fiscalDocument.update({
      where: { id: documentId },
      data: { filingId: row.id },
    });
  }
  console.log(`  filing operativo: ${periodKey}`);
}

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  console.log("Import gestoría desde:", dir);

  if (!blobConfigured()) {
    console.warn(
      "AVISO: sin BLOB_READ_WRITE_TOKEN — se importarán libros/filings pero no se subirán archivos a Blob."
    );
  }

  const entries = await readdir(dir);
  const files = entries
    .filter((f) => !f.startsWith(".") && f !== ".DS_Store")
    .sort((a, b) => a.localeCompare(b, "es"));

  let docs = 0;
  let books = 0;
  let filings = 0;

  for (const fileName of files) {
    const full = path.join(dir, fileName);
    const buffer = await readFile(full);
    const classified = classifyGestoriaFileName(fileName);
    const title = titleForGestoriaFile(fileName, classified);
    const mime = mimeFor(fileName);

    console.log(`\n→ ${fileName} [${classified.kind}]`);

    let documentId: string | null = null;
    if (blobConfigured()) {
      try {
        const year =
          classified.kind === "filing" || classified.kind === "book"
            ? classified.year
            : classified.kind === "irpf" || classified.kind === "census"
              ? classified.year
              : null;
        const quarter =
          classified.kind === "filing" ? classified.quarter : null;
        const modelType =
          classified.kind === "filing" ? classified.modelType : null;

        const doc = await createFiscalDocument({
          buffer,
          fileName,
          mimeType: mime,
          category: classified.category,
          title,
          year,
          quarter,
          modelType,
          folder: "gestoria",
        });
        documentId = doc.id;
        docs += 1;
        console.log(`  blob ok: ${doc.id}`);
      } catch (e) {
        console.error(
          `  blob error:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    if (classified.kind === "book") {
      try {
        await importBook(buffer, fileName, documentId);
        books += 1;
      } catch (e) {
        console.error(`  libro error:`, e instanceof Error ? e.message : e);
      }
    }

    if (classified.kind === "filing" && mime === "application/pdf") {
      try {
        const before = await prisma.fiscalFiling.count();
        await upsertFilingFromOcr(buffer, fileName, documentId, mime);
        const after = await prisma.fiscalFiling.count();
        if (after > before) filings += 1;
      } catch (e) {
        console.error(`  OCR error:`, e instanceof Error ? e.message : e);
      }
    }

    if (classified.kind === "payment") {
      await prisma.taxPayment.create({
        data: {
          notes: `Importado: ${fileName}`,
          documentId,
          status: "PAGADO",
          amount: new Prisma.Decimal(0),
        },
      });
      console.log("  pago registrado (revisar importe manualmente)");
    }
  }

  console.log("\n=== Resumen ===");
  console.log(`Documentos Blob: ${docs}`);
  console.log(`Libros: ${books}`);
  console.log(`Filings OCR nuevos: ${filings}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
