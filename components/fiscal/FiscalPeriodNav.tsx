import Link from "next/link";

type Props = {
  year: number;
  quarter: number;
  basePath?: string;
};

export function FiscalPeriodNav({
  year,
  quarter,
  basePath = "/fiscal",
}: Props) {
  const prev =
    quarter === 1
      ? { year: year - 1, quarter: 4 }
      : { year, quarter: quarter - 1 };
  const next =
    quarter === 4
      ? { year: year + 1, quarter: 1 }
      : { year, quarter: quarter + 1 };

  const href = (y: number, q: number) => `${basePath}?year=${y}&q=${q}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href(prev.year, prev.quarter)} className="btn-ghost text-sm">
        ← {prev.quarter}T {prev.year}
      </Link>
      <span className="rounded-lg border border-line bg-bg-elevated px-3 py-1.5 text-sm font-medium">
        {quarter}T {year}
      </span>
      <Link href={href(next.year, next.quarter)} className="btn-ghost text-sm">
        {next.quarter}T {next.year} →
      </Link>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {([1, 2, 3, 4] as const).map((q) => (
          <Link
            key={q}
            href={href(year, q)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              q === quarter
                ? "bg-accent text-white"
                : "bg-line/40 text-ink-muted hover:bg-line"
            }`}
          >
            {q}T
          </Link>
        ))}
        <Link
          href={`/fiscal/health?year=${year}&q=${quarter}`}
          className="rounded-md px-2.5 py-1 text-xs font-medium bg-line/40 text-ink-muted hover:bg-line"
        >
          Salud
        </Link>
        <Link
          href={`/fiscal/annual?year=${year}`}
          className="rounded-md px-2.5 py-1 text-xs font-medium bg-line/40 text-ink-muted hover:bg-line"
        >
          Año
        </Link>
        <Link
          href={`/fiscal/390?year=${year}`}
          className="rounded-md px-2.5 py-1 text-xs font-medium bg-line/40 text-ink-muted hover:bg-line"
        >
          390
        </Link>
      </div>
    </div>
  );
}
