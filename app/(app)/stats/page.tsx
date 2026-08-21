import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/calculations";
import { buildYearStats } from "@/lib/stats";
import { buildFiscalYearSummary } from "@/lib/fiscal";
import { buildOfficialYearHistory } from "@/lib/fiscal-filings";
import {
  CashflowChart,
  IncomeMixChart,
  ProfitChart,
} from "@/components/stats/StatsCharts";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const nowY = new Date().getFullYear();
  const yearRaw = parseInt(sp.year ?? "", 10);
  const year =
    Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
      ? yearRaw
      : nowY;

  const [stats, fiscal, official, invBounds, mktBounds, filingBounds] =
    await Promise.all([
      buildYearStats(year),
      buildFiscalYearSummary(year),
      buildOfficialYearHistory(year),
      prisma.invoice.aggregate({
        _min: { issueDate: true },
        _max: { issueDate: true },
      }),
      prisma.marketplaceIncome.aggregate({
        _min: { issueDate: true },
        _max: { issueDate: true },
      }),
      prisma.fiscalFiling.aggregate({
        _min: { year: true },
        _max: { year: true },
      }),
    ]);

  const yearsFromDates = [
    invBounds._min.issueDate?.getFullYear(),
    invBounds._max.issueDate?.getFullYear(),
    mktBounds._min.issueDate?.getFullYear(),
    mktBounds._max.issueDate?.getFullYear(),
    filingBounds._min.year ?? undefined,
    filingBounds._max.year ?? undefined,
  ].filter((y): y is number => typeof y === "number");
  const minY = yearsFromDates.length ? Math.min(...yearsFromDates) : nowY;
  const maxY = Math.max(...yearsFromDates, nowY);
  const years: number[] = [];
  for (let y = maxY; y >= Math.min(minY, nowY - 2); y--) years.push(y);

  const mixData = stats.months.map((m) => ({
    label: m.label,
    invoicesBase: m.invoicesBase,
    amazonBase: m.amazonBase,
    shopifyBase: m.shopifyBase,
  }));

  const cashData = stats.months.map((m) => ({
    label: m.label,
    invoicesTotal: m.invoicesTotal,
    collected: m.collected,
  }));

  const profitData = stats.months.map((m) => ({
    label: m.label,
    incomeBase: m.incomeBase,
    expensesBase: m.expensesBase,
    netBase: m.netBase,
  }));

  const panelVsOfficial =
    official.incomeBase != null
      ? Math.round((stats.incomeBase - official.incomeBase) * 100) / 100
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Estadísticas
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Ingresos del panel y, si hay modelos presentados, histórico
            registrado en Vexo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <Link
              key={y}
              href={`/stats?year=${y}`}
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
        <strong className="font-medium text-ink">Panel</strong> = facturas W3D
        + marketplace + gastos registrados.{" "}
        <strong className="font-medium text-ink">Gestoría</strong> = totales de
        modelos 130/303/390 presentados (agregados, no detalle).
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {
            label: "Ingresos (base)",
            value: stats.incomeBase,
            hint: "W3D + marketplaces",
          },
          {
            label: "Facturado W3D",
            value: stats.invoicesTotal,
            hint: `Base ${formatCurrency(stats.invoicesBase)}`,
          },
          {
            label: "Cobrado",
            value: stats.collected,
            hint: "Pagos del año",
          },
          {
            label: "Pendiente cobro",
            value: stats.pendingCollect,
            hint: `${stats.pendingCount} facturas`,
          },
          {
            label: "Gastos (base)",
            value: stats.expensesBase,
            hint: "Deducibles",
          },
          {
            label: "Margen neto",
            value: stats.netBase,
            hint: "Ingresos − gastos",
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

      <section className="card-panel p-5">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Beneficio mes a mes ({year})
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Bases imponibles del panel · ingresos − gastos deducibles (sin IVA)
            </p>
          </div>
        </div>
        <div className="mt-4">
          <ProfitChart data={profitData} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Mes</th>
                <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                <th className="px-3 py-2 text-right font-medium">Gastos</th>
                <th className="px-3 py-2 text-right font-medium">Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {stats.months.map((m) => (
                <tr key={m.key} className="border-b border-line/50">
                  <td className="px-3 py-2 capitalize">{m.label}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatCurrency(m.incomeBase)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatCurrency(m.expensesBase)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono font-medium ${
                      m.netBase >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatCurrency(m.netBase)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-line/10 font-medium">
                <td className="px-3 py-2">Total {year}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatCurrency(stats.incomeBase)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatCurrency(stats.expensesBase)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    stats.netBase >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatCurrency(stats.netBase)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card-panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Histórico presentado ({year})
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Totales de modelos presentados guardados en Vexo (no son la sede AEAT)
            </p>
          </div>
          <Link
            href="/fiscal/filings"
            className="text-xs text-accent hover:underline"
          >
            Gestionar presentados
          </Link>
        </div>

        {!official.hasData ? (
          <p className="text-sm text-ink-muted">
            Aún no hay modelos presentados para {year}. Márcalos desde el
            borrador 303/130 o sube el PDF de la sede AEAT.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Ingresos presentados",
                  value: official.incomeBase,
                  hint: official.incomeSource,
                },
                {
                  label: "Gastos presentados",
                  value: official.expensesBase,
                  hint: official.expensesSource,
                },
                {
                  label: "IVA repercutido",
                  value: official.vatRepercutida,
                  hint: "303 / 390",
                },
                {
                  label: "IVA soportado",
                  value: official.vatDeductible,
                  hint: "303 / 390",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-lg border border-line/60 p-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {card.label}
                  </p>
                  <p className="mt-1.5 font-mono text-lg font-semibold">
                    {card.value == null ? "—" : formatCurrency(card.value)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
                </div>
              ))}
            </div>

            {panelVsOfficial != null ? (
              <p className="mt-3 text-xs text-ink-muted">
                Panel vs presentado (ingresos):{" "}
                <span
                  className={
                    Math.abs(panelVsOfficial) < 1
                      ? "text-success"
                      : "text-warning"
                  }
                >
                  {panelVsOfficial === 0
                    ? "cuadran"
                    : `${panelVsOfficial > 0 ? "+" : ""}${formatCurrency(panelVsOfficial)}`}
                </span>
              </p>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Periodo</th>
                    <th className="px-2 py-2 text-right font-medium">
                      Ingresos
                    </th>
                    <th className="px-2 py-2 text-right font-medium">Gastos</th>
                    <th className="px-2 py-2 text-right font-medium">303</th>
                    <th className="px-2 py-2 text-right font-medium">130</th>
                  </tr>
                </thead>
                <tbody>
                  {official.periods
                    .filter((p) => p.quarter != null)
                    .map((p) => (
                      <tr key={p.label} className="border-b border-line/50">
                        <td className="px-2 py-2">{p.label}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {p.incomeBase == null
                            ? "—"
                            : formatCurrency(p.incomeBase)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {p.expensesBase == null
                            ? "—"
                            : formatCurrency(p.expensesBase)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {p.result303 == null
                            ? "—"
                            : formatCurrency(p.result303)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {p.result130 == null
                            ? "—"
                            : formatCurrency(p.result130)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card-panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Fiscal del año (panel)</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Estimaciones 303 / 130 calculadas
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/fiscal/annual?year=${year}`}
              className="text-xs text-accent hover:underline"
            >
              Ver resumen anual
            </Link>
            <Link
              href={`/fiscal/390?year=${year}`}
              className="text-xs text-accent hover:underline"
            >
              Modelo 390
            </Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "IVA neto (303)",
              value: fiscal.ivaNetYear,
              hint:
                fiscal.ivaNetYear >= 0
                  ? "A ingresar (suma T)"
                  : "A compensar (suma T)",
              href: `/fiscal/303?year=${year}`,
            },
            {
              label: "IRPF fraccionado (130)",
              value: fiscal.irpfPaymentsYear,
              hint: "Suma pagos T",
              href: `/fiscal/130?year=${year}`,
            },
            {
              label: "Retenciones IRPF",
              value: fiscal.issued.irpfWithheld,
              hint: "Facturas emitidas",
            },
            {
              label: "IVA soportado",
              value: fiscal.expenses.vatDeductible,
              hint: "Gastos deducibles",
              href: "/fiscal/expenses",
            },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border border-line/60 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {card.label}
              </p>
              <p className="mt-1.5 font-mono text-lg font-semibold tracking-tight">
                {"href" in card && card.href ? (
                  <Link href={card.href} className="hover:text-accent">
                    {formatCurrency(card.value)}
                  </Link>
                ) : (
                  formatCurrency(card.value)
                )}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-panel p-4">
          <p className="text-xs text-ink-muted">Amazon (base)</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {formatCurrency(stats.amazonBase)}
          </p>
        </div>
        <div className="card-panel p-4">
          <p className="text-xs text-ink-muted">Shopify (base)</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {formatCurrency(stats.shopifyBase)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-panel p-5">
          <h2 className="mb-1 text-sm font-semibold">
            Ingresos por canal ({year})
          </h2>
          <p className="mb-4 text-xs text-ink-muted">
            Bases imponibles apiladas por mes
          </p>
          <IncomeMixChart data={mixData} />
        </section>
        <section className="card-panel p-5">
          <h2 className="mb-1 text-sm font-semibold">
            Facturado vs cobrado W3D ({year})
          </h2>
          <p className="mb-4 text-xs text-ink-muted">
            Emitido por fecha de factura · cobrado por fecha de pago
          </p>
          <CashflowChart data={cashData} />
        </section>
      </div>

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Top clientes (facturado W3D)</h2>
        </div>
        {stats.topClients.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Sin facturas en {year}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.topClients.map((c) => (
                <tr key={c.clientId} className="border-b border-line/50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/clients/${c.clientId}`}
                      className="hover:text-accent"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(c.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
