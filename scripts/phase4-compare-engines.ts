/**
 * Fase 4 — comparación motor vs filings 2T (read-only).
 */
import { config as loadEnv } from "dotenv";
import { existsSync, writeFileSync } from "fs";
import path from "path";

const root = process.cwd();
if (existsSync(path.join(root, ".env"))) loadEnv({ path: path.join(root, ".env") });
if (existsSync(path.join(root, ".env.local")))
  loadEnv({ path: path.join(root, ".env.local"), override: true });

import { prisma } from "../lib/prisma";
import { quarterRange, yearRange, type FiscalQuarter } from "../lib/fiscal";
import { FISCAL_STATUS } from "../lib/invoice-fiscal-lifecycle";
import { EXPENSE_FISCAL_SELECT } from "../lib/fiscal-expense-select";
import { marketplaceIncomeNotInvoicedWhere } from "../lib/marketplace-income-storage";
import { buildModel303ChainFromRows } from "../lib/modelo-303/aggregate";
import { assembleModel130Chain } from "../lib/modelo-130/assemble";
import { presentedQuarterFromFiling } from "../lib/modelo-130/engine";
import { buildModelo349Draft } from "../lib/fiscal-347-349";
import { getPresentedFiling } from "../lib/fiscal-filings";
import { fiscalFilingPeriodKey } from "../lib/gemini-fiscal-filing";
import { round2 } from "../lib/modelo-390/money";
import type { Model130Config } from "../lib/modelo-130/types";
import { parsePurchaseVatKind, parseSalesVatKind } from "../lib/modelo-303/vat-classification";
import { adapt303Obligation } from "../lib/fiscal-obligations/adapters/model-303";
import { adapt130Obligation } from "../lib/fiscal-obligations/adapters/model-130";
import { adapt349Obligation } from "../lib/fiscal-obligations/adapters/model-349";
import { adapt111Obligation } from "../lib/fiscal-obligations/adapters/model-111";
import { adapt115Obligation } from "../lib/fiscal-obligations/adapters/model-115";
import { buildFiscalCensusProfileFromSettings } from "../lib/fiscal-obligations";

const YEAR = 2026;
const Q = 2 as FiscalQuarter;

function carryFromPresented303(presented: { result: unknown; boxes: unknown }): number {
  const boxes = Array.isArray(presented.boxes)
    ? (presented.boxes as { code: string; value: number }[])
    : [];
  const b87 = boxes.find((b) => String(b.code) === "87" || String(b.code) === "087");
  if (b87 != null && Number.isFinite(Number(b87.value))) {
    return round2(Math.max(0, Number(b87.value)));
  }
  const result = Number(presented.result) || 0;
  return result < 0 ? round2(Math.abs(result)) : 0;
}

