/**
 * Fase 11 — Health + close + reconciliación temporal 2T 2026.
 * Read-only sobre datos (no muta gastos). No commit.
 */
import { prisma } from "../lib/prisma";
import { quarterRange, yearRange, type FiscalQuarter } from "../lib/fiscal";
import { buildFiscalHealthCheck } from "../lib/fiscal-health";
import { buildFiscalPeriodValidation } from "../lib/fiscal-validation";
import { buildFiscalPeriodSummary } from "../lib/fiscal";
import { getPresentedFiling } from "../lib/fiscal-filings";
import { buildModelo349Draft } from "../lib/fiscal-347-349";
import { buildModelo111Draft } from "../lib/modelo-111";
import { buildModelo115Draft } from "../lib/modelo-115";
import { round2 } from "../lib/modelo-390/money";
import { aggregateIrpfIncome } from "../lib/modelo-130/irpf-income";
import { aggregateIrpfExpenses } from "../lib/modelo-130/irpf-expenses";
import { amortizationYtdThroughQuarter } from "../lib/investment-amortization";
import { FISCAL_STATUS } from "../lib/invoice-fiscal-lifecycle";
import { marketplaceIncomeNotInvoicedWhere } from "../lib/marketplace-income-storage";
import { EXPENSE_FISCAL_SELECT } from "../lib/fiscal-expense-select";

const YEAR = 2026;
const Q = 2 as FiscalQuarter;

function summarizeIssue(i: {
  code: string;
  severity: string;
  title: string;
  blocksFiling?: boolean;
  model?: string;
}) {
  return {
    code: i.code,
    severity: i.severity,
    title: i.title,
    blocksFiling: i.blocksFiling ?? false,
    model: i.model,
  };
}

