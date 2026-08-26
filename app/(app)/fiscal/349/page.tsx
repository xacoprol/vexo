import Link from "next/link";
import { parseFiscalPeriod } from "@/lib/fiscal";
import { buildModelo349Draft } from "@/lib/fiscal-347-349";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { Model349AuditView } from "@/components/fiscal/Model349AuditView";

export default async function Modelo349Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [draft, presented] = await Promise.all([
    buildModelo349Draft(year, quarter),
    getPresentedFiling("349", year, quarter),
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Modelo 349</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Declaración recapitulativa intracomunitaria auditable (E/A/S/I)
        </p>
      </div>

      <FiscalPeriodNav year={year} quarter={quarter} basePath="/fiscal/349" />

      <Model349AuditView
        year={year}
        quarter={quarter}
        draft={draft}
        presented={presented}
      />

      <p className="text-xs text-ink-muted">
        Clasificación fiscal Fase 3 · NIF-IVA obligatorio ·{" "}
        <Link href="/fiscal/guide" className="text-accent underline">
          Guía fiscal
        </Link>
      </p>
    </div>
  );
}
