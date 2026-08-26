import Link from "next/link";
import { buildFiscalHealthCheck } from "@/lib/fiscal-health";
import { parseFiscalPeriod, type FiscalQuarter } from "@/lib/fiscal";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { FiscalHealthView } from "@/components/fiscal/FiscalHealthView";

export default async function FiscalHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const scope = sp.scope === "annual" ? "annual" : "quarter";

  const health =
    scope === "annual"
      ? await buildFiscalHealthCheck({ year })
      : await buildFiscalHealthCheck({
          year,
          quarter: quarter as FiscalQuarter,
        });

  const annualHref = `/fiscal/health?year=${year}&scope=annual`;
  const quarterHref = `/fiscal/health?year=${year}&q=${quarter}`;

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

      {scope === "quarter" ? (
        <FiscalPeriodNav
          year={year}
          quarter={quarter}
          basePath="/fiscal/health"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-line bg-bg-elevated px-3 py-1.5 text-sm font-medium">
            Año {year}
          </span>
          <Link href={quarterHref} className="btn-ghost text-sm">
            Ver por trimestre
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Salud fiscal
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Auditoría cruzada antes de presentar. Consume los motores fiscales
          existentes sin recalcular por su cuenta.
        </p>
      </div>

      <FiscalHealthView
        health={health}
        annualHref={annualHref}
        quarterHref={quarterHref}
      />
    </div>
  );
}
