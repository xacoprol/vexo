import {
  aibDeductibleShare,
  clampPct,
  computeExpenseDeductibility,
  deductibleVatAmount,
} from "@/lib/expense-deductibility";
import { buildModel303 } from "@/lib/modelo-303/engine";
import {
  INVOICE_FISCAL_TYPE,
  rectificationTraceLabel,
} from "@/lib/invoice-rectification";
import type {
  Model303Trace,
  Model303TraceLine,
  Model303Warning,
  VatBucket,
} from "@/lib/modelo-303/types";
import {
  isEuIntracomPurchase,
  isOtherIspPurchase,
  isPurchaseReverseCharge,
  parsePurchaseVatKind,
  parseSalesVatKind,
  type PurchaseVatKind,
} from "@/lib/modelo-303/vat-classification";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

function addBucket(
  map: Map<number, VatBucket>,
  rate: number,
  base: number,
  quota: number
) {
  const cur = map.get(rate) ?? { rate, base: 0, quota: 0 };
  cur.base = round2(cur.base + base);
  cur.quota = round2(cur.quota + quota);
  map.set(rate, cur);
}

function pushTrace(
  trace: Model303Trace,
  box: string,
  line: Model303TraceLine
) {
  const key = `box${box}`;
  if (!trace[key]) trace[key] = [];
  trace[key]!.push(line);
}

export type Model303InvoiceRow = {
  id: string;
  fullNumber?: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  irpfAmount: unknown;
  status: string;
  fiscalStatus: string;
  cashAccounting?: boolean;
  vatOperationType: string | null;
  invoiceFiscalType?: string | null;
  rectificationType?: string | null;
  rectifiesInvoiceId?: string | null;
  rectifiesInvoiceFullNumber?: string | null;
  lines: {
    vatRate: number;
    lineSubtotal: unknown;
    lineVat: unknown;
  }[];
};

export type Model303ExpenseRow = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  total: unknown;
  vatOperationType: string | null;
  deductible?: boolean | null;
  vatDeductiblePct?: number | null;
  irpfDeductiblePct?: number | null;
  isInvestment: boolean;
  description?: string | null;
  supplierName?: string | null;
  /** Documentación aduanera (DUA) cuando importación de bienes. */
  importDuaBase?: number | null;
  importDuaVat?: number | null;
  importDuaDocumentId?: string | null;
};

export type Model303MarketplaceRow = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  vatStatus: string | null;
  channel?: string;
  orderId?: string | null;
  transactionType?: string | null;
  shipToCountry?: string | null;
  invoiceId?: string | null;
};

export type Model303AssetRow = {
  id?: string;
  purchaseDate: Date | null;
  base: unknown;
  vatAmount: unknown;
  vatOperationType?: string | null;
  description?: string | null;
  vatDeductiblePct?: number | null;
};

export type Model303PeriodAggregation = {
  issued: {
    count: number;
    vatBuckets: VatBucket[];
    baseSujeta: number;
    quotaRepercutida: number;
    baseExenta: number;
    baseIntracom: number;
    baseExport: number;
    baseCanarias: number;
    baseMarketplaceCollected: number;
    irpfWithheld: number;
    incomeBase: number;
    invoiceIncomeBase: number;
    marketplaceCount: number;
    marketplaceIncomeBase: number;
  };
  expenses: {
    count: number;
    base: number;
    vatDeductible: number;
    aibBase: number;
    aibQuota: number;
    aibDeductibleBase: number;
    aibDeductibleVat: number;
    importServiceBase: number;
    importServiceQuota: number;
    total: number;
  };
  modelo303: ReturnType<typeof buildModel303>;
};

function expenseLabel(e: Model303ExpenseRow): string {
  return e.supplierName?.trim() || e.description?.trim() || `Gasto ${e.id.slice(0, 8)}`;
}

function reverseChargeQuota(sub: number, vat: number, rate: number): number {
  return vat > 0 ? vat : round2(sub * (rate / 100));
}

