import type { FiscalQuarter } from "@/lib/fiscal";
import { yearRange } from "@/lib/fiscal";
import {
  compute347CashAccountingAmounts,
  type Model347PaymentRow,
} from "@/lib/modelo-347/cash-accounting";
import {
  assess347PurchaseEligibility,
  assess347SaleEligibility,
  eligibilityReasonLabel,
} from "@/lib/modelo-347/eligibility";
import {
  addToQuarter,
  emptyQuarters,
  fiscalQuarterFromDate,
} from "@/lib/modelo-347/deadlines";
import { resolve347Operator } from "@/lib/modelo-347/operator";
import {
  compute347InvoiceAmount,
  type Model347OriginalInvoiceRef,
} from "@/lib/modelo-347/rectification";
import { exceeds347Threshold, round2 } from "@/lib/modelo-347/threshold";
import type {
  Model347ExcludedOperation,
  Model347OperationType,
  Model347Operator,
  Model347QuarterAmounts,
  Model347TraceLine,
  Model347Warning,
} from "@/lib/modelo-347/types";

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type Model347InvoiceRow = {
  id: string;
  fullNumber: string | null;
  issueDate: Date;
  total: number;
  status: string;
  fiscalStatus: string;
  vatOperationType: string | null;
  invoiceFiscalType?: string | null;
  rectificationMethod?: string | null;
  rectifiesInvoiceId?: string | null;
  substitutionCorrectSubtotal?: number | null;
  substitutionCorrectVat?: number | null;
  substitutionCorrectTotal?: number | null;
  cashAccounting?: boolean;
  paymentMethod?: string | null;
  operationKey347?: string | null;
  payments?: Model347PaymentRow[];
  client: {
    id: string;
    name: string;
    nif: string;
    countryCode: string | null;
  };
};

export type Model347ExpenseRow = {
  id: string;
  issueDate: Date;
  total: number;
  vatOperationType: string | null;
  supplierName: string;
  supplierNif: string | null;
};

export type Model347MarketplaceRow = {
  id: string;
  issueDate: Date;
  total: number;
  channel: string;
  shipToCountry: string | null;
  invoiceId: string | null;
};

type Raw347Line = {
  operatorKey: string;
  operatorId: string;
  taxId: string;
  name: string;
  country: string | null;
  operationType: Model347OperationType;
  amount: number;
  quarter: FiscalQuarter;
  trace: Model347TraceLine;
  isCashAccounting?: boolean;
  cashAccountingQuarter?: FiscalQuarter;
  cashPaymentHint?: number;
  requiresReview?: boolean;
};

type OperatorBucket = Model347Operator & {
  quarters: Model347QuarterAmounts;
  cashAccountingQuarters: Model347QuarterAmounts;
};

function operatorAggregateKey(
  taxId: string,
  operationType: Model347OperationType
): string {
  return `${operationType}|${taxId}`;
}

function resolveSaleOperationType(
  operationKey347: string | null | undefined
): Model347OperationType {
  const k = (operationKey347 ?? "B").trim().toUpperCase().slice(0, 1);
  return k === "A" ? "A" : "B";
}

function inYear(d: Date, from: Date, to: Date): boolean {
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
}

function isCashPaymentMethod(method: string | null | undefined): boolean {
  const m = String(method ?? "").toLowerCase();
  return (
    m.includes("efectivo") ||
    m.includes("metalico") ||
    m.includes("metálico") ||
    m === "cash"
  );
}

export function effective347OperatorAmount(op: Model347Operator): number {
  return round2(op.annualAmount + (op.cashAccountingAnnualAmount ?? 0));
}

