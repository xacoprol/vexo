import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/calculations";
import {
  buildFiscalYearSummary,
  parseFiscalYear,
} from "@/lib/fiscal";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FilingCompare } from "@/components/fiscal/FilingCompare";

export default async function Modelo390Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = parseFiscalYear(sp);
  const nowY = new Date().getFullYear();

  const [summary, presented, invBounds, mktBounds] = await Promise.all([
    buildFiscalYearSummary(year),
    getPresentedFiling("390", year, null),
    prisma.invoice.aggregate({
      _min: { issueDate: true },
      _max: { issueDate: true },
    }),
    prisma.marketplaceIncome.aggregate({
      _min: { issueDate: true },
      _max: { issueDate: true },
    }),
  ]);

  const yearsFromDates = [
    invBounds._min.issueDate?.getFullYear(),
    invBounds._max.issueDate?.getFullYear(),
    mktBounds._min.issueDate?.getFullYear(),
    mktBounds._max.issueDate?.getFullYear(),
  ].filter((y): y is number => typeof y === "number");
  const minY = yearsFromDates.length ? Math.min(...yearsFromDates) : nowY;
  const maxY = Math.max(...yearsFromDates, nowY);
  const years: number[] = [];
  for (let y = maxY; y >= Math.min(minY, nowY - 2); y--) years.push(y);

  const draft = summary.modelo390;
  const missingExpenses = summary.expenses.count === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/fiscal/annual?year=${year}`}
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Resumen anual
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Modelo 390
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Declaración-resumen anual del IVA · ejercicio {year} (borrador)
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/fiscal/390?year=${y}`}
            className={
              y === year
                ? "btn-primary px-3 py-1.5 text-sm"
                : "btn-ghost px-3 py-1.5 text-sm"
            }
          >
            {y}
          </Link>
        ))}
      </div>

      <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
        El <strong className="font-medium text-ink">390</strong> es{" "}
        <strong className="font-medium text-ink">informativo</strong>: no
        genera un pago nuevo. Se presenta en enero (
        {year + 1}) y debe cuadrar con la suma de tus cuatro{" "}
        <Link
          href={`/fiscal/303?year=${year}&q=1`}
          className="text-accent underline"
        >
          303
        </Link>
        . Copia estas cifras en la sede AEAT; las numeraciones de casilla son
        orientativas.
      </p>

      <FilingCompare
        modelLabel="390"
        modelType="390"
        year={year}
        quarter={null}
        draftResult={draft.result}
        draftBoxes={draft.boxes}
        incomeBase={summary.issued.incomeBase}
        expensesBase={summary.expenses.base}
        vatRepercutida={summary.issued.quotaRepercutida}
        vatDeductible={summary.expenses.vatDeductible}
        presented={presented}
      />

      {missingExpenses ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Sin gastos en {year} el IVA deducible va a 0.{" "}
          <Link href="/fiscal/expenses" className="font-medium underline">
            Registrar gastos
          </Link>
        </p>
      ) : null}

      <section className="card-panel space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="form-section-title">Casillas orientativas</h2>
          <p className="form-section-hint">
            Agregado anual de facturas W3D + marketplace taxable − gastos
            deducibles. Contrasta con tus 303 presentados.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Casilla</th>
                <th className="px-2 py-2 text-left font-medium">Concepto</th>
                <th className="px-2 py-2 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {draft.boxes.map((b) => (
                <tr
                  key={`${b.code}-${b.label}`}
                  className="border-b border-line/50"
                >
                  <td className="px-2 py-2 font-mono text-ink-muted">
                    {b.code}
                  </td>
                  <td className="px-2 py-2">{b.label}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCurrency(b.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg bg-line/40 px-4 py-3 text-sm text-ink-muted">
          <p className="font-medium text-ink">
            Resultado liquidación anual (suma 303):{" "}
            <span className="font-mono font-semibold">
              {formatCurrency(draft.result)}
            </span>
            {missingExpenses ? " (incompleto)" : null}
          </p>
          <p className="mt-1 text-xs">
            No es un importe a ingresar con el 390. Es la referencia de lo ya
            liquidado (o a compensar) en los trimestres.
          </p>
        </div>
      </section>

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Cuadre con los 303</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Trimestre</th>
              <th className="px-4 py-2 text-right font-medium">Resultado 303</th>
            </tr>
          </thead>
          <tbody>
            {summary.quarters.map((q) => (
              <tr key={q.quarter} className="border-b border-line/50">
                <td className="px-4 py-2">
                  <Link
                    href={`/fiscal/303?year=${year}&q=${q.quarter}`}
                    className="hover:text-accent"
                  >
                    {q.label}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatCurrency(q.modelo303Result)}
                </td>
              </tr>
            ))}
            <tr className="bg-line/20 font-medium">
              <td className="px-4 py-2">Total año</td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(summary.ivaNetYear)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <p className="text-xs text-ink-muted">
        Plazo habitual: 1–30 de enero de {year + 1}. Si estás en SII u otras
        excepciones, puede que no debas presentar el 390; consulta tu
        situación en la AEAT o con tu gestor.
      </p>
    </div>
  );
}
