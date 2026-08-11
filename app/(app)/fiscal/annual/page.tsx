import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/calculations";
import {
  buildFiscalYearSummary,
  parseFiscalYear,
} from "@/lib/fiscal";
import {
  getPresentedFiling,
  listPresentedForYear,
} from "@/lib/fiscal-filings";
import { FilingCompare } from "@/components/fiscal/FilingCompare";

export default async function FiscalAnnualPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = parseFiscalYear(sp);
  const nowY = new Date().getFullYear();

  const [summary, presented390, yearFilings, invBounds, mktBounds, settings] =
    await Promise.all([
      buildFiscalYearSummary(year),
      getPresentedFiling("390", year, null),
      listPresentedForYear(year),
      prisma.invoice.aggregate({
        _min: { issueDate: true },
        _max: { issueDate: true },
      }),
      prisma.marketplaceIncome.aggregate({
        _min: { issueDate: true },
        _max: { issueDate: true },
      }),
      prisma.companySettings.findFirst(),
    ]);

  const regime = settings?.fiscalRegime ?? "130";
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

  const missingExpenses = summary.expenses.count === 0;

  const presented303 = new Map(
    yearFilings
      .filter((f) => f.modelType === "303" && f.quarter != null)
      .map((f) => [f.quarter!, Number(f.result)])
  );
  const presented130 = new Map(
    yearFilings
      .filter((f) => f.modelType === "130" && f.quarter != null)
      .map((f) => [f.quarter!, Number(f.result)])
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/fiscal?year=${year}`} className="text-sm text-ink-muted hover:text-accent">
            ← Fiscal
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Resumen anual
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            IVA e IRPF del año {year} (suma orientativa de trimestres)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <Link
              key={y}
              href={`/fiscal/annual?year=${y}`}
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
      </div>

      <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
        Borrador orientativo a partir de facturas W3D, marketplace y gastos
        deducibles. Para presentar el resumen anual de IVA usa el{" "}
        <Link
          href={`/fiscal/390?year=${year}`}
          className="text-accent underline"
        >
          Modelo 390
        </Link>
        . La renta (modelo 100) se hace aparte en primavera — archivo IRPF en{" "}
        <Link href="/fiscal/archive" className="text-accent underline">
          Archivo
        </Link>
        ; checklist censal en{" "}
        <Link href="/fiscal/036" className="text-accent underline">
          036
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href={`/fiscal/390?year=${year}`} className="btn-primary text-sm">
          Abrir borrador Modelo 390
        </Link>
        <Link href="/fiscal/filings" className="btn-secondary text-sm">
          Subir presentados
        </Link>
      </div>

      <FilingCompare
        modelLabel="390"
        modelType="390"
        year={year}
        quarter={null}
        draftResult={summary.modelo390.result}
        draftBoxes={summary.modelo390.boxes}
        incomeBase={summary.issued.incomeBase}
        expensesBase={summary.expenses.base}
        vatRepercutida={summary.issued.quotaRepercutida}
        vatDeductible={summary.expenses.vatDeductible}
        presented={presented390}
      />

      {missingExpenses ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          No hay gastos deducibles en {year}. Sin ellos el IVA soportado y el
          130 salen incompletos.{" "}
          <Link href="/fiscal/expenses" className="font-medium underline">
            Registrar gastos
          </Link>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            label: "Ingresos computables",
            value: summary.issued.incomeBase,
            hint: "W3D + marketplace",
          },
          {
            label: "Gastos (base)",
            value: summary.expenses.base,
            hint: "Deducibles",
          },
          {
            label: "IVA neto (suma 303)",
            value: summary.ivaNetYear,
            hint: summary.ivaNetYear >= 0 ? "A ingresar" : "A compensar",
          },
          {
            label: "IRPF fraccionado (suma 130)",
            value: summary.irpfPaymentsYear,
            hint: regime === "131" ? "Régimen 131 activo" : "Pagos estimados",
          },
          {
            label: "Retenciones IRPF",
            value: summary.issued.irpfWithheld,
            hint: "En facturas emitidas",
          },
          {
            label: "IVA soportado",
            value: summary.expenses.vatDeductible,
            hint: "Gastos deducibles",
          },
        ].map((card) => (
          <div key={card.label} className="card-panel p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            <p className="mt-2 font-mono text-xl font-semibold tracking-tight">
              {formatCurrency(card.value)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
          </div>
        ))}
      </div>

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Por trimestre</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Resultado estimado de cada modelo
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Periodo</th>
              <th className="px-4 py-2 text-right font-medium">Ingresos</th>
              <th className="px-4 py-2 text-right font-medium">Gastos</th>
              <th className="px-4 py-2 text-right font-medium">303 borrador</th>
              <th className="px-4 py-2 text-right font-medium">303 present.</th>
              <th className="px-4 py-2 text-right font-medium">130 borrador</th>
              <th className="px-4 py-2 text-right font-medium">130 present.</th>
            </tr>
          </thead>
          <tbody>
            {summary.quarters.map((q) => (
              <tr key={q.quarter} className="border-b border-line/50">
                <td className="px-4 py-2 font-medium">{q.label}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatCurrency(q.incomeBase)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatCurrency(q.expensesBase)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  <Link
                    href={`/fiscal/303?year=${year}&q=${q.quarter}`}
                    className="hover:text-accent"
                  >
                    {formatCurrency(q.modelo303Result)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted">
                  {presented303.has(q.quarter)
                    ? formatCurrency(presented303.get(q.quarter)!)
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  <Link
                    href={`/fiscal/130?year=${year}&q=${q.quarter}`}
                    className="hover:text-accent"
                  >
                    {formatCurrency(q.modelo130Result)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink-muted">
                  {presented130.has(q.quarter)
                    ? formatCurrency(presented130.get(q.quarter)!)
                    : "—"}
                </td>
              </tr>
            ))}
            <tr className="bg-line/20 font-medium">
              <td className="px-4 py-2">Total {year}</td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(summary.issued.incomeBase)}
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(summary.expenses.base)}
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(summary.ivaNetYear)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-ink-muted">
                {formatCurrency(
                  [...presented303.values()].reduce((s, v) => s + v, 0)
                )}
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(summary.irpfPaymentsYear)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-ink-muted">
                {formatCurrency(
                  [...presented130.values()].reduce((s, v) => s + v, 0)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnnualModeloDraft
          title="IVA anual (agregado)"
          how="Suma de bases y cuotas del año (sin cadena de compensación). El resultado a ingresar neto del año es la suma de las casillas 69 trimestrales."
          boxes={summary.modelo303.boxes}
          result={summary.ivaNetYear}
          resultLabel="Suma resultados 303 (casilla 69 de cada T)"
          incomplete={missingExpenses}
        />
        <AnnualModeloDraft
          title="IRPF anual (130 · 4T acumulado)"
          how="Casillas del 4T: acumulado desde 1 ene, con pagos previos del año en casilla 05. El total de pagos fraccionados es la suma de resultados positivos de cada trimestre."
          boxes={summary.modelo130.boxes}
          result={summary.irpfPaymentsYear}
          resultLabel="Suma a ingresar en los 4 trimestres (solo positivos)"
          incomplete={missingExpenses}
          altResultNote={`Casilla 07 del 4T: ${formatCurrency(summary.modelo130.result)}`}
        />
      </div>
    </div>
  );
}

function AnnualModeloDraft({
  title,
  how,
  boxes,
  result,
  resultLabel,
  incomplete,
  altResultNote,
}: {
  title: string;
  how: string;
  boxes: { code: string; label: string; value: number }[];
  result: number;
  resultLabel: string;
  incomplete: boolean;
  altResultNote?: string;
}) {
  const positive = result >= 0;
  return (
    <section className="card-panel space-y-4 p-5">
      <div>
        <h2 className="form-section-title">{title}</h2>
        <p className="form-section-hint">{how}</p>
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
            {boxes.map((b) => (
              <tr key={`${b.code}-${b.label}`} className="border-b border-line/50">
                <td className="px-2 py-2 font-mono text-ink-muted">{b.code}</td>
                <td className="px-2 py-2">{b.label}</td>
                <td className="px-2 py-2 text-right font-mono">
                  {formatCurrency(b.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className={`rounded-lg px-4 py-3 text-sm ${
          incomplete
            ? "bg-line/40 text-ink-muted"
            : positive
              ? "bg-warning/10 text-warning"
              : "bg-success/10 text-success"
        }`}
      >
        <p className="font-medium">
          {resultLabel}:{" "}
          <span className="font-mono font-semibold">
            {formatCurrency(Math.abs(result))}
          </span>
          {incomplete ? " (incompleto)" : null}
          {!incomplete && !positive ? " (a compensar)" : null}
        </p>
        {altResultNote ? (
          <p className="mt-1 text-xs opacity-90">{altResultNote}</p>
        ) : null}
      </div>
    </section>
  );
}
