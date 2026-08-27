/**
 * Fase 13 — auditoría Shopify/Apple 2T 2026 + simulación A→I (sin persistir).
 */
import { prisma } from "../lib/prisma";
import { quarterRange, type FiscalQuarter } from "../lib/fiscal";
import { EXPENSE_FISCAL_SELECT } from "../lib/fiscal-expense-select";
import { aggregateModel303Period } from "../lib/modelo-303";
import { buildModelo349Draft } from "../lib/fiscal-347-349";
import { resolve349KeyFromPurchase } from "../lib/modelo-349/keys";

const YEAR = 2026;
const Q = 2 as FiscalQuarter;

async function main() {
  const { from, to } = quarterRange(YEAR, Q);
  const rows = await prisma.expense.findMany({
    where: {
      issueDate: { gte: from, lte: to },
      OR: [
        { supplierName: { contains: "Shopify", mode: "insensitive" } },
        { supplierName: { contains: "Apple", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      supplierName: true,
      supplierNif: true,
      invoiceNumber: true,
      issueDate: true,
      description: true,
      category: true,
      subtotal: true,
      vatAmount: true,
      total: true,
      vatOperationType: true,
      notes: true,
      documentId: true,
      document: {
        select: {
          id: true,
          sourceFileName: true,
          mimeType: true,
          blobUrl: true,
          pathname: true,
        },
      },
    },
    orderBy: { issueDate: "asc" },
  });

  console.log("=== SHOPIFY / APPLE 2T 2026 ===");
  for (const r of rows) {
    const re = null;
    console.log(
      JSON.stringify(
        {
          id: r.id,
          supplierName: r.supplierName,
          supplierNif: r.supplierNif,
          invoiceNumber: r.invoiceNumber,
          issueDate: r.issueDate?.toISOString().slice(0, 10),
          description: r.description,
          category: r.category,
          subtotal: Number(r.subtotal),
          vatAmount: Number(r.vatAmount),
          total: Number(r.total),
          vatOperationType: r.vatOperationType,
          notes: typeof r.notes === "string" ? r.notes.slice(0, 300) : r.notes,
          documentId: r.documentId,
          document: r.document,
          hasRawExtract: false,
          rawKeys: [],
        },
        null,
        2
      )
    );
  }

  const intra = rows.filter((r) =>
    ["INTRACOMUNITARIA", "SERVICIO_INTRACOMUNITARIO"].includes(
      String(r.vatOperationType)
    )
  );
  console.log("\n=== INTRACOM count", intra.length);

  // Simulation: reclassify SOFTWARE+INTRACOMUNITARIA Shopify → SERVICIO_INTRACOMUNITARIO
  const shopifyIds = new Set(
    rows
      .filter(
        (r) =>
          String(r.supplierName).toLowerCase().includes("shopify") &&
          r.vatOperationType === "INTRACOMUNITARIA" &&
          r.category === "SOFTWARE"
      )
      .map((r) => r.id)
  );

  const expenses = await prisma.expense.findMany({
    where: { issueDate: { gte: from, lte: to } },
    select: EXPENSE_FISCAL_SELECT,
  });

  // Simulación delta solo sobre gastos (Shopify A→I); invoices vacíos para aislar impacto.
  const mapExp = (reclassify: boolean) =>
    expenses.map((e) => ({
      ...e,
      vatOperationType:
        reclassify && shopifyIds.has(e.id)
          ? "SERVICIO_INTRACOMUNITARIO"
          : e.vatOperationType,
    }));

  const before303 = aggregateModel303Period({
    invoices: [],
    marketplace: [],
    assets: [],
    expenses: mapExp(false),
    from,
    to,
  });
  const after303 = aggregateModel303Period({
    invoices: [],
    marketplace: [],
    assets: [],
    expenses: mapExp(true),
    from,
    to,
  });

  const b = before303.modelo303.boxes;
  const a = after303.modelo303.boxes;
  console.log("\n=== 303 SIM (Shopify A→I) ===");
  for (const k of [
    "box10",
    "box11",
    "box26",
    "box36",
    "box45",
    "box46",
    "box69",
    "box71",
  ] as const) {
    console.log(
      k,
      "ANTES",
      (b as Record<string, number>)[k],
      "DESPUÉS",
      (a as Record<string, number>)[k],
      "DELTA",
      Number(
        (
          ((a as Record<string, number>)[k] ?? 0) -
          ((b as Record<string, number>)[k] ?? 0)
        ).toFixed(2)
      )
    );
  }

  const draft349 = await buildModelo349Draft(YEAR, Q);
  console.log("\n=== 349 BEFORE (live) ===");
  console.log({
    totalBase: (draft349 as { totalBase?: number }).totalBase,
    operators:
      (draft349 as { operators?: unknown[] }).operators?.length ??
      (draft349 as { lines?: unknown[] }).lines?.length,
    byKey:
      (draft349 as { summaryByKey?: unknown }).summaryByKey ??
      (draft349 as { keys?: unknown }).keys,
  });

  function keyFor(op: string | null | undefined): string | null {
    return resolve349KeyFromPurchase(op ?? "INTERIOR");
  }

  const sumKeys = (list: typeof expenses, reclass: boolean) => {
    const m: Record<string, number> = { A: 0, I: 0 };
    for (const e of list) {
      const op =
        reclass && shopifyIds.has(e.id)
          ? "SERVICIO_INTRACOMUNITARIO"
          : e.vatOperationType;
      const k = keyFor(op);
      if (k === "A" || k === "I") {
        m[k] += Number(e.subtotal) || 0;
      }
    }
    return m;
  };

  const keysBefore = sumKeys(expenses, false);
  const keysAfter = sumKeys(expenses, true);
  console.log("\n=== 349 KEY BASES (expense purchase only, approx) ===");
  console.log("ANTES", keysBefore);
  console.log("DESPUÉS", keysAfter);
  console.log("DELTA A", +(keysAfter.A - keysBefore.A).toFixed(2));
  console.log("DELTA I", +(keysAfter.I - keysBefore.I).toFixed(2));
  console.log("Shopify reclass IDs", [...shopifyIds]);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
