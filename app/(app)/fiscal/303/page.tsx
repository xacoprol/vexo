import Link from "next/link";
import {
  buildFiscalPeriodSummary,
  parseFiscalPeriod,
} from "@/lib/fiscal";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { Model303AuditView } from "@/components/fiscal/Model303AuditView";

export default async function Modelo303Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [summary, presented] = await Promise.all([
    buildFiscalPeriodSummary(year, quarter),
    getPresentedFiling("303", year, quarter),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/fiscal?year=${year}&q=${quarter}`}
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Fiscal
        </Link>
      </div>
      <FiscalPeriodNav
        year={year}
        quarter={quarter}
        basePath="/fiscal/303"
      />
      <Model303AuditView
        year={year}
        quarter={quarter}
        periodLabel={summary.label}
        modelo303={summary.modelo303}
        presented={presented}
        expensesCount={summary.expenses.count}
        incomeBase={summary.issued.incomeBase}
        expensesBase={summary.expenses.base}
        vatRepercutida={summary.issued.quotaRepercutida}
        vatDeductible={summary.expenses.vatDeductible}
      />
    </div>
  );
}