export function collect347InvoiceLines(
  invoices: Model347InvoiceRow[],
  from: Date,
  to: Date,
  warnings: Model347Warning[],
  excluded: Model347ExcludedOperation[],
  opts?: { originalsById?: Map<string, Model347OriginalInvoiceRef> }
): Raw347Line[] {
  const lines: Raw347Line[] = [];
  const originals = opts?.originalsById ?? new Map();

  for (const inv of invoices) {
    if (!inYear(inv.issueDate, from, to)) continue;

    const eligibility = assess347SaleEligibility({
      vatOperationType: inv.vatOperationType,
      status: inv.status,
      fiscalStatus: inv.fiscalStatus,
      clientTaxId: inv.client.nif,
      clientCountryCode: inv.client.countryCode,
      invoiceFiscalType: inv.invoiceFiscalType,
    });

    const original = inv.rectifiesInvoiceId
      ? originals.get(inv.rectifiesInvoiceId) ?? null
      : null;

    const fiscalAmount = compute347InvoiceAmount(inv, original);

    if (!eligibility.include) {
      excluded.push({
        sourceType: "invoice",
        sourceId: inv.id,
        label: inv.fullNumber ?? `Factura ${inv.id.slice(0, 8)}`,
        operatorName: inv.client.name,
        amount: fiscalAmount,
        reason: eligibility.reason,
        reasonLabel: eligibilityReasonLabel(eligibility.reason),
      });
      continue;
    }

    const op = resolve347Operator({
      taxIdRaw: inv.client.nif,
      name: inv.client.name,
      countryCode: inv.client.countryCode,
      entityId: inv.client.id,
    });

    if (!op.valid) {
      warnings.push({
        code: op.code,
        message: `${inv.fullNumber ?? inv.id}: ${op.code}`,
        sourceId: inv.id,
      });
      excluded.push({
        sourceType: "invoice",
        sourceId: inv.id,
        label: inv.fullNumber ?? inv.id,
        operatorName: inv.client.name,
        amount: fiscalAmount,
        reason: "EXCLUDED_OPERATOR_UNKNOWN",
        reasonLabel: eligibilityReasonLabel("EXCLUDED_OPERATOR_UNKNOWN"),
      });
      continue;
    }

    const cashHint = isCashPaymentMethod(inv.paymentMethod)
      ? round2(Math.abs(fiscalAmount))
      : 0;

    if (cashHint > 0) {
      warnings.push({
        code: "MODEL347_CASH_PAYMENTS_DATA_LIMITED",
        message: `${inv.fullNumber ?? inv.id}: posible cobro en metálico — importe informativo separado del total declarable.`,
        sourceId: inv.id,
      });
    }

    const operationType = resolveSaleOperationType(inv.operationKey347);
    const operatorKey = operatorAggregateKey(op.taxId, operationType);

    if (inv.cashAccounting) {
      const cash = compute347CashAccountingAmounts({
        invoiceTotal: num(inv.total),
        payments: inv.payments ?? [],
        yearFrom: from,
        yearTo: to,
      });

      if (!cash.complete) {
        warnings.push({
          code: "MODEL347_CASH_ACCOUNTING_DATA_INCOMPLETE",
          message: `${inv.fullNumber ?? inv.id}: criterio de caja — ${cash.reason}.`,
          sourceId: inv.id,
        });
        lines.push({
          operatorKey,
          operatorId: op.operatorId,
          taxId: op.taxId,
          name: op.name,
          country: op.country,
          operationType,
          amount: 0,
          quarter: fiscalQuarterFromDate(inv.issueDate),
          requiresReview: true,
          cashPaymentHint: cashHint,
          trace: {
            sourceType: "invoice",
            sourceId: inv.id,
            label: inv.fullNumber ?? `Factura ${inv.id.slice(0, 8)}`,
            issueDate: inv.issueDate.toISOString().slice(0, 10),
            amount: 0,
            quarter: fiscalQuarterFromDate(inv.issueDate),
            href: `/invoices/${inv.id}`,
          },
        });
        continue;
      }

      for (const p of inv.payments ?? []) {
        if (p.paidAt < from || p.paidAt > to) continue;
        const amount = round2(num(p.amount));
        const quarter = fiscalQuarterFromDate(p.paidAt);
        lines.push({
          operatorKey,
          operatorId: op.operatorId,
          taxId: op.taxId,
          name: op.name,
          country: op.country,
          operationType,
          amount,
          quarter,
          isCashAccounting: true,
          cashAccountingQuarter: quarter,
          cashPaymentHint: cashHint,
          trace: {
            sourceType: "invoice",
            sourceId: inv.id,
            label: `${inv.fullNumber ?? inv.id} · cobro ${p.paidAt.toISOString().slice(0, 10)}`,
            issueDate: p.paidAt.toISOString().slice(0, 10),
            amount,
            quarter,
            href: `/invoices/${inv.id}`,
          },
        });
      }
      continue;
    }

    const amount = fiscalAmount;
    const quarter = fiscalQuarterFromDate(inv.issueDate);

    lines.push({
      operatorKey,
      operatorId: op.operatorId,
      taxId: op.taxId,
      name: op.name,
      country: op.country,
      operationType,
      amount,
      quarter,
      cashPaymentHint: cashHint,
      trace: {
        sourceType: "invoice",
        sourceId: inv.id,
        label: inv.fullNumber ?? `Factura ${inv.id.slice(0, 8)}`,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        amount,
        quarter,
        href: `/invoices/${inv.id}`,
      },
    });
  }

  return lines;
}

