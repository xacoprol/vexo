import Link from "next/link";
import { parseFiscalYear } from "@/lib/fiscal";
import { buildModelo347Draft } from "@/lib/fiscal-347-349";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { Model347AuditView } from "@/components/fiscal/Model347AuditView";

export default async function Modelo347Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = parseFiscalYear(sp);
  const nowY = new Date().getFullYear();
  const years: number[] = [];
  for (let y = nowY; y >= nowY - 3; y--) years.push(y);

  const [draft, presented] = await Promise.all([
    buildModelo347Draft(year),
    getPresentedFiling("347", year, null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Modelo 347</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Declaración anual de operaciones con terceras personas — auditable
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/fiscal/347?year=${y}`}
            className={y === year ? "btn-primary text-xs" : "btn-ghost text-xs"}
          >
            {y}
          </Link>
        ))}
      </div>

      <Model347AuditView year={year} draft={draft} presented={presented} />
    </div>
  );
}
