import Link from "next/link";
import { parseFiscalPeriod } from "@/lib/fiscal";
import { buildModelo115Draft } from "@/lib/modelo-115";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { Model115AuditView } from "@/components/fiscal/Model115AuditView";

export default async function Modelo115Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [draft, presented] = await Promise.all([
    buildModelo115Draft(year, quarter),
    getPresentedFiling("115", year, quarter),
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Modelo 115</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Retenciones practicadas por arrendamiento de inmuebles urbanos.
          Período por fecha de pago.
        </p>
      </div>

      <FiscalPeriodNav year={year} quarter={quarter} basePath="/fiscal/115" />

      <Model115AuditView
        year={year}
        quarter={quarter}
        draft={draft}
        presented={presented}
      />

      <p className="text-xs text-ink-muted">
        Scope Fase 9.5 · casillas 01–05 oficiales · sin 180 / AEAT ·{" "}
        <Link href="/fiscal/leases" className="text-accent underline">
          Locales arrendados
        </Link>
      </p>
    </div>
  );
}
