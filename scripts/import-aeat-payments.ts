/**
 * Parsea los PDF «Pagos realizados…» del paquete gestoría y crea TaxPayment.
 *
 * Uso:
 *   npx tsx scripts/import-aeat-payments.ts [ruta-carpeta]
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";

function loadLocalEnv() {
  const root = process.cwd();
  if (existsSync(path.join(root, ".env"))) loadEnv({ path: path.join(root, ".env") });
  if (existsSync(path.join(root, ".env.local")))
    loadEnv({ path: path.join(root, ".env.local") });
}
loadLocalEnv();

import { readdir, readFile } from "fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { classifyGestoriaFileName } from "../lib/gestoria-classify";
import {
  geminiConfigured,
  parseAeatPaymentsDocument,
} from "../lib/gemini-aeat-payments";
import { fiscalFilingPeriodKey } from "../lib/gemini-fiscal-filing";
import type { FiscalModelType } from "../lib/gemini-fiscal-filing";

const DEFAULT_DIR = path.join(
  process.env.HOME ?? "",
  "Downloads",
  "RE_ SOLICITUDE DOCUMENTACIÓN"
);

async function main() {
  const dir = process.argv[2] || DEFAULT_DIR;
  console.log("Import pagos AEAT desde:", dir);
  if (!geminiConfigured()) throw new Error("Falta GEMINI_API_KEY");

  // Limpia stubs vacíos del import anterior
  const deleted = await prisma.taxPayment.deleteMany({
    where: {
      amount: 0,
      notes: { contains: "Importado: Pagos realizados" },
    },
  });
  console.log(`Stubs amount=0 eliminados: ${deleted.count}`);

  const entries = await readdir(dir);
  const files = entries
    .filter((f) => /pagos\s+realizados/i.test(f) && f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, "es"));

  let created = 0;
  let skipped = 0;

  for (const fileName of files) {
    const classified = classifyGestoriaFileName(fileName);
    if (classified.kind !== "payment") continue;

    const buffer = await readFile(path.join(dir, fileName));
    console.log(`\n→ OCR ${fileName}`);
    const draft = await parseAeatPaymentsDocument({
      buffer,
      mimeType: "application/pdf",
      fileName,
    });
    console.log(`  ${draft.payments.length} pagos (conf=${draft.confidence})`);

    const doc = await prisma.fiscalDocument.findFirst({
      where: { sourceFileName: fileName },
      orderBy: { createdAt: "desc" },
    });

    for (const p of draft.payments) {
      if (p.nrc) {
        const existsNrc = await prisma.taxPayment.findFirst({
          where: { nrc: p.nrc },
          select: { id: true },
        });
        if (existsNrc) {
          skipped += 1;
          continue;
        }
      } else if (p.modelType && p.year != null && p.paidAt) {
        const exists = await prisma.taxPayment.findFirst({
          where: {
            modelType: p.modelType,
            year: p.year,
            quarter: p.quarter,
            amount: new Prisma.Decimal(p.amount),
            paidAt: new Date(`${p.paidAt}T12:00:00`),
          },
          select: { id: true },
        });
        if (exists) {
          skipped += 1;
          continue;
        }
      }

      let filingId: string | null = null;
      if (
        p.modelType &&
        ["303", "130", "390", "347", "349", "036"].includes(p.modelType) &&
        p.year != null
      ) {
        const periodKey = fiscalFilingPeriodKey(
          p.modelType as FiscalModelType,
          p.year,
          p.quarter
        );
        const filing = await prisma.fiscalFiling.findUnique({
          where: { periodKey },
          select: { id: true },
        });
        filingId = filing?.id ?? null;
      }

      await prisma.taxPayment.create({
        data: {
          modelType: p.modelType,
          year: p.year,
          quarter: p.quarter,
          amount: new Prisma.Decimal(p.amount),
          paidAt: p.paidAt ? new Date(`${p.paidAt}T12:00:00`) : null,
          nrc: p.nrc,
          status: "PAGADO",
          filingId,
          documentId: doc?.id ?? null,
          notes: [p.concept, `Import OCR: ${fileName}`]
            .filter(Boolean)
            .join(" · "),
        },
      });
      created += 1;
      console.log(
        `  + ${p.modelType ?? "?"} ${p.year ?? "?"} T${p.quarter ?? "-"} ${p.amount}€ NRC=${p.nrc ?? "—"}`
      );
    }
  }

  const all = await prisma.taxPayment.findMany({
    where: { amount: { gt: 0 } },
    orderBy: [{ year: "desc" }, { quarter: "asc" }],
    select: {
      modelType: true,
      year: true,
      quarter: true,
      amount: true,
      nrc: true,
    },
  });
  console.log("\n=== Resumen ===");
  console.log(`Creados: ${created}`);
  console.log(`Saltados (dup): ${skipped}`);
  console.log(`Pagos con importe: ${all.length}`);
  for (const p of all) {
    console.log(
      `  ${p.modelType ?? "?"} ${p.year ?? "?"} T${p.quarter ?? "-"} ${Number(p.amount)} ${p.nrc ?? ""}`
    );
  }

  // Segunda pasada: enlazar huérfanos por importe = resultado presentado
  const orphans = await prisma.taxPayment.findMany({
    where: {
      amount: { gt: 0 },
      OR: [{ modelType: null }, { filingId: null }],
    },
  });
  const filings = await prisma.fiscalFiling.findMany({
    where: { modelType: { in: ["303", "130"] }, result: { gt: 0 } },
    select: {
      id: true,
      periodKey: true,
      modelType: true,
      year: true,
      quarter: true,
      result: true,
    },
  });
  function r2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  let linked = 0;
  for (const p of orphans) {
    const key = r2(Number(p.amount)).toFixed(2);
    const matches = filings.filter(
      (f) => r2(Number(f.result)).toFixed(2) === key
    );
    if (matches.length !== 1) continue;
    const f = matches[0];
    await prisma.taxPayment.update({
      where: { id: p.id },
      data: {
        modelType: p.modelType ?? f.modelType,
        year: f.year,
        quarter: f.quarter,
        filingId: p.filingId ?? f.id,
      },
    });
    linked += 1;
    console.log(`  link ${key}€ → ${f.periodKey}`);
  }
  console.log(`Enlazados a presentados: ${linked}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