async function main() {
  const { from, to } = quarterRange(YEAR, Q);
  const yFrom = yearRange(YEAR).from;

  const [invoices, expenses, marketplace, assets, amortRows] = await Promise.all([
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
        vatAmount: true,
        irpfAmount: true,
        status: true,
        fiscalStatus: true,
        cashAccounting: true,
        vatOperationType: true,
        invoiceFiscalType: true,
        rectificationType: true,
        rectifiesInvoiceId: true,
        rectifiesInvoice: { select: { fullNumber: true } },
        client: { select: { name: true, nif: true, countryCode: true } },
        lines: { select: { vatRate: true, lineSubtotal: true, lineVat: true } },
      },
    }),
    prisma.expense.findMany({
      where: { issueDate: { gte: yFrom, lte: to } },
      select: { ...EXPENSE_FISCAL_SELECT, supplierNif: true, invoiceNumber: true, category: true },
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
        vatAmount: true,
        vatRate: true,
        vatStatus: true,
        channel: true,
        orderId: true,
        invoiceId: true,
      },
    }),
    prisma.investmentAsset.findMany({
      where: { purchaseDate: { gte: yFrom, lte: to } },
      select: {
        id: true,
        description: true,
        purchaseDate: true,
        base: true,
        vatAmount: true,
        vatOperationType: true,
        expense: { select: { vatDeductiblePct: true } },
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

  const q2exp = expenses.filter((e) => e.issueDate >= from && e.issueDate <= to);
  const q2inv = invoices.filter((i) => i.issueDate >= from && i.issueDate <= to);

  const euExp = q2exp.map((e) => ({
    date: e.issueDate.toISOString().slice(0, 10),
    supplier: e.supplierName,
    nif: e.supplierNif,
    type: e.vatOperationType,
    kind: parsePurchaseVatKind(e.vatOperationType),
    subtotal: Number(e.subtotal),
    vat: Number(e.vatAmount),
    inv: e.invoiceNumber,
    dua: e.importDuaBase,
  }));

  const priorPresented = await prisma.fiscalFiling.findUnique({
    where: { periodKey: fiscalFilingPeriodKey("303", YEAR - 1, 4) },
    select: { result: true, boxes: true },
  });
  const priorYearCompensation = priorPresented
    ? carryFromPresented303(priorPresented)
    : 0;

  const presented303Rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "303", year: YEAR, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const presentedCarryByQuarter: Partial<Record<1 | 2 | 3 | 4, number>> = {};
  for (const r of presented303Rows) {
    if (r.quarter == null) continue;
    presentedCarryByQuarter[r.quarter as 1 | 2 | 3 | 4] = carryFromPresented303(r);
  }

  const presented130Rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "130", year: YEAR, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const presented130: Partial<
    Record<FiscalQuarter, ReturnType<typeof presentedQuarterFromFiling>>
  > = {};
  for (const r of presented130Rows) {
    if (r.quarter == null) continue;
    presented130[r.quarter as FiscalQuarter] = presentedQuarterFromFiling({
      quarter: r.quarter as FiscalQuarter,
      result: Number(r.result),
      boxes: Array.isArray(r.boxes)
        ? (r.boxes as { code: string; value: number }[])
        : [],
    });
  }

  const config130: Model130Config = {
    irpfDirectEstimationMode: "NORMAL",
    previousYearNetIncomeMode: "UNKNOWN",
    previousYearNetIncomeFor130Reduction: null,
    irpf130HousingDeduction: "NO",
    agriculturalActivities130: "NONE",
    irregularIncome130Status: "NONE",
    fiscalRegime: "130",
    activityKind130: "UNKNOWN",
    priorYearWithholdingPct130: null,
    activityStartYear: null,
    hasCashAccountingInvoices: invoices.some((i) => i.cashAccounting),
  };

  const chain303 = buildModel303ChainFromRows({
    year: YEAR,
    invoices: invoices as never,
    expenses: expenses as never,
    marketplace: marketplace as never,
    assets: assets.map((a) => ({
      id: a.id,
      description: a.description,
      purchaseDate: a.purchaseDate,
      base: a.base,
      vatAmount: a.vatAmount,
      vatOperationType: a.vatOperationType,
      vatDeductiblePct: a.expense?.vatDeductiblePct ?? 100,
    })) as never,
    priorYearCompensation,
    presentedCarryByQuarter,
    quarterRange,
  });

  const chain130 = assembleModel130Chain({
    year: YEAR,
    config: config130,
    invoices: invoices as never,
    expenses: expenses as never,
    marketplace: marketplace as never,
    amortRows: amortRows.map((r) => ({
      yearAmount: Number(r.amount),
      purchaseDate: r.asset.purchaseDate,
      startYear: r.asset.startYear,
      usefulLifeYears: r.asset.usefulLifeYears,
      assetId: r.asset.id,
      label: r.asset.description?.trim() || undefined,
    })),
    presented: presented130,
  });

  const draft349 = await buildModelo349Draft(YEAR, Q);
  const p303 = await getPresentedFiling("303", YEAR, Q);
  const p130 = await getPresentedFiling("130", YEAR, Q);
  const p349 = await getPresentedFiling("349", YEAR, Q);
  const p130q1 = await getPresentedFiling("130", YEAR, 1);
  const p303q1 = await getPresentedFiling("303", YEAR, 1);

  const m303 = chain303[Q];
  const m130 = chain130[Q];
  const m130q1 = chain130[1];

  const settings = await prisma.companySettings.findFirst();
  const profile = buildFiscalCensusProfileFromSettings(settings as never);
  const now = new Date("2026-09-03");
  const a303 = adapt303Obligation({
    profile,
    year: YEAR,
    quarter: Q,
    filed: true,
    filingId: "x",
    now,
    hasVatActivity: true,
  });
  const a130 = adapt130Obligation({
    profile,
    year: YEAR,
    quarter: Q,
    incomeBaseYtd: m130.boxes.box01,
    incomeWithWithholdingYtd: 0,
    filed: true,
    filingId: "x",
    now,
  });
  const a349 = adapt349Obligation({
    profile,
    year: YEAR,
    quarter: Q,
    hasOps: draft349.hasOps,
    filed: true,
    filingId: "x",
    now,
  });
  const a111 = adapt111Obligation({
    profile,
    year: YEAR,
    quarter: Q,
    hasRelevantPayments: false,
    totalWithholdingAmount: 0,
    filed: false,
    filingId: null,
    now,
  });
  const a115 = adapt115Obligation({
    profile,
    year: YEAR,
    quarter: Q,
    hasRelevantPayments: false,
    totalWithholdingAmount: 0,
    filed: false,
    filingId: null,
    now,
  });

  const whCount = await prisma.fiscalWithholding.count({ where: { year: YEAR } });
  const leaseCount = await prisma.businessPremisesLease.count();
  const practicedYes = await prisma.expense.count({
    where: {
      issueDate: { gte: from, lte: to },
      practicedWithholdingStatus: "YES",
    },
  });

  const q3range = quarterRange(YEAR, 3);
  const q3inv = await prisma.invoice.count({
    where: {
      issueDate: { gte: q3range.from, lte: q3range.to },
      fiscalStatus: FISCAL_STATUS.ISSUED,
      status: { not: "ANULADA" },
    },
  });
  const q3exp = await prisma.expense.count({
    where: { issueDate: { gte: q3range.from, lte: q3range.to } },
  });

  const out = {
    censusAdapters: {
      "130": { status: a130.entry.obligationStatus, reason: a130.entry.reason, codes: a130.entry.reasonCodes },
      "303": { status: a303.entry.obligationStatus, reason: a303.entry.reason, codes: a303.entry.reasonCodes },
      "349": { status: a349.entry.obligationStatus, reason: a349.entry.reason, codes: a349.entry.reasonCodes },
      "111": { status: a111.entry.obligationStatus, reason: a111.entry.reason, codes: a111.entry.reasonCodes },
      "115": { status: a115.entry.obligationStatus, reason: a115.entry.reason, codes: a115.entry.reasonCodes },
    },
    counts: { whCount, leaseCount, practicedYesQ2: practicedYes, q3inv, q3exp },
    q2invoices: q2inv.map((i) => ({
      num: i.fullNumber,
      date: i.issueDate.toISOString().slice(0, 10),
      sub: Number(i.subtotal),
      vat: Number(i.vatAmount),
      irpf: Number(i.irpfAmount),
      kind: parseSalesVatKind(i.vatOperationType),
      raw: i.vatOperationType,
      country: i.client?.countryCode,
    })),
    q2euExpenses: euExp.filter((e) => e.kind !== "DOMESTIC"),
    q2euTotals: euExp
      .filter((e) => e.kind !== "DOMESTIC")
      .reduce(
        (acc, e) => {
          acc[e.kind] = round2((acc[e.kind] ?? 0) + e.subtotal);
          return acc;
        },
        {} as Record<string, number>
      ),
    vexo303q2: m303.boxes,
    vexo303warnings: m303.warnings,
    vexo303result: m303.result,
    presented303q2: {
      result: p303?.result,
      boxes: p303?.boxes,
      ocr: (p303?.rawExtract as { boxes?: unknown })?.boxes ?? null,
      source: p303?.sourceFileName,
    },
    vexo130q1: m130q1.boxes,
    vexo130q2: m130.boxes,
    vexo130warnings: m130.warnings,
    presented130q1: { result: p130q1?.result, boxes: p130q1?.boxes, ocr: (p130q1?.rawExtract as { boxes?: unknown })?.boxes },
    presented130q2: { result: p130?.result, boxes: p130?.boxes, ocr: (p130?.rawExtract as { boxes?: unknown })?.boxes, source: p130?.sourceFileName },
    draft349: {
      hasOps: draft349.hasOps,
      incompleteVatId: draft349.incompleteVatId,
      totalsByKey: draft349.totalsByKey,
      ops: draft349.operations?.map((o) => ({
        key: o.key,
        vatId: o.vatId,
        amount: o.amount,
        name: o.operatorName ?? (o as { name?: string }).name,
      })),
      warnings: draft349.warnings,
    },
    presented349: {
      result: p349?.result,
      boxes: p349?.boxes,
      ocr: (p349?.rawExtract as { boxes?: unknown })?.boxes ?? null,
      source: p349?.sourceFileName,
    },
    presented303q1: { result: p303q1?.result },
    priorYearCompensation,
  };

  const dest = path.join(root, "lib/__tests__/fixtures/fiscal-real-golden/engine-vs-presented.json");
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("WROTE", dest);
  console.log("adapters", JSON.stringify(out.censusAdapters, null, 2));
  console.log("q2euTotals", out.q2euTotals);
  console.log("349 ops", out.draft349.ops);
  console.log("349 presented", out.presented349.result, out.presented349.ocr ?? out.presented349.boxes);
  console.log("303 vexo71", out.vexo303q2.box71, "presented", out.presented303q2.result);
  console.log("130 q2 vexo19", out.vexo130q2.box19, "presented", out.presented130q2.result);
  console.log("counts", out.counts);
  console.log("303 warnings", out.vexo303warnings?.map((w) => w.code));
  console.log("349 warnings", out.draft349.warnings?.map((w) => w.code));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