async function main() {
  const { from, to } = quarterRange(YEAR, Q);
  const yFrom = yearRange(YEAR).from;

  // ── PASO 3: Health ──────────────────────────────────────────────
  console.log("\n========== PASO 3: FISCAL HEALTH ==========");
  const health = await buildFiscalHealthCheck({ year: YEAR, quarter: Q });
  const blockers = health.blockers.map(summarizeIssue);
  const warnings = health.issues
    .filter((i) => i.severity === "WARNING")
    .map(summarizeIssue);
  const info = health.issues
    .filter((i) => i.severity === "INFO")
    .map(summarizeIssue);
  const errors = health.issues
    .filter((i) => i.severity === "ERROR" || i.severity === "CRITICAL")
    .map(summarizeIssue);

  console.log(
    JSON.stringify(
      {
        status: health.status,
        statusLabel: health.statusLabel,
        summary: health.summary,
        nif: (await prisma.companySettings.findFirst({ select: { nif: true } }))
          ?.nif,
        blockers,
        errors,
        warnings: warnings.slice(0, 40),
        warningCount: warnings.length,
        info: info.slice(0, 20),
        infoCount: info.length,
        modelStatuses: health.modelStatuses,
        queryCount: health.queryCount,
      },
      null,
      2
    )
  );

  // ── PASO 4: Close ───────────────────────────────────────────────
  console.log("\n========== PASO 4: /fiscal/close ==========");
  const close = await buildFiscalPeriodValidation({ year: YEAR, quarter: Q });
  console.log(
    JSON.stringify(
      {
        readiness: close.readiness,
        lifecycle: close.lifecycle,
        reconciliation: {
          status: close.reconciliation.status,
          issueCount: close.reconciliation.issues.length,
          issues: close.reconciliation.issues.slice(0, 30).map((i) => ({
            code: i.code,
            title: i.title,
            severity: i.severity,
          })),
        },
        obligations: close.obligations.obligations
          .filter(
            (o) =>
              o.period.quarter === Q ||
              ["111", "115", "130", "303", "349"].includes(o.model)
          )
          .map((o) => ({
            model: o.model,
            period: o.period,
            obligation: o.obligation,
            filingStatus: o.filingStatus,
            reason: o.reason,
            reasonCodes: o.reasonCodes,
            operationsSignal: o.operationsSignal,
            blockers: o.blockers?.slice?.(0, 5),
            warnings: o.warnings?.slice?.(0, 5),
          })),
        models: close.models.map((m) => ({
          model: m.model,
          obligationStatus: m.obligationStatus,
          operationsSignal: m.operationsSignal,
          filingStatus: m.filingStatus,
          readyToFile: m.readyToFile,
          engineResult: m.engineResult,
          presentedResult: m.presentedResult,
          difference: m.difference,
          differenceKind: m.differenceKind,
          reconciliationStatus: m.reconciliationStatus,
          snapshotAvailable: m.snapshotAvailable,
          blockers: m.blockers?.slice?.(0, 8),
          warnings: m.warnings?.slice?.(0, 8),
          notes: m.notes?.slice?.(0, 5),
        })),
      },
      null,
      2
    )
  );

  // ── PASO 5+6: Libro temporal + AIB ───────────────────────────────
  console.log("\n========== PASO 5-6: LIBRO TEMPORAL + AIB ==========");
  const filings = await prisma.fiscalFiling.findMany({
    where: { year: YEAR, quarter: Q, modelType: { in: ["130", "303", "349"] } },
    select: {
      modelType: true,
      filedAt: true,
      createdAt: true,
      result: true,
      sourceFileName: true,
    },
  });
  console.log("filings meta", JSON.stringify(filings, null, 2));

  // Fecha de presentación: filedAt del 303 (o min filedAt)
  const filedAts = filings
    .map((f) => f.filedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const presentationCutoff = filedAts[0] ?? filings[0]?.createdAt ?? null;
  console.log("presentationCutoff (min filedAt)", presentationCutoff);

  const expensesQ = await prisma.expense.findMany({
    where: { issueDate: { gte: from, lte: to } },
    select: {
      id: true,
      supplierName: true,
      supplierNif: true,
      issueDate: true,
      subtotal: true,
      vatAmount: true,
      total: true,
      vatOperationType: true,
      category: true,
      deductible: true,
      vatDeductiblePct: true,
      irpfDeductiblePct: true,
      isInvestment: true,
      description: true,
      documentId: true,
      createdAt: true,
      updatedAt: true,
      practicedWithholdingStatus: true,
      leaseId: true,
    },
    orderBy: { issueDate: "asc" },
  });

  const intra = expensesQ.filter(
    (e) => String(e.vatOperationType).toUpperCase() === "INTRACOMUNITARIA"
  );

  const ocrOperator = "Bambulab";
  const aibTable = intra.map((e) => {
    const existedBeforeFiling =
      presentationCutoff != null ? e.createdAt < presentationCutoff : null;
    const inOcr =
      (e.supplierName ?? "").toLowerCase().includes("bambulab") &&
      moneyClose(Number(e.subtotal), 104.09);
    let classification:
      | "CORRECTAMENTE INTRACOMUNITARIA"
      | "POSIBLEMENTE MAL CLASIFICADO"
      | "AÑADIDO DESPUÉS DEL FILING"
      | "NECESITA REVISIÓN MANUAL" = "NECESITA REVISIÓN MANUAL";

    const name = (e.supplierName ?? "").toLowerCase();
    const desc = (e.description ?? "").toLowerCase();
    const looksService =
      /shopify|apple|suscrip|saas|software|hosting|cloud/.test(name + " " + desc);
    const looksGoods =
      /bambulab|pixart|makeblock|xtool|filament|flyer|tarjeta|material|impresora|laser/.test(
        name + " " + desc
      );

    if (existedBeforeFiling === false) {
      classification = "AÑADIDO DESPUÉS DEL FILING";
    } else if (looksService) {
      classification = "POSIBLEMENTE MAL CLASIFICADO";
    } else if (looksGoods || inOcr) {
      classification = "CORRECTAMENTE INTRACOMUNITARIA";
    }

    return {
      id: e.id,
      supplier: e.supplierName,
      vatId: e.supplierNif,
      issueDate: e.issueDate,
      createdAt: e.createdAt,
      base: Number(e.subtotal),
      vat: Number(e.vatAmount),
      total: Number(e.total),
      type: e.vatOperationType,
      description: e.description,
      entra303: true,
      entra349: true,
      existedBeforeFiling,
      inOcrGestoría: inOcr,
      classification,
    };
  });

  const universeA = {
    label: "Libro fiscal actual (issueDate in 2T)",
    count: expensesQ.length,
    baseSum: round2(expensesQ.reduce((s, e) => s + Number(e.subtotal), 0)),
    intraCount: intra.length,
    intraBase: round2(intra.reduce((s, e) => s + Number(e.subtotal), 0)),
  };
  const before = expensesQ.filter(
    (e) => presentationCutoff != null && e.createdAt < presentationCutoff
  );
  const after = expensesQ.filter(
    (e) => presentationCutoff != null && e.createdAt >= presentationCutoff
  );
  const universeB = {
    label: "Snapshot temporal (createdAt < filedAt min)",
    cutoff: presentationCutoff,
    count: before.length,
    baseSum: round2(before.reduce((s, e) => s + Number(e.subtotal), 0)),
    intraCount: before.filter(
      (e) => String(e.vatOperationType).toUpperCase() === "INTRACOMUNITARIA"
    ).length,
    intraBase: round2(
      before
        .filter(
          (e) => String(e.vatOperationType).toUpperCase() === "INTRACOMUNITARIA"
        )
        .reduce((s, e) => s + Number(e.subtotal), 0)
    ),
  };

  console.log(
    JSON.stringify(
      {
        universeA,
        universeB,
        afterCutoff: {
          count: after.length,
          baseSum: round2(after.reduce((s, e) => s + Number(e.subtotal), 0)),
          intraBase: round2(
            after
              .filter(
                (e) =>
                  String(e.vatOperationType).toUpperCase() === "INTRACOMUNITARIA"
              )
              .reduce((s, e) => s + Number(e.subtotal), 0)
          ),
        },
        aibOperators: aibTable,
        aibSum: round2(aibTable.reduce((s, r) => s + r.base, 0)),
        aibBeyondOcr: round2(
          aibTable.filter((r) => !r.inOcrGestoría).reduce((s, r) => s + r.base, 0)
        ),
      },
      null,
      2
    )
  );

  // ── PASO 7: 130 breakdown ───────────────────────────────────────
  console.log("\n========== PASO 7: MODELO 130 ==========");
  const summary = await buildFiscalPeriodSummary(YEAR, Q);
  const m130 = summary.modelo130;
  const p130 = await getPresentedFiling("130", YEAR, Q);
  const ocr130 = Array.isArray((p130?.rawExtract as { boxes?: unknown })?.boxes)
    ? ((p130!.rawExtract as { boxes: { code: string; value: number }[] }).boxes)
    : p130?.boxes ?? [];

  const [invoices, expensesYtd, marketplace, amortDb] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: yFrom, lte: to },
      },
      select: {
        id: true,
        fullNumber: true,
        issueDate: true,
        subtotal: true,
        irpfAmount: true,
        status: true,
        fiscalStatus: true,
        cashAccounting: true,
      },
    }),
    prisma.expense.findMany({
      where: { issueDate: { gte: yFrom, lte: to } },
      select: {
        ...EXPENSE_FISCAL_SELECT,
        createdAt: true,
        supplierName: true,
        description: true,
        isInvestment: true,
        deductible: true,
        irpfDeductiblePct: true,
        subtotal: true,
        issueDate: true,
        id: true,
      },
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: yFrom, lte: to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
      select: {
        id: true,
        issueDate: true,
        subtotal: true,
        channel: true,
        orderId: true,
        invoiceId: true,
        createdAt: true,
      },
    }),
    prisma.investmentAmortization.findMany({
      where: { year: YEAR },
      select: {
        amount: true,
        asset: {
          select: {
            id: true,
            description: true,
            purchaseDate: true,
            startYear: true,
            usefulLifeYears: true,
          },
        },
      },
    }),
  ]);

  const inc = aggregateIrpfIncome({
    invoices,
    marketplace,
    from: yFrom,
    to,
  });
  const exp = aggregateIrpfExpenses({
    expenses: expensesYtd as never,
    from: yFrom,
    to,
  });
  let amortYtd = 0;
  const amortLines: { label: string; amount: number }[] = [];
  for (const r of amortDb) {
    const amount = amortizationYtdThroughQuarter(
      {
        yearAmount: Number(r.amount),
        purchaseDate: r.asset.purchaseDate,
        startYear: r.asset.startYear,
        usefulLifeYears: r.asset.usefulLifeYears,
      },
      YEAR,
      Q
    );
    if (amount > 0) {
      amortYtd = round2(amortYtd + amount);
      amortLines.push({
        label: r.asset.description,
        amount,
      });
    }
  }

  const ocrBox = (code: string) => {
    const b = ocr130.find((x) => String(x.code) === code || String(x.code) === code.replace(/^0/, ""));
    return b != null ? Number(b.value) : null;
  };

  // Ranking gastos: mayores partidas ordinarias
  const ordinaryLines = [...exp.lines].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
  );

  console.log(
    JSON.stringify(
      {
        vexo: {
          box01: m130?.boxes?.find?.((b: { code: string }) => b.code === "01")?.value
            ?? (m130 as { result?: number })?.result,
          boxes: Array.isArray(m130?.boxes) ? m130.boxes : null,
          result: m130?.result,
          income: inc.total,
          ordinaryExpenses: exp.ordinaryBase,
          amortYtd,
          expensesPlusAmort: round2(exp.ordinaryBase + amortYtd),
          incomeBySource: inc.lines.reduce(
            (m, l) => {
              m[l.sourceType] = round2((m[l.sourceType] ?? 0) + l.amount);
              return m;
            },
            {} as Record<string, number>
          ),
          amortLines,
          topExpenses: ordinaryLines.slice(0, 25).map((l) => ({
            type: l.sourceType,
            desc: l.description,
            amount: l.amount,
            id: l.sourceId,
          })),
        },
        ocr: {
          result: p130?.result,
          box01: ocrBox("01"),
          box02: ocrBox("02"),
          box03: ocrBox("03"),
          box04: ocrBox("04"),
          box05: ocrBox("05"),
          box06: ocrBox("06"),
          box07: ocrBox("07"),
          box19: ocrBox("19"),
        },
        deltas: {
          income: round2(inc.total - (ocrBox("01") ?? 0)),
          expensesPlusAmort: round2(
            exp.ordinaryBase + amortYtd - (ocrBox("02") ?? 0)
          ),
          result: round2((m130?.result ?? 0) - (p130?.result ?? 0)),
        },
        note:
          "Gap gastos vs gestoría = dato/libro, no fórmula. Ingresos gap ~marketplace/facturas.",
      },
      null,
      2
    )
  );

  // ── PASO 8: Censo ───────────────────────────────────────────────
  console.log("\n========== PASO 8: CONFIG CENSAL ==========");
  const settings = await prisma.companySettings.findFirst();
  const censusKeys = [
    "previousYearNetIncome130Mode",
    "previousYearNetIncomeFor130Reduction",
    "paysProfessionalsSubjectToWithholding",
    "censusModel111",
    "model111Periodicity",
    "censusModel115",
    "model115Periodicity",
    "censusModel130",
    "censusModel303",
    "censusModel349",
    "censusModel180",
    "censusModel190",
    "hasEmployees",
    "rentsBusinessPremises",
    "businessRentSubjectToWithholding",
    "activityStartYear",
    "activityKind130",
    "fiscalRegime",
    "censusSource",
  ] as const;
  const census: Record<string, unknown> = {};
  for (const k of censusKeys) {
    const v = (settings as Record<string, unknown> | null)?.[k];
    const pending =
      v == null ||
      v === "UNKNOWN" ||
      (typeof v === "string" && v.toUpperCase() === "UNKNOWN");
    census[k] = {
      value: v ?? null,
      status: pending ? "CONFIGURACIÓN CENSAL PENDIENTE" : "SET",
    };
  }
  const leaseCount = await prisma.businessPremisesLease.count();
  const whCount = await prisma.fiscalWithholding.count();
  console.log(
    JSON.stringify({ census, leaseCount, withholdingCount: whCount }, null, 2)
  );

  // ── PASO 9: 111 / 115 ───────────────────────────────────────────
  console.log("\n========== PASO 9: MODELOS 111 / 115 ==========");
  const m111 = await buildModelo111Draft(YEAR, Q);
  const m115 = await buildModelo115Draft(YEAR, Q);
  console.log(
    JSON.stringify(
      {
        model111: {
          period: m111.period,
          filingObligation: m111.filingObligation,
          result: m111.result,
          boxes: m111.boxes,
          warnings: m111.warnings,
          rowCount: (m111 as { rows?: unknown[] }).rows?.length ?? (m111 as { withholdings?: unknown[] }).withholdings?.length ?? null,
          scopeNote: m111.scopeNote,
          keys: Object.keys(m111),
        },
        model115: {
          period: m115.period,
          filingObligation: m115.filingObligation,
          result: m115.result,
          boxes: m115.boxes,
          warnings: m115.warnings,
          rowCount: (m115 as { rows?: unknown[] }).rows?.length ?? null,
          leaseCount: (m115 as { leases?: unknown[] }).leases?.length ?? null,
          scopeNote: m115.scopeNote,
          keys: Object.keys(m115),
        },
      },
      null,
      2
    )
  );

  // ── 349 draft ops ───────────────────────────────────────────────
  const d349 = await buildModelo349Draft(YEAR, Q);
  console.log("\n========== 349 DRAFT ==========");
  console.log(
    JSON.stringify(
      {
        hasOps: d349.hasOps,
        totalsByKey: d349.totalsByKey,
        ops: d349.operations?.map((o) => ({
          key: o.key,
          vatId: o.vatId,
          name: o.operatorName,
          amount: o.amount,
        })),
      },
      null,
      2
    )
  );

  // ── 303 engine vs presented (from summary) ──────────────────────
  console.log("\n========== 303 / 130 ENGINE RESULTS ==========");
  console.log(
    JSON.stringify(
      {
        m130result: summary.modelo130?.result,
        m303result: summary.modelo303?.result,
        m303boxes: summary.modelo303?.boxes?.filter?.((b: { code: string }) =>
          ["07", "09", "10", "11", "27", "28", "29", "45", "46", "71"].includes(
            b.code
          )
        ),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

function moneyClose(a: number, b: number, tol = 0.02) {
  return Math.abs(a - b) <= tol;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