export function collect347ExpenseLines(
  expenses: Model347ExpenseRow[],
  from: Date,
  to: Date,
  warnings: Model347Warning[],
  excluded: Model347ExcludedOperation[]
): Raw347Line[] {
  const lines: Raw347Line[] = [];

  for (const e of expenses) {
    if (!inYear(e.issueDate, from, to)) continue;

    const eligibility = assess347PurchaseEligibility({
      vatOperationType: e.vatOperationType,
      supplierTaxId: e.supplierNif ?? "",
      supplierName: e.supplierName,
    });

    if (!eligibility.include) {
      excluded.push({
        sourceType: "expense",
        sourceId: e.id,
        label: e.supplierName,
        operatorName: e.supplierName,
        amount: num(e.total),
        reason: eligibility.reason,
        reasonLabel: eligibilityReasonLabel(eligibility.reason),
      });
      continue;
    }

    const op = resolve347Operator({
      taxIdRaw: e.supplierNif,
      name: e.supplierName,
    });

    if (!op.valid) {
      warnings.push({
        code: op.code,
        message: `${e.supplierName}: ${op.code}`,
        sourceId: e.id,
      });
      excluded.push({
        sourceType: "expense",
        sourceId: e.id,
        label: e.supplierName,
        operatorName: e.supplierName,
        amount: num(e.total),
        reason: "EXCLUDED_OPERATOR_UNKNOWN",
        reasonLabel: eligibilityReasonLabel("EXCLUDED_OPERATOR_UNKNOWN"),
      });
      continue;
    }

    const amount = num(e.total);
    const quarter = fiscalQuarterFromDate(e.issueDate);

    lines.push({
      operatorKey: operatorAggregateKey(op.taxId, "A"),
      operatorId: op.operatorId,
      taxId: op.taxId,
      name: op.name,
      country: op.country,
      operationType: "A",
      amount,
      quarter,
      trace: {
        sourceType: "expense",
        sourceId: e.id,
        label: e.supplierName,
        issueDate: e.issueDate.toISOString().slice(0, 10),
        amount,
        quarter,
        href: `/fiscal/expenses?id=${e.id}`,
      },
    });
  }

  return lines;
}

export function collect347MarketplaceExcluded(
  rows: Model347MarketplaceRow[],
  from: Date,
  to: Date,
  warnings: Model347Warning[],
  excluded: Model347ExcludedOperation[]
): void {
  for (const m of rows) {
    if (!inYear(m.issueDate, from, to)) continue;
    if (m.invoiceId) continue;

    warnings.push({
      code: "MARKETPLACE_347_REVIEW_REQUIRED",
      message: `Ingreso ${m.channel} sin factura/contraparte identificable — no entra en 347 automáticamente.`,
      sourceId: m.id,
    });
    excluded.push({
      sourceType: "marketplace",
      sourceId: m.id,
      label: `${m.channel} · ${m.shipToCountry ?? "?"}`,
      operatorName: null,
      amount: num(m.total),
      reason: "EXCLUDED_MARKETPLACE_NO_OPERATOR",
      reasonLabel: eligibilityReasonLabel("EXCLUDED_MARKETPLACE_NO_OPERATOR"),
    });
  }
}