function pctFromExpense(e: Model303ExpenseRow): {
  vatPct: number;
  irpfPct: number;
} {
  const vatPct =
    e.vatDeductiblePct != null
      ? clampPct(e.vatDeductiblePct)
      : e.deductible === false
        ? 0
        : 100;
  const irpfPct =
    e.irpfDeductiblePct != null
      ? clampPct(e.irpfDeductiblePct)
      : e.deductible === false
        ? 0
        : 100;
  return { vatPct, irpfPct };
}

export function aggregateModel303Period(opts: {
  invoices: Model303InvoiceRow[];
  expenses: Model303ExpenseRow[];
  marketplace: Model303MarketplaceRow[];
  assets: Model303AssetRow[];
  from: Date;
  to: Date;
  priorCompensation?: number;
  priorCompensationProvisional?: boolean;
}): Model303PeriodAggregation {
  const {
    from,
    to,
    priorCompensation = 0,
    priorCompensationProvisional = false,
  } = opts;

  const invs = opts.invoices.filter((i) => inRange(i.issueDate, from, to));
  const exps = opts.expenses.filter((e) => inRange(e.issueDate, from, to));
  const mkts = opts.marketplace.filter((m) => inRange(m.issueDate, from, to));
  const assetRows = opts.assets.filter(
    (a) =>
      a.purchaseDate != null &&
      inRange(a.purchaseDate, from, to) &&
      parsePurchaseVatKind(a.vatOperationType) === "DOMESTIC"
  );

  const trace: Model303Trace = {};
  const warnings: Model303Warning[] = [];
  const warnOnce = (code: string, message: string) => {
    if (!warnings.some((w) => w.code === code)) {
      warnings.push({ code, message });
    }
  };

  const vatMap = new Map<number, VatBucket>();
  let baseExenta = 0;
  let baseIntracom = 0;
  let baseExport = 0;
  let baseCanarias = 0;
  let baseMarketplaceCollected = 0;
  let irpfWithheld = 0;
  let invoiceIncomeBase = 0;
  let hasCashAccounting = false;

  for (const inv of invs) {
    if (inv.cashAccounting) hasCashAccounting = true;
    const subtotal = Number(inv.subtotal);
    invoiceIncomeBase = round2(invoiceIncomeBase + subtotal);
    irpfWithheld = round2(irpfWithheld + Number(inv.irpfAmount));

    const kind = parseSalesVatKind(inv.vatOperationType);
    const baseLabel = inv.fullNumber?.trim() || `Factura ${inv.id.slice(0, 8)}`;
    const isRectifying =
      inv.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING;
    const label =
      isRectifying && inv.rectifiesInvoiceFullNumber
        ? rectificationTraceLabel(baseLabel, inv.rectifiesInvoiceFullNumber)
        : baseLabel;
    const traceKind = isRectifying ? ("RECTIFYING" as const) : kind;

    if (subtotal < 0 && !isRectifying) {
      warnings.push({
        code: "RECTIFICATION_NOT_SUPPORTED",
        message:
          "Factura con importe negativo sin rectificativa formal: revisar o emitir factura rectificativa.",
        sourceId: inv.id,
      });
    }

    if (kind === "EXEMPT") {
      baseExenta = round2(baseExenta + subtotal);
      pushTrace(trace, "revisar", {
        sourceType: "invoice",
        sourceId: inv.id,
        description: label,
        vatKind: kind,
        base: subtotal,
        boxCodes: ["revisar"],
      });
      continue;
    }
    if (kind === "EU_DELIVERY") {
      baseIntracom = round2(baseIntracom + subtotal);
      pushTrace(trace, "59", {
        sourceType: "invoice",
        sourceId: inv.id,
        description: label,
        vatKind: kind,
        base: subtotal,
        boxCodes: ["59"],
      });
      continue;
    }
    if (kind === "CANARY_ISLANDS") {
      baseCanarias = round2(baseCanarias + subtotal);
      pushTrace(trace, "60", {
        sourceType: "invoice",
        sourceId: inv.id,
        description: label,
        vatKind: kind,
        base: subtotal,
        boxCodes: ["60"],
      });
      continue;
    }
    if (kind === "EXPORT") {
      baseExport = round2(baseExport + subtotal);
      pushTrace(trace, "60", {
        sourceType: "invoice",
        sourceId: inv.id,
        description: label,
        vatKind: kind,
        base: subtotal,
        boxCodes: ["60"],
      });
      continue;
    }

    if (inv.lines.length) {
      for (const line of inv.lines) {
        const base = Number(line.lineSubtotal);
        const quota = Number(line.lineVat);
        addBucket(vatMap, line.vatRate, base, quota);
        const box = line.vatRate === 4 ? "01" : line.vatRate === 10 ? "04" : line.vatRate === 21 ? "07" : "revisar";
        pushTrace(trace, box, {
          sourceType: "invoice",
          sourceId: inv.id,
          description: `${label} (${line.vatRate} %)`,
          vatKind: traceKind,
          base,
          vatAccrued: quota,
          vatRate: line.vatRate,
          boxCodes: [box],
        });
      }
    } else {
      const vatAmt = Number(inv.vatAmount);
      const rate =
        subtotal > 0 ? round2((vatAmt / subtotal) * 100) : 21;
      addBucket(vatMap, rate, subtotal, vatAmt);
      const box = rate === 4 ? "01" : rate === 10 ? "04" : rate === 21 ? "07" : "revisar";
      pushTrace(trace, box, {
        sourceType: "invoice",
        sourceId: inv.id,
        description: label,
        vatKind: traceKind,
        base: subtotal,
        vatAccrued: vatAmt,
        vatRate: rate,
        boxCodes: [box],
      });
    }
  }

  let marketplaceIncomeBase = 0;
  for (const m of mkts) {
    if (m.invoiceId) continue;
    const subtotal = Number(m.subtotal);
    const vatAmount = Number(m.vatAmount);
    marketplaceIncomeBase = round2(marketplaceIncomeBase + subtotal);
    const status = (m.vatStatus || "TAXABLE").toUpperCase();
    const tt = (m.transactionType || "").toUpperCase();
    const label = `${m.channel ?? "Marketplace"}${m.orderId ? ` · ${m.orderId}` : ""}`;

    if (tt === "REFUND" || tt === "RETURN" || subtotal < 0) {
      warnings.push({
        code: "RECTIFICATION_NOT_SUPPORTED",
        message:
          "Devolución marketplace: el IVA puede requerir revisión manual (rectificativa no automatizada).",
        sourceId: m.id,
      });
    }

    if (!m.vatStatus || status === "UNKNOWN") {
      warnings.push({
        code: "MARKETPLACE_VAT_REVIEW_REQUIRED",
        message: "Marketplace sin clasificación IVA clara.",
        sourceId: m.id,
      });
    }

    if (status === "TAXABLE") {
      addBucket(vatMap, m.vatRate || 21, subtotal, vatAmount);
      const rate = m.vatRate || 21;
      const box = rate === 4 ? "01" : rate === 10 ? "04" : rate === 21 ? "07" : "revisar";
      pushTrace(trace, box, {
        sourceType: "marketplace",
        sourceId: m.id,
        description: label,
        vatKind: "DOMESTIC_TAXABLE",
        base: subtotal,
        vatAccrued: vatAmount,
        vatRate: rate,
        boxCodes: [box],
      });
    } else if (status === "MARKETPLACE_COLLECTED") {
      baseMarketplaceCollected = round2(baseMarketplaceCollected + subtotal);
      pushTrace(trace, "123", {
        sourceType: "marketplace",
        sourceId: m.id,
        description: label,
        vatKind: "MARKETPLACE_OSS",
        base: subtotal,
        boxCodes: ["123"],
      });
    } else {
      baseExenta = round2(baseExenta + subtotal);
      pushTrace(trace, "revisar", {
        sourceType: "marketplace",
        sourceId: m.id,
        description: label,
        vatKind: "EXEMPT",
        base: subtotal,
        boxCodes: ["revisar"],
      });
    }
  }

  if (hasCashAccounting) {
    warnOnce(
      "CASH_ACCOUNTING_NOT_FULLY_SUPPORTED",
      "Hay facturas con criterio de caja IVA marcado. VEXO imputa por devengo (fecha de factura); no aplica RECC."
    );
  }

  const incomeBase = round2(invoiceIncomeBase + marketplaceIncomeBase);
  const vatBuckets = [...vatMap.values()].sort((a, b) => b.rate - a.rate);
  const baseSujeta = round2(vatBuckets.reduce((s, b) => s + b.base, 0));
  const quotaRepercutida = round2(vatBuckets.reduce((s, b) => s + b.quota, 0));

  if (baseExenta > 0 && baseSujeta > 0) {
    warnOnce(
      "VAT_PRORATA_REVIEW_REQUIRED",
      "Actividad mixta (sujeta + exenta) en el periodo. VEXO no calcula prorrata general de actividad."
    );
  }

  let expenseBaseIrpf = 0;
  let expenseTotal = 0;
  let domesticDeductibleBase = 0;
  let domesticDeductibleVat = 0;
  let investmentBase = 0;
  let investmentVat = 0;
  let euIntracomAccruedBase = 0;
  let euIntracomAccruedVat = 0;
  let euCurrentDeductibleBase = 0;
  let euCurrentDeductibleVat = 0;
  let euInvestmentDeductibleBase = 0;
  let euInvestmentDeductibleVat = 0;
  let otherIspAccruedBase = 0;
  let otherIspAccruedVat = 0;
  let otherIspDeductibleVat = 0;
  let importCurrentBase = 0;
  let importCurrentVat = 0;
  let importInvestmentBase = 0;
  let importInvestmentVat = 0;

  for (const e of exps) {
    const sub = Number(e.subtotal);
    const vat = Number(e.vatAmount);
    const tot = Number(e.total);
    const { vatPct, irpfPct } = pctFromExpense(e);
    const rate = e.vatRate > 0 ? e.vatRate : 21;
    const kind = parsePurchaseVatKind(e.vatOperationType);
    const label = expenseLabel(e);
    const accrued = reverseChargeQuota(sub, vat, rate);

    if (kind === "IMPORT_GOODS") {
      const duaBase = e.importDuaBase != null ? Number(e.importDuaBase) : null;
      const duaVat = e.importDuaVat != null ? Number(e.importDuaVat) : null;
      if (duaBase != null && duaVat != null && Number.isFinite(duaBase) && Number.isFinite(duaVat)) {
        const share = aibDeductibleShare(duaBase, duaVat, vatPct);
        if (e.isInvestment) {
          importInvestmentBase = round2(importInvestmentBase + share.deductibleBase);
          importInvestmentVat = round2(importInvestmentVat + share.deductibleVat);
          pushTrace(trace, "34", {
            sourceType: "expense",
            sourceId: e.id,
            description: label,
            vatKind: kind,
            base: duaBase,
            vatAccrued: duaVat,
            vatDeductible: share.deductibleVat,
            boxCodes: ["32", "33", "34", "35"],
          });
        } else {
          importCurrentBase = round2(importCurrentBase + share.deductibleBase);
          importCurrentVat = round2(importCurrentVat + share.deductibleVat);
          pushTrace(trace, "32", {
            sourceType: "expense",
            sourceId: e.id,
            description: label,
            vatKind: kind,
            base: duaBase,
            vatAccrued: duaVat,
            vatDeductible: share.deductibleVat,
            boxCodes: ["32", "33"],
          });
        }
      } else {
        warnings.push({
          code: "IMPORT_DOCUMENT_MISSING",
          message:
            "Importación de bienes sin documentación aduanera (DUA). VEXO no calcula IVA de importación desde la factura del proveedor.",
          sourceId: e.id,
        });
      }
      continue;
    }

    const ded = computeExpenseDeductibility({
      subtotal: sub,
      vatAmount: isPurchaseReverseCharge(kind) ? accrued : vat,
      vatDeductiblePct: vatPct,
      irpfDeductiblePct: irpfPct,
      isInvestment: e.isInvestment,
    });

    if (ded.irpfComputable > 0 || (irpfPct > 0 && !e.isInvestment)) {
      expenseTotal = round2(expenseTotal + tot * (irpfPct / 100));
    }
    expenseBaseIrpf = round2(expenseBaseIrpf + ded.irpfComputable);

    if (isEuIntracomPurchase(kind)) {
      euIntracomAccruedBase = round2(euIntracomAccruedBase + sub);
      euIntracomAccruedVat = round2(euIntracomAccruedVat + accrued);
      const share = aibDeductibleShare(sub, accrued, vatPct);
      if (e.isInvestment) {
        euInvestmentDeductibleBase = round2(
          euInvestmentDeductibleBase + share.deductibleBase
        );
        euInvestmentDeductibleVat = round2(
          euInvestmentDeductibleVat + share.deductibleVat
        );
        pushTrace(trace, "38", {
          sourceType: "expense",
          sourceId: e.id,
          description: label,
          vatKind: kind,
          base: sub,
          vatAccrued: accrued,
          vatDeductible: share.deductibleVat,
          vatNonDeductible: round2(accrued - share.deductibleVat),
          vatRate: rate,
          boxCodes: ["10", "11", "38", "39"],
        });
      } else {
        euCurrentDeductibleBase = round2(
          euCurrentDeductibleBase + share.deductibleBase
        );
        euCurrentDeductibleVat = round2(
          euCurrentDeductibleVat + share.deductibleVat
        );
        pushTrace(trace, "10", {
          sourceType: "expense",
          sourceId: e.id,
          description: label,
          vatKind: kind,
          base: sub,
          vatAccrued: accrued,
          vatDeductible: share.deductibleVat,
          vatNonDeductible: round2(accrued - share.deductibleVat),
          vatRate: rate,
          boxCodes: ["10", "11", "36", "37"],
        });
      }
    } else if (isOtherIspPurchase(kind)) {
      otherIspAccruedBase = round2(otherIspAccruedBase + sub);
      otherIspAccruedVat = round2(otherIspAccruedVat + accrued);
      if (!e.isInvestment) {
        otherIspDeductibleVat = round2(
          otherIspDeductibleVat + deductibleVatAmount(accrued, vatPct)
        );
      }
      pushTrace(trace, "12", {
        sourceType: "expense",
        sourceId: e.id,
        description: label,
        vatKind: kind,
        base: sub,
        vatAccrued: accrued,
        vatDeductible: e.isInvestment
          ? 0
          : deductibleVatAmount(accrued, vatPct),
        vatNonDeductible: round2(
          accrued -
            (e.isInvestment ? 0 : deductibleVatAmount(accrued, vatPct))
        ),
        vatRate: rate,
        boxCodes: ["12", "13", "29"],
      });
    } else if (!e.isInvestment) {
      domesticDeductibleBase = round2(
        domesticDeductibleBase + round2(sub * (vatPct / 100))
      );
      const dedVat = deductibleVatAmount(vat, vatPct);
      domesticDeductibleVat = round2(domesticDeductibleVat + dedVat);
      pushTrace(trace, "28", {
        sourceType: "expense",
        sourceId: e.id,
        description: label,
        vatKind: kind,
        base: sub,
        vatAccrued: vat,
        vatDeductible: dedVat,
        vatNonDeductible: round2(vat - dedVat),
        vatRate: rate,
        boxCodes: ["28", "29"],
      });
    }
  }

  for (const a of assetRows) {
    if (parsePurchaseVatKind(a.vatOperationType) === "IMPORT_GOODS") {
      continue;
    }
    const base = Number(a.base);
    const vatAmt = Number(a.vatAmount);
    const pct = clampPct(a.vatDeductiblePct);
    const dedBase = round2(base * (pct / 100));
    const dedVat = round2(vatAmt * (pct / 100));
    investmentBase = round2(investmentBase + dedBase);
    investmentVat = round2(investmentVat + dedVat);
    pushTrace(trace, "30", {
      sourceType: "investment_asset",
      sourceId: a.id,
      description: a.description?.trim() || "Bien de inversión",
      vatKind: "DOMESTIC",
      base,
      vatAccrued: vatAmt,
      vatDeductible: dedVat,
      vatNonDeductible: round2(vatAmt - dedVat),
      boxCodes: ["30", "31"],
    });
  }

  if (priorCompensation > 0) {
    pushTrace(trace, "110", {
      sourceType: "compensation",
      description: "Compensación periodos anteriores",
      vatKind: "COMPENSATION",
      base: priorCompensation,
      boxCodes: ["110", "78", "87"],
    });
  }

  const modelo303 = buildModel303({
    vatBuckets,
    euIntracomAccruedBase,
    euIntracomAccruedVat,
    otherIspAccruedBase,
    otherIspAccruedVat,
    importCurrentBase,
    importCurrentVat,
    importInvestmentBase,
    importInvestmentVat,
    domesticDeductibleBase,
    domesticDeductibleVat,
    otherIspDeductibleVat,
    investmentDomesticBase: investmentBase,
    investmentDomesticVat: investmentVat,
    euCurrentDeductibleBase,
    euCurrentDeductibleVat,
    euInvestmentDeductibleBase,
    euInvestmentDeductibleVat,
    baseExenta,
    baseIntracomDeliveries: baseIntracom,
    baseExport,
    baseCanarias,
    baseMarketplaceCollected,
    priorCompensation,
    priorCompensationProvisional,
    trace,
    warnings,
  });

  return {
    issued: {
      count: invs.length,
      vatBuckets,
      baseSujeta,
      quotaRepercutida,
      baseExenta,
      baseIntracom,
      baseExport,
      baseCanarias,
      baseMarketplaceCollected,
      irpfWithheld,
      incomeBase,
      invoiceIncomeBase,
      marketplaceCount: mkts.length,
      marketplaceIncomeBase,
    },
    expenses: {
      count: exps.length,
      base: expenseBaseIrpf,
      vatDeductible: round2(
        domesticDeductibleVat + investmentVat + importCurrentVat + importInvestmentVat
      ),
      aibBase: euIntracomAccruedBase,
      aibQuota: euIntracomAccruedVat,
      aibDeductibleBase: round2(euCurrentDeductibleBase + euInvestmentDeductibleBase),
      aibDeductibleVat: round2(euCurrentDeductibleVat + euInvestmentDeductibleVat),
      importServiceBase: otherIspAccruedBase,
      importServiceQuota: otherIspAccruedVat,
      total: expenseTotal,
    },
    modelo303,
  };
}

