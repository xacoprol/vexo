/**
 * Fase 4 — calcula 130/303/349 del golden desde fixtures locales (sin Neon).
 */
import { readFileSync } from "fs";
import path from "path";
import { quarterRange } from "../lib/fiscal";
import { assembleModel130Chain } from "../lib/modelo-130/assemble";
import { presentedQuarterFromFiling } from "../lib/modelo-130/engine";
import type { Model130Config } from "../lib/modelo-130/types";
import { aggregateModel303Period } from "../lib/modelo-303";
import { collect349ExpenseLines, group349Operations } from "../lib/modelo-349/aggregate";
import type { Model349Warning } from "../lib/modelo-349/types";

function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const dir = path.join(process.cwd(), "lib/__tests__/fixtures/fiscal-real-golden");
const extract = JSON.parse(readFileSync(path.join(dir, "extracted-read-only.json"), "utf8"));
const amortRaw = JSON.parse(readFileSync(path.join(dir, "amort-2026.json"), "utf8"));
const presented = JSON.parse(readFileSync(path.join(dir, "engine-vs-presented.json"), "utf8"));

function collectPeriod(q: "q1" | "q2" | "q3") {
  const p = extract[q];
  return {
    invoices: p.invoices.map((i: Record<string, unknown>) => ({
      id: i.idHash,
      fullNumber: i.number,
      issueDate: localDate(String(i.date)),
      subtotal: i.subtotal,
      vatAmount: i.vatAmount,
      irpfAmount: i.irpfAmount,
      status: i.status,
      fiscalStatus: i.fiscalStatus,
      cashAccounting: i.cashAccounting,
      vatOperationType: i.vatOperationType,
      invoiceFiscalType: i.invoiceFiscalType,
      lines:
        String(i.vatOperationType) === "SUJETA" && Number(i.vatAmount) > 0
          ? [
              {
                vatRate: 21,
                lineSubtotal: i.subtotal,
                lineVat: i.vatAmount,
              },
            ]
          : [],
    })),
    expenses: p.expenses.map((e: Record<string, unknown>) => ({
      id: e.idHash,
      issueDate: localDate(String(e.date)),
      subtotal: e.subtotal,
      vatAmount: e.vatAmount,
      vatRate: e.vatRate ?? 21,
      total: e.total,
      vatOperationType: e.vatOperationType,
      deductible: e.deductible,
      vatDeductiblePct: e.vatDeductiblePct,
      irpfDeductiblePct: e.irpfDeductiblePct,
      isInvestment: e.isInvestment,
      supplierName: e.supplierMasked,
      supplierNif: e.nifMasked,
      description: e.invoiceNumber,
      importDuaBase: (e.dua as { base: number | null })?.base ?? null,
      importDuaVat: (e.dua as { vat: number | null })?.vat ?? null,
    })),
    marketplace: p.marketplace.map((m: Record<string, unknown>) => ({
      id: m.idHash,
      issueDate: localDate(String(m.date)),
      subtotal: m.subtotal,
      vatAmount: m.vatAmount,
      vatRate: m.vatRate ?? 0,
      vatStatus: m.vatStatus,
      channel: m.channel,
      invoiceId: m.hasInvoice ? "x" : null,
      transactionType: m.transactionType,
      shipToCountry: m.shipToCountry,
    })),
    assets: (p.assets ?? []).map((a: Record<string, unknown>) => ({
      id: a.idHash,
      purchaseDate: a.date ? localDate(String(a.date)) : null,
      base: a.base,
      vatAmount: a.vatAmount,
      vatOperationType: a.vatOperationType,
      description: a.desc,
      vatDeductiblePct: 100,
    })),
  };
}

const q1 = collectPeriod("q1");
const q2 = collectPeriod("q2");

const invoices = [...q1.invoices, ...q2.invoices];
const expenses = [...q1.expenses, ...q2.expenses];
const marketplace = [...q1.marketplace, ...q2.marketplace];
const assets = [...q1.assets, ...q2.assets];

const amortRows = amortRaw.map((r: Record<string, unknown>) => ({
  yearAmount: r.yearAmount,
  purchaseDate: r.purchaseDate ? localDate(String(r.purchaseDate)) : null,
  startYear: r.startYear,
  usefulLifeYears: r.usefulLifeYears,
  assetId: r.assetId,
  label: r.desc,
}));

const presented130 = {
  1: presentedQuarterFromFiling({
    quarter: 1,
    result: Number(presented.presented130q1.result),
    boxes: presented.presented130q1.boxes,
  }),
};

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
  hasCashAccountingInvoices: false,
};

const chain130 = assembleModel130Chain({
  year: 2026,
  config: config130,
  invoices,
  expenses,
  marketplace,
  amortRows,
  presented: presented130,
});

const { from, to } = quarterRange(2026, 2);
const m303 = aggregateModel303Period({
  invoices: invoices as never,
  expenses: expenses as never,
  marketplace: marketplace as never,
  assets: assets as never,
  from,
  to,
  priorCompensation: 0,
});

const warnings349: Model349Warning[] = [];
const exp349 = collect349ExpenseLines(q2.expenses as never, from, to, warnings349);

console.log("130 Q1", chain130[1].boxes);
console.log("130 Q1 warnings", chain130[1].warnings.map((w) => w.code));
console.log("130 Q2", chain130[2].boxes);
console.log("130 Q2 warnings", chain130[2].warnings.map((w) => w.code));
console.log("303 Q2 selected", {
  box07: m303.modelo303.boxes.box07,
  box09: m303.modelo303.boxes.box09,
  box10: m303.modelo303.boxes.box10,
  box11: m303.modelo303.boxes.box11,
  box12: m303.modelo303.boxes.box12,
  box13: m303.modelo303.boxes.box13,
  box27: m303.modelo303.boxes.box27,
  box28: m303.modelo303.boxes.box28,
  box29: m303.modelo303.boxes.box29,
  box36: m303.modelo303.boxes.box36,
  box37: m303.modelo303.boxes.box37,
  box38: m303.modelo303.boxes.box38,
  box39: m303.modelo303.boxes.box39,
  box45: m303.modelo303.boxes.box45,
  box46: m303.modelo303.boxes.box46,
  box59: m303.modelo303.boxes.box59,
  box60: m303.modelo303.boxes.box60,
  box71: m303.modelo303.boxes.box71,
  box123: m303.modelo303.boxes.box123,
  baseExenta: m303.modelo303.boxes.baseExenta,
  otherBase: m303.modelo303.boxes.otherBase,
  otherQuota: m303.modelo303.boxes.otherQuota,
});
console.log(
  "303 warnings unique",
  [...new Set(m303.modelo303.warnings.map((w) => w.code))]
);
console.log("349 skipped", exp349.skippedMissingVatId, "lines", exp349.lines.length);
console.log(
  "349 grouped",
  group349Operations(exp349.lines).map((o) => ({
    key: o.key,
    vatId: o.vatId,
    amount: o.amount,
    name: o.operatorName,
  }))
);
