import Link from "next/link";
import { buildModelo190Draft } from "@/lib/modelo-190";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { Model190AuditView } from "@/components/fiscal/Model190AuditView";

export default async function Modelo190Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const [draft, presented] = await Promise.all([
    buildModelo190Draft(year),
    getPresentedFiling("190", year, null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/fiscal/annual?year=${year}`}
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Fiscal anual
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Modelo 190
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Resumen anual de retenciones profesionales. Período por paymentDate.
        </p>
        <div className="mt-3 flex gap-2 text-sm">
          <Link
            href={`/fiscal/190?year=${year - 1}`}
            className="btn-ghost"
          >
            ← {year - 1}
          </Link>
          <span className="rounded-lg border border-line px-3 py-1.5 font-medium">
            {year}
          </span>
          <Link
            href={`/fiscal/190?year=${year + 1}`}
            className="btn-ghost"
          >
            {year + 1} →
          </Link>
        </div>
      </div>

      <Model190AuditView year={year} draft={draft} presented={presented} />
    </div>
  );
}