export function group347Operators(lines: Raw347Line[]): Model347Operator[] {
  const map = new Map<string, OperatorBucket>();

  for (const line of lines) {
    let cur = map.get(line.operatorKey);
    if (!cur) {
      cur = {
        operatorId: line.operatorId,
        taxId: line.taxId,
        name: line.name,
        country: line.country,
        operationType: line.operationType,
        annualAmount: 0,
        cashAccountingAnnualAmount: 0,
        cashPaymentHintAmount: 0,
        quarters: emptyQuarters(),
        cashAccountingQuarters: emptyQuarters(),
        trace: [],
        declarable: false,
        requiresReview: false,
      };
      map.set(line.operatorKey, cur);
    }

    if (line.requiresReview) {
      cur.requiresReview = true;
    }

    if (line.cashPaymentHint) {
      cur.cashPaymentHintAmount = round2(
        (cur.cashPaymentHintAmount ?? 0) + line.cashPaymentHint
      );
    }

    cur.trace.push(line.trace);

    if (line.isCashAccounting) {
      cur.cashAccountingAnnualAmount = round2(
        (cur.cashAccountingAnnualAmount ?? 0) + line.amount
      );
      if (line.cashAccountingQuarter) {
        addToQuarter(cur.cashAccountingQuarters, line.cashAccountingQuarter, line.amount);
      }
    } else if (!line.requiresReview) {
      cur.annualAmount = round2(cur.annualAmount + line.amount);
      addToQuarter(cur.quarters, line.quarter, line.amount);
    }
  }

  return [...map.values()]
    .map((o) => {
      const effective = effective347OperatorAmount(o);
      const hasCash =
        o.cashAccountingAnnualAmount != null && o.cashAccountingAnnualAmount > 0;
      return {
        operatorId: o.operatorId,
        taxId: o.taxId,
        name: o.name,
        country: o.country,
        operationType: o.operationType,
        annualAmount: o.annualAmount,
        cashAccountingAnnualAmount: hasCash ? o.cashAccountingAnnualAmount : undefined,
        cashAccountingQuarters: hasCash ? o.cashAccountingQuarters : undefined,
        cashPaymentHintAmount:
          o.cashPaymentHintAmount && o.cashPaymentHintAmount > 0
            ? o.cashPaymentHintAmount
            : undefined,
        quarters: o.quarters,
        trace: o.trace,
        requiresReview: o.requiresReview || undefined,
        declarable: exceeds347Threshold(effective) && !o.requiresReview,
      };
    })
    .sort((a, b) => Math.abs(effective347OperatorAmount(b)) - Math.abs(effective347OperatorAmount(a)));
}

export function aggregate347Year(opts: {
  invoices: Model347InvoiceRow[];
  expenses: Model347ExpenseRow[];
  marketplace: Model347MarketplaceRow[];
  year: number;
  originalsById?: Map<string, Model347OriginalInvoiceRef>;
}): {
  operators: Model347Operator[];
  declarableOperators: Model347Operator[];
  excludedOperations: Model347ExcludedOperation[];
  warnings: Model347Warning[];
  skippedOperatorReview: number;
  requiresReview: boolean;
} {
  const { from, to } = yearRange(opts.year);
  const warnings: Model347Warning[] = [];
  const excluded: Model347ExcludedOperation[] = [];

  const invLines = collect347InvoiceLines(
    opts.invoices,
    from,
    to,
    warnings,
    excluded,
    { originalsById: opts.originalsById }
  );
  const expLines = collect347ExpenseLines(opts.expenses, from, to, warnings, excluded);
  collect347MarketplaceExcluded(opts.marketplace, from, to, warnings, excluded);

  const operators = group347Operators([...invLines, ...expLines]);
  const declarableOperators = operators.filter((o) => o.declarable);

  const skippedOperatorReview = warnings.filter((w) =>
    w.code.startsWith("OPERATOR_347")
  ).length;

  const requiresReview =
    operators.some((o) => o.requiresReview) ||
    warnings.some((w) => w.code === "MODEL347_CASH_ACCOUNTING_DATA_INCOMPLETE");

  return {
    operators,
    declarableOperators,
    excludedOperations: excluded,
    warnings,
    skippedOperatorReview,
    requiresReview,
  };
}
