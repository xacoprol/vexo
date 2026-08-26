import { aggregateIrpfExpenses } from "@/lib/modelo-130/irpf-expenses";
import { aggregateIrpfIncome } from "@/lib/modelo-130/irpf-income";
import { computeIrpfDepreciation } from "@/lib/modelo-130/irpf-depreciation";
import { aggregateIrpfWithholdings } from "@/lib/modelo-130/irpf-withholdings";
import {
  buildModel130Chain,
  model130BoxesToList,
} from "@/lib/modelo-130/engine";
import { parseIrpfDirectEstimationMode } from "@/lib/modelo-130/constants";
import { assess130FilingObligation } from "@/lib/modelo-130/filing-obligation";
import type {
  FiscalQuarter,
  Model130Config,
  Model130QuarterResult,
  PresentedQuarter130,
} from "@/lib/modelo-130/types";
import type { AmortizationPeriodInput } from "@/lib/investment-amortization";

function quarterRange(
  year: number,
  quarter: FiscalQuarter
): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1, 0, 0, 0, 0);
  const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  return { from, to };
}

function yearStart(year: number): Date {
  return new Date(year, 0, 1, 0, 0, 0, 0);
}

export type Model130DataInvoice = {
  id: string;
  fullNumber?: string;
  issueDate: Date;
  subtotal: unknown;
  irpfAmount: unknown;
  status: string;
  fiscalStatus: string;
  cashAccounting?: boolean;
};

export type Model130DataExpense = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  vatOperationType: string | null;
  deductible?: boolean | null;
  vatDeductiblePct?: number | null;
  irpfDeductiblePct?: number | null;
  isInvestment: boolean;
  description?: string | null;
  supplierName?: string | null;
};

export type Model130DataMarketplace = {
  id: string;
  issueDate: Date;
  subtotal: unknown;
  channel?: string;
  orderId?: string | null;
  invoiceId?: string | null;
};

export type Model130AmortRow = AmortizationPeriodInput & {
  assetId?: string;
  label?: string;
};

export function assembleModel130Chain(opts: {
  year: number;
  config: Model130Config;
  invoices: Model130DataInvoice[];
  expenses: Model130DataExpense[];
  marketplace: Model130DataMarketplace[];
  amortRows: Model130AmortRow[];
  presented: Partial<Record<FiscalQuarter, PresentedQuarter130>>;
}): Record<FiscalQuarter, Model130QuarterResult> {
  const yearFrom = yearStart(opts.year);
  const quarters = {} as Model130QuarterResult extends infer _R
    ? Record<
        FiscalQuarter,
        {
          incomeBase: number;
          ordinaryExpenseBase: number;
          amortizationYtd: number;
          irpfWithheld: number;
          incomeLines: import("@/lib/modelo-130/types").Model130TraceLine[];
          expenseLines: import("@/lib/modelo-130/types").Model130TraceLine[];
          amortizationLines: import("@/lib/modelo-130/types").Model130TraceLine[];
          withholdingLines: import("@/lib/modelo-130/types").Model130TraceLine[];
        }
      >
    : never;

  let hasCashAccounting = false;
  let incomeWithWithholdingQ4 = 0;
  let incomeBaseQ4 = 0;

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const { to } = quarterRange(opts.year, q);
    const income = aggregateIrpfIncome({
      invoices: opts.invoices,
      marketplace: opts.marketplace,
      from: yearFrom,
      to,
    });
    if (income.hasCashAccountingInvoices) hasCashAccounting = true;
    if (q === 4) {
      incomeBaseQ4 = income.total;
      incomeWithWithholdingQ4 = income.incomeWithWithholding;
    }
    const exp = aggregateIrpfExpenses({
      expenses: opts.expenses,
      from: yearFrom,
      to,
    });
    const amort = computeIrpfDepreciation({
      rows: opts.amortRows,
      year: opts.year,
      quarter: q,
    });
    const wh = aggregateIrpfWithholdings({
      invoices: opts.invoices,
      from: yearFrom,
      to,
    });

    quarters[q] = {
      incomeBase: income.total,
      ordinaryExpenseBase: exp.ordinaryBase,
      amortizationYtd: amort.ytd,
      irpfWithheld: wh.total,
      incomeLines: income.lines,
      expenseLines: exp.lines,
      amortizationLines: amort.lines,
      withholdingLines: wh.lines,
    };
  }

  const isProfessional =
    opts.config.activityKind130 === "PROFESSIONAL"
      ? true
      : opts.config.activityKind130 === "BUSINESS"
        ? false
        : null;

  const filingObligation = assess130FilingObligation({
    fiscalRegime: opts.config.fiscalRegime,
    incomeBaseYtd: incomeBaseQ4,
    incomeWithWithholdingYtd: incomeWithWithholdingQ4,
    isProfessionalActivity: isProfessional,
    priorYearWithholdingPct: opts.config.priorYearWithholdingPct130 ?? null,
    currentYear: opts.year,
  });

  const config: Model130Config = {
    ...opts.config,
    hasCashAccountingInvoices: hasCashAccounting,
    filingObligation,
  };

  return buildModel130Chain({
    year: opts.year,
    config,
    quarters,
    presented: opts.presented,
  });
}

export function model130ResultToModeloBoxes(
  result: Model130QuarterResult,
  config: Model130Config
): {
  boxes: { code: string; label: string; value: number }[];
  result: number;
  warnings: typeof result.warnings;
  trace: typeof result.trace;
} {
  const mode = parseIrpfDirectEstimationMode(config.irpfDirectEstimationMode);
  return {
    boxes: model130BoxesToList(result.boxes, mode),
    result: result.result,
    warnings: result.warnings,
    trace: result.trace,
    filingObligation: result.filingObligation,
    scopeNote: result.scopeNote,
  };
}
