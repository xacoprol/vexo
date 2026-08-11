/**
 * Valida el caso Ritmos: cron simulado en 2026-06-01 genera proforma exenta 90€.
 * Usage: npx tsx scripts/test-ritmos-cron.ts
 */
import { PrismaClient } from "@prisma/client";
import { calculateDocument } from "../lib/calculations";
import { allocateQuoteNumber } from "../lib/numbering";
import { advanceDate, type Frequency } from "../lib/recurring";

const prisma = new PrismaClient();

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const asOfKey = "2026-06-01";

  const candidates = await prisma.recurringInvoiceTemplate.findMany({
    where: { status: "ACTIVA", name: { contains: "bellux" }, nextRunDate: { not: null } },
    include: { lines: { orderBy: { sortOrder: "asc" } }, client: true },
  });

  const tpl = candidates.find(
    (t) => t.nextRunDate && dayKey(t.nextRunDate) <= asOfKey
  );

  if (!tpl) {
    throw new Error(
      "Plantilla bellux no encontrada o nextRunDate > 2026-06-01. Ejecuta el seed."
    );
  }

  console.log("Plantilla:", tpl.name);
  console.log("  cliente:", tpl.client.name, tpl.client.nif, tpl.client.countryCode);
  console.log("  nextRun:", dayKey(tpl.nextRunDate!));
  console.log("  vatOp:", tpl.vatOperationType, "cash:", tpl.cashAccounting);

  const lineInputs = tpl.lines.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    vatRate: 0,
    discountPct: l.discountPct,
  }));
  // Proforma: sin IRPF (se aplica al convertir a factura)
  const totals = calculateDocument(lineInputs, 0);
  console.log("Totales calculados:", {
    subtotal: totals.subtotal,
    vatAmount: totals.vatAmount,
    total: totals.total,
  });

  if (totals.subtotal !== 90 || totals.vatAmount !== 0 || totals.total !== 90) {
    throw new Error(
      `Totales incorrectos: esperado 90/0/90, got ${totals.subtotal}/${totals.vatAmount}/${totals.total}`
    );
  }

  const existing = await prisma.quote.findFirst({
    where: { recurringTemplateId: tpl.id },
    orderBy: { issueDate: "desc" },
  });
  if (existing && dayKey(existing.issueDate) === "2026-06-01") {
    console.log("Proforma ya existía:", existing.fullNumber);
    console.log(
      "  base",
      Number(existing.subtotal),
      "IVA",
      Number(existing.vatAmount),
      "total",
      Number(existing.total)
    );
    console.log("OK ✓");
    return;
  }

  const issueDate = new Date(2026, 5, 1, 12, 0, 0, 0);
  const validUntil = new Date(issueDate);
  validUntil.setDate(validUntil.getDate() + 30);

  const quote = await prisma.$transaction(async (tx) => {
    const num = await allocateQuoteNumber(tx);
    const q = await tx.quote.create({
      data: {
        seriesId: num.seriesId,
        seriesPrefix: num.seriesPrefix,
        number: num.number,
        fullNumber: num.fullNumber,
        clientId: tpl.clientId,
        issueDate,
        validUntil,
        status: "BORRADOR",
        isProforma: true,
        notes: `Generada automáticamente desde periódica «${tpl.name}»`,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        recurringTemplateId: tpl.id,
        lines: {
          create: totals.lines.map((l) => ({
            sortOrder: l.sortOrder,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            discountPct: l.discountPct,
            lineSubtotal: l.lineSubtotal,
            lineVat: l.lineVat,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });

    const nextRun = advanceDate(
      issueDate,
      tpl.frequency as Frequency,
      tpl.dayOfMonth,
      tpl.intervalCount
    );
    await tx.recurringInvoiceTemplate.update({
      where: { id: tpl.id },
      data: { lastRunAt: new Date(), nextRunDate: nextRun },
    });
    return q;
  });

  const updated = await prisma.recurringInvoiceTemplate.findUnique({
    where: { id: tpl.id },
  });

  console.log("Proforma generada:", quote.fullNumber);
  console.log(
    "  base",
    Number(quote.subtotal),
    "IVA",
    Number(quote.vatAmount),
    "total",
    Number(quote.total)
  );
  console.log("  isProforma", quote.isProforma);
  console.log("  recurringTemplateId", quote.recurringTemplateId);
  console.log("  nextRun avanzado a", dayKey(updated!.nextRunDate!));
  if (dayKey(updated!.nextRunDate!) !== "2027-06-01") {
    throw new Error(`nextRun esperado 2027-06-01, got ${dayKey(updated!.nextRunDate!)}`);
  }
  console.log("OK ✓ caso Ritmos validado (proforma)");
}

main()
  .catch((e) => {
    console.error("FAIL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
