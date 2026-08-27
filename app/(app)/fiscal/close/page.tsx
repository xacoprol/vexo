import Link from "next/link";
import { parseFiscalPeriod, type FiscalQuarter } from "@/lib/fiscal";
import { buildFiscalPeriodValidation } from "@/lib/fiscal-validation";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { QuarterCloseView } from "@/components/fiscal/QuarterCloseView";

export default async function FiscalClosePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const q = quarter as FiscalQuarter;
  const validation = await buildFiscalPeriodValidation({ year, quarter: q });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/fiscal?year=${year}&q=${quarter}`}
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Cierre de trimestre
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Validación real sobre motores existentes. No presenta a AEAT.
        </p>
      </div>

      <FiscalPeriodNav year={year} quarter={q} basePath="/fiscal/close" />

      <QuarterCloseView validation={validation} />
    </div>
  );
}
