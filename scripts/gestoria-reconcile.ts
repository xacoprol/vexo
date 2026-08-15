/**
 * Mantenimiento fiscal post-import gestoría:
 * 1) Borra bienes fantasma (filas "Total Período/Facturas" del Excel BIENES)
 * 2) Informe: libro GASTOS vs Expenses vs 303 presentado (por trimestre)
 *
 * Uso:
 *   npx tsx scripts/gestoria-reconcile.ts
 *   npx tsx scripts/gestoria-reconcile.ts --clean-phantoms
 *   npx tsx scripts/gestoria-reconcile.ts --year=2026 --quarter=2
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";

const root = process.cwd();
if (existsSync(path.join(root, ".env"))) loadEnv({ path: path.join(root, ".env") });
if (existsSync(path.join(root, ".env.local"))) {
  loadEnv({ path: path.join(root, ".env.local"), override: true });
}

import { prisma } from "../lib/prisma";
import { getPresentedFiling } from "../lib/fiscal-filings";
import { buildFiscalPeriodSummary, type FiscalQuarter } from "../lib/fiscal";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function argFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | null {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : null;
}

function isEuNif(nif: string) {
  return /^(DE|FR|NL|IE|LU|IT|PT|BE|AT|PL|CZ|SE|DK|FI|HU|RO|BG|HR|SI|SK|LT|LV|EE|CY|MT|GR)/.test(
    nif
  );
}

function quarterRange(year: number, q: FiscalQuarter) {
  const from = new Date(year, (q - 1) * 3, 1);
  const to = new Date(year, q * 3, 0, 23, 59, 59, 999);
  return { from, to };
}

async function cleanPhantoms() {
  const phantoms = await prisma.investmentAsset.findMany({
    where: {
      OR: [
        { supplierName: { contains: "Total Período", mode: "insensitive" } },
        { supplierName: { contains: "Total Periodo", mode: "insensitive" } },
        { supplierName: { contains: "Total Facturas", mode: "insensitive" } },
        {
          AND: [
            { description: { equals: "Bien de inversión", mode: "insensitive" } },
            { purchaseDate: null },
            { invoiceNumber: null },
          ],
        },
      ],
    },
  });
  console.log(`Bienes fantasma encontrados: ${phantoms.length}`);
  for (const p of phantoms) {
    console.log(
      `  - ${p.supplierName ?? "—"} · base ${Number(p.base)} · ${p.id}`
    );
  }
  if (!phantoms.length) return 0;
  const res = await prisma.investmentAsset.deleteMany({
    where: { id: { in: phantoms.map((p) => p.id) } },
  });
  console.log(`Borrados: ${res.count}`);
  return res.count;
}

async function reportQuarter(year: number, quarter: FiscalQuarter) {
  const { from, to } = quarterRange(year, quarter);
  const [book, expenses, presented, draft] = await Promise.all([
    prisma.registerBook.findFirst({
      where: { year, bookType: "GASTOS" },
      include: { lines: true },
    }),
    prisma.expense.findMany({
      where: { issueDate: { gte: from, lte: to } },
      orderBy: { issueDate: "asc" },
    }),
    getPresentedFiling("303", year, quarter),
    buildFiscalPeriodSummary(year, quarter),
  ]);

  const lines = (book?.lines ?? []).filter(
    (l) => l.issueDate && l.issueDate >= from && l.issueDate <= to
  );

  let interiorVat = 0;
  let aibBase = 0;
  const aibLines: {
    date: string;
    who: string;
    nif: string;
    base: number;
    inv: string | null;
  }[] = [];

  for (const l of lines) {
    const base = Number(l.base);
    const vat = Number(l.vatAmount);
    const nif = (l.nif ?? "").toUpperCase().replace(/\s/g, "");
    const c = (l.counterparty ?? "").toUpperCase();
    if (vat !== 0) {
      interiorVat += vat;
      continue;
    }
    const looksUe =
      isEuNif(nif) ||
      c.includes("MAKEBLOCK") ||
      c.includes("BAMBU") ||
      c.includes("SHOPIFY INTERNATIONAL") ||
      c.includes("PIXART");
    if (looksUe) {
      aibBase += base;
      aibLines.push({
        date: l.issueDate!.toISOString().slice(0, 10),
        who: (l.counterparty ?? "").slice(0, 40),
        nif: nif || "—",
        base: round2(base),
        inv: l.invoiceNumber,
      });
    }
  }

  const pb = Object.fromEntries(
    (presented?.boxes ?? []).map((b) => [b.code, b.value])
  );
  const db = Object.fromEntries(
    draft.modelo303.boxes.map((b) => [b.code, b.value])
  );

  console.log(`\n=== ${quarter}T ${year} · cruce libro / Vexo / 303 presentado ===`);
  console.log({
    libroLineas: lines.length,
    expensesVexo: expenses.length,
    expensesConPdf: expenses.filter((e) => e.documentId).length,
    libroIvaInterior: round2(interiorVat),
    libroAibCandidato: round2(aibBase),
    presentado29: pb["29"] ?? null,
    presentado10: pb["10"] ?? null,
    presentado45: pb["45"] ?? null,
    presentadoResult: presented?.result ?? null,
    borrador29: db["29"] ?? null,
    borrador10: db["10"] ?? null,
    borradorResult: draft.modelo303.result,
  });

  if (presented) {
    console.log("Δ IVA 29 (libro − presentado):", round2(interiorVat - (pb["29"] ?? 0)));
    console.log(
      "Δ AIB 10 (libro UE IVA0 − presentado):",
      round2(aibBase - (pb["10"] ?? 0))
    );
    console.log(
      "Δ resultado (borrador − presentado):",
      round2(draft.modelo303.result - presented.result)
    );
  } else {
    console.log("No hay 303 presentado para este periodo.");
  }

  if (aibLines.length) {
    console.log("\nLíneas libro con pinta de AIB (IVA 0 + UE):");
    for (const a of aibLines) {
      const inPresented =
        presented && Math.abs(a.base - (pb["10"] ?? 0)) < 0.05
          ? " (¿solo esta en casilla 10?)"
          : "";
      console.log(
        `  ${a.date}  ${a.base.toFixed(2).padStart(8)}  ${a.who}  ${a.nif}  ${a.inv ?? ""}${inPresented}`
      );
    }
  }

  const assets = await prisma.investmentAsset.findMany({
    select: {
      description: true,
      supplierName: true,
      purchaseDate: true,
      base: true,
      invoiceNumber: true,
    },
    orderBy: { purchaseDate: "asc" },
  });
  console.log(`\nBienes de inversión actuales: ${assets.length}`);
  for (const a of assets) {
    console.log(
      `  ${a.purchaseDate?.toISOString().slice(0, 10) ?? "sin fecha"}  ${Number(a.base)}  ${a.description}  ${a.supplierName ?? ""}  ${a.invoiceNumber ?? ""}`
    );
  }
}

async function main() {
  const year = parseInt(argValue("year") ?? "2026", 10);
  const quarter = parseInt(argValue("quarter") ?? "2", 10) as FiscalQuarter;
  if (![1, 2, 3, 4].includes(quarter)) {
    throw new Error("--quarter debe ser 1–4");
  }

  if (argFlag("clean-phantoms")) {
    await cleanPhantoms();
  }

  await reportQuarter(year, quarter);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