export function buildModel303ChainFromRows(opts: {
  year: number;
  invoices: Model303InvoiceRow[];
  expenses: Model303ExpenseRow[];
  marketplace: Model303MarketplaceRow[];
  assets: Model303AssetRow[];
  priorYearCompensation?: number;
  presentedCarryByQuarter?: Partial<Record<1 | 2 | 3 | 4, number>>;
  quarterRange: (year: number, q: 1 | 2 | 3 | 4) => { from: Date; to: Date };
}): Record<1 | 2 | 3 | 4, ReturnType<typeof buildModel303>> {
  let pending = round2(Math.max(0, opts.priorYearCompensation ?? 0));
  let provisional = opts.priorYearCompensation == null;
  const out = {} as Record<1 | 2 | 3 | 4, ReturnType<typeof buildModel303>>;

  for (const q of [1, 2, 3, 4] as const) {
    const { from, to } = opts.quarterRange(opts.year, q);
    const agg = aggregateModel303Period({
      invoices: opts.invoices,
      expenses: opts.expenses,
      marketplace: opts.marketplace,
      assets: opts.assets,
      from,
      to,
      priorCompensation: pending,
      priorCompensationProvisional: provisional && q === 1 && pending > 0,
    });
    out[q] = agg.modelo303;

    const presentedCarry = opts.presentedCarryByQuarter?.[q];
    if (presentedCarry != null && Number.isFinite(presentedCarry)) {
      pending = round2(Math.max(0, presentedCarry));
      provisional = false;
    } else {
      pending = round2(Math.max(0, agg.modelo303.carryForward));
      provisional = true;
    }
  }

  return out;
}
