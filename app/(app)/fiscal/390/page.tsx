import Link from "next/link";
import { parseFiscalYear } from "@/lib/fiscal";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { buildModel390Result } from "@/lib/modelo-390";
import { Model390AuditView } from "@/components/fiscal/Model390AuditView";
import { prisma } from "@/lib/prisma";

export default async function Modelo390Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = parseFiscalYear(sp);
  const nowY = new Date().getFullYear();

  const invBounds = await prisma.invoice.aggregate({
    _min: { issueDate: true },
    _max: { issueDate: true },
  });
  const yearsFromDates = [
    invBounds._min.issueDate?.getFullYear(),
    invBounds._max.issueDate?.getFullYear(),
  ].filter((y): y is number => typeof y === "number");
  const minY = yearsFromDates.length ? Math.min(...yearsFromDates) : nowY;
  const maxY = Math.max(...yearsFromDates, nowY);
  const years: number[] = [];
  for (let y = maxY; y >= Math.min(minY, nowY - 2); y--) years.push(y);

  const [result, presented] = await Promise.all([
    buildModel390Result(year),
    getPresentedFiling("390", year, null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Modelo 390</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Resumen anual IVA y conciliación con los cuatro Modelos 303
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/fiscal/390?year=${y}`}
            className={y === year ? "btn-primary text-xs" : "btn-ghost text-xs"}
          >
            {y}
          </Link>
        ))}
      </div>

      <Model390AuditView year={year} result={result} presented={presented} />
    </div>
  );
}
