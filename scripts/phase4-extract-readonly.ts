/**
 * Fase 4 — extracción READ-ONLY del caso real (sin writes).
 * Anonimiza NIF/nombres. No persiste en Neon.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";

const root = process.cwd();
if (existsSync(path.join(root, ".env"))) loadEnv({ path: path.join(root, ".env") });
if (existsSync(path.join(root, ".env.local")))
  loadEnv({ path: path.join(root, ".env.local"), override: true });

import { prisma } from "../lib/prisma";
import { quarterRange } from "../lib/fiscal";
import { EXPENSE_FISCAL_SELECT } from "../lib/fiscal-expense-select";

function maskId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.length <= 4) return "***";
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}

function maskName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  return parts
    .map((p) => (p.length <= 2 ? p[0] + "*" : p.slice(0, 2) + "…"))
    .join(" ");
}

function hashStable(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 10);
}

async function tableExists(name: string): Promise<boolean> {
  const r: { exists: boolean }[] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${name}') AS exists`
  );
  return Boolean(r[0]?.exists);
}

async function main() {
  const YEAR = 2026;
  const cols: { column_name: string }[] = await prisma.$queryRaw`
    SELECT column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='CompanySettings'`;
  const colSet = new Set(cols.map((c) => c.column_name));

  const settingsRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "CompanySettings" LIMIT 1`
  );
  const settings = settingsRows[0] ?? {};

  const censusKeys = [
    "fiscalRegime",
    "irpfDirectEstimationMode",
    "previousYearNetIncome130Mode",
    "previousYearNetIncomeFor130Reduction",
    "irpf130HousingDeduction",
    "agriculturalActivities130",
    "irregularIncome130Status",
    "activityKind130",
    "priorYearWithholdingPct130",
    "activityStartYear",
    "vatPeriodicity",
    "vatUsesSii",
    "vatTerritory",
    "vatActivity390Scope",
    "lastVatPeriodFilingRequired",
    "vat390FilingObligation",
    "paysProfessionalsSubjectToWithholding",
    "hasEmployees",
    "rentsBusinessPremises",
    "businessRentSubjectToWithholding",
    "censusModel130",
    "censusModel303",
    "censusModel111",
    "censusModel115",
    "censusModel180",
    "censusModel190",
    "censusModel349",
    "censusModel347",
    "censusModel390",
    "censusSource",
    "censusLastUpdatedAt",
  ];
  const census: Record<string, unknown> = {};
  for (const k of censusKeys) {
    census[k] = colSet.has(k) ? (settings[k] ?? null) : "COLUMN_MISSING";
  }

  const filings = await prisma.fiscalFiling.findMany({
    orderBy: [{ year: "asc" }, { modelType: "asc" }, { quarter: "asc" }],
    select: {
      id: true,
      periodKey: true,
      modelType: true,
      year: true,
      quarter: true,
      filedAt: true,
      result: true,
      incomeBase: true,
      expensesBase: true,
      vatRepercutida: true,
      vatDeductible: true,
      boxes: true,
      sourceFileName: true,
      notes: true,
      confidence: true,
      rawExtract: true,
    },
  });

  async function periodSlice(q: 1 | 2 | 3 | 4) {
    const { from, to } = quarterRange(YEAR, q);
    const [invoices, expenses, marketplace, assets] = await Promise.all([
      prisma.invoice.findMany({
        where: { issueDate: { gte: from, lte: to } },
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
          client: { select: { name: true, nif: true, countryCode: true } },
        },
      }),
      prisma.expense.findMany({
        where: { issueDate: { gte: from, lte: to } },
        select: {
          ...EXPENSE_FISCAL_SELECT,
          supplierNif: true,
          invoiceNumber: true,
          category: true,
          practicedWithholdingStatus: true,
        },
      }),
      prisma.marketplaceIncome.findMany({
        where: { issueDate: { gte: from, lte: to } },
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
          shipToCountry: true,
          transactionType: true,
        },
      }),
      prisma.investmentAsset.findMany({
        where: { purchaseDate: { gte: from, lte: to } },
        select: {
          id: true,
          description: true,
          purchaseDate: true,
          base: true,
          vatAmount: true,
          vatOperationType: true,
        },
      }),
    ]);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      invoices: invoices.map((i) => ({
        idHash: hashStable(i.id),
        number: i.fullNumber,
        date: i.issueDate.toISOString().slice(0, 10),
        subtotal: Number(i.subtotal),
        vatAmount: Number(i.vatAmount),
        irpfAmount: Number(i.irpfAmount),
        status: i.status,
        fiscalStatus: i.fiscalStatus,
        cashAccounting: i.cashAccounting,
        vatOperationType: i.vatOperationType,
        invoiceFiscalType: i.invoiceFiscalType,
        clientCountry: i.client?.countryCode ?? null,
        clientNifMasked: maskId(i.client?.nif),
        clientNameMasked: maskName(i.client?.name),
      })),
      expenses: expenses.map((e) => ({
        idHash: hashStable(e.id),
        date: e.issueDate.toISOString().slice(0, 10),
        supplierMasked: maskName(e.supplierName),
        nifMasked: maskId(e.supplierNif),
        invoiceNumber: e.invoiceNumber,
        category: e.category,
        subtotal: Number(e.subtotal),
        vatAmount: Number(e.vatAmount),
        vatRate: e.vatRate,
        total: Number(e.total),
        vatOperationType: e.vatOperationType,
        deductible: e.deductible,
        vatDeductiblePct: e.vatDeductiblePct,
        irpfDeductiblePct: e.irpfDeductiblePct,
        isInvestment: e.isInvestment,
        practicedWithholdingStatus: e.practicedWithholdingStatus,
        dua: {
          type: e.importDuaType,
          number: e.importDuaNumber,
          date: e.importDuaDate,
          base: e.importDuaBase != null ? Number(e.importDuaBase) : null,
          vat: e.importDuaVat != null ? Number(e.importDuaVat) : null,
        },
      })),
      marketplace: marketplace.map((m) => ({
        idHash: hashStable(m.id),
        date: m.issueDate.toISOString().slice(0, 10),
        subtotal: Number(m.subtotal),
        vatAmount: Number(m.vatAmount),
        vatRate: m.vatRate,
        vatStatus: m.vatStatus,
        channel: m.channel,
        hasInvoice: Boolean(m.invoiceId),
        shipToCountry: m.shipToCountry,
        transactionType: m.transactionType,
      })),
      assets: assets.map((a) => ({
        idHash: hashStable(a.id),
        date: a.purchaseDate?.toISOString().slice(0, 10) ?? null,
        desc: a.description?.slice(0, 40) ?? null,
        base: Number(a.base),
        vatAmount: Number(a.vatAmount),
        vatOperationType: a.vatOperationType,
      })),
    };
  }

  const q1 = await periodSlice(1);
  const q2 = await periodSlice(2);
  const q3 = await periodSlice(3);

  const tables = {
    FiscalWithholding: await tableExists("FiscalWithholding"),
    FiscalCounterparty: await tableExists("FiscalCounterparty"),
    BusinessPremisesLease: await tableExists("BusinessPremisesLease"),
  };

  let withholdings: unknown[] = [];
  let leases: unknown[] = [];
  if (tables.FiscalWithholding) {
    withholdings = await prisma.$queryRawUnsafe(
      `SELECT id, direction, kind, status, "baseAmount", "withholdingAmount", "paymentDate", year, quarter FROM "FiscalWithholding" WHERE year = 2026 LIMIT 200`
    );
  }
  if (tables.BusinessPremisesLease) {
    leases = await prisma.$queryRawUnsafe(
      `SELECT id, active, "withholdingStatus" FROM "BusinessPremisesLease" LIMIT 50`
    );
  }

  const filingsAnon = filings.map((f) => {
    const raw = f.rawExtract as Record<string, unknown> | null;
    const ocrBoxes = Array.isArray(raw?.boxes) ? raw!.boxes : null;
    return {
      periodKey: f.periodKey,
      modelType: f.modelType,
      year: f.year,
      quarter: f.quarter,
      filedAt: f.filedAt?.toISOString() ?? null,
      result: Number(f.result),
      incomeBase: f.incomeBase != null ? Number(f.incomeBase) : null,
      expensesBase: f.expensesBase != null ? Number(f.expensesBase) : null,
      vatRepercutida: f.vatRepercutida != null ? Number(f.vatRepercutida) : null,
      vatDeductible: f.vatDeductible != null ? Number(f.vatDeductible) : null,
      boxes: f.boxes,
      ocrBoxes,
      sourceFileName: f.sourceFileName,
      notes: f.notes,
      confidence: f.confidence,
      rawKeys: raw ? Object.keys(raw) : [],
    };
  });

  const out = {
    extractedAt: new Date().toISOString(),
    year: YEAR,
    identity: {
      nameMasked: maskName(String(settings.name ?? "")),
      companyMasked: maskName(String(settings.companyName ?? "")),
      nifMasked: maskId(String(settings.nif ?? "")),
      city: settings.addressCity ?? null,
    },
    census,
    schema: { companySettingsColumns: [...colSet].sort(), tables },
    filings: filingsAnon,
    withholdings2026: withholdings,
    leases,
    q1,
    q2,
    q3,
    counts: {
      q1: {
        inv: q1.invoices.length,
        exp: q1.expenses.length,
        mkt: q1.marketplace.length,
      },
      q2: {
        inv: q2.invoices.length,
        exp: q2.expenses.length,
        mkt: q2.marketplace.length,
      },
      q3: {
        inv: q3.invoices.length,
        exp: q3.expenses.length,
        mkt: q3.marketplace.length,
      },
    },
  };

  const dir = path.join(root, "lib/__tests__/fixtures/fiscal-real-golden");
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "extracted-read-only.json");
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("WROTE", dest);
  console.log("COUNTS", JSON.stringify(out.counts, null, 2));
  console.log("CENSUS", JSON.stringify(census, null, 2));
  console.log(
    "FILINGS",
    filingsAnon.map((f) => `${f.periodKey} result=${f.result}`)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
