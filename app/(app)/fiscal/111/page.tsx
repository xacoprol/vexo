import Link from "next/link";
import { parseFiscalPeriod } from "@/lib/fiscal";
import { buildModelo111Draft } from "@/lib/modelo-111";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { Model111AuditView } from "@/components/fiscal/Model111AuditView";

export default async function Modelo111Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [draft, presented] = await Promise.all([
    buildModelo111Draft(year, quarter),
    getPresentedFiling("111", year, quarter),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/fiscal?year=${year}&q=${quarter}`}
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Modelo 111</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Retenciones practicadas a profesionales (actividades económicas).
          Período por fecha de pago.
        </p>
      </div>

      <FiscalPeriodNav year={year} quarter={quarter} basePath="/fiscal/111" />

      <Model111AuditView
        year={year}
        quarter={quarter}
        draft={draft}
        presented={presented}
      />

      <p className="text-xs text-ink-muted">
        Scope Fase 9.4 · sin nóminas / 190 / complementarias ·{" "}
        <Link href="/fiscal/guide" className="text-accent underline">
          Guía fiscal
        </Link>
      </p>
    </div>
  );
}
