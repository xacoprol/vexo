import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/calculations";
import {
  buildFiscalPeriodSummary,
  parseFiscalPeriod,
} from "@/lib/fiscal";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { ModeloDraft } from "@/components/fiscal/ModeloDraft";

export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const summary = await buildFiscalPeriodSummary(year, quarter);
  const settings = await prisma.companySettings.findFirst();
  const regime = settings?.fiscalRegime ?? "130";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fiscal</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Resumen trimestral IVA / IRPF y borradores de modelos · Régimen{" "}
            <span className="font-medium text-ink">
              {regime === "131" ? "131 (módulos)" : "130 (estimación directa)"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/fiscal/guide" className="btn-primary">
            Guía presentación
          </Link>
          <Link href="/fiscal/expenses" className="btn-secondary">
            Gastos
          </Link>
          <Link href="/fiscal/income" className="btn-secondary">
            Ingresos marketplace
          </Link>
          <Link href="/fiscal/archive" className="btn-secondary">
            Archivo
          </Link>
          <Link href="/fiscal/books" className="btn-secondary">
            Libros
          </Link>
          <Link href="/fiscal/payments" className="btn-secondary">
            Liquidaciones
          </Link>
          <Link
            href={`/fiscal/303?year=${year}&q=${quarter}`}
            className="btn-secondary"
          >
            Modelo 303
          </Link>
          {regime !== "131" ? (
            <Link
              href={`/fiscal/130?year=${year}&q=${quarter}`}
              className="btn-secondary"
            >
              Modelo 130
            </Link>
          ) : null}
          <Link
            href={`/fiscal/390?year=${year}`}
            className="btn-secondary"
          >
            Modelo 390
          </Link>
          <Link href="/fiscal/filings" className="btn-secondary">
            Presentados
          </Link>
          <Link
            href={`/fiscal/annual?year=${year}`}
            className="btn-secondary"
          >
            Resumen anual
          </Link>
        </div>
      </div>

      <FiscalPeriodNav year={year} quarter={quarter} />

      <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
        Trimestre operativo: <span className="font-medium text-ink">3T 2026</span>
        . Empieza por la{" "}
        <Link href="/fiscal/guide" className="text-accent underline">
          Guía de presentación
        </Link>
        : te dice qué modelo tocar y las casillas a copiar. Sube{" "}
        <Link href="/fiscal/expenses" className="text-accent underline">
          gastos
        </Link>{" "}
        e{" "}
        <Link href="/fiscal/income" className="text-accent underline">
          ingresos marketplace
        </Link>{" "}
        y el borrador se recalcula solo.
      </p>

      {summary.expenses.count === 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Este trimestre no tiene gastos registrados.{" "}
          <Link
            href="/fiscal/expenses"
            className="font-medium underline"
          >
            Añade facturas recibidas
          </Link>{" "}
          para que el resultado a ingresar tenga sentido.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-panel p-4">
          <p className="text-xs text-ink-muted">Ingresos (base)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
            {formatCurrency(summary.issued.incomeBase)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {summary.issued.count} factura
            {summary.issued.count === 1 ? "" : "s"}
            {summary.issued.marketplaceCount > 0
              ? ` · ${summary.issued.marketplaceCount} marketplace`
              : ""}
          </p>
        </div>
        <div className="card-panel p-4">
          <p className="text-xs text-ink-muted">IVA repercutido</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
            {formatCurrency(summary.issued.quotaRepercutida)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Base sujeta {formatCurrency(summary.issued.baseSujeta)}
          </p>
        </div>
        <div className="card-panel p-4">
          <p className="text-xs text-ink-muted">IVA soportado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
            {formatCurrency(summary.expenses.vatDeductible)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {summary.expenses.count} gasto
            {summary.expenses.count === 1 ? "" : "s"} · base{" "}
            {formatCurrency(summary.expenses.base)}
            {summary.expenses.aibBase > 0
              ? ` · AIB ${formatCurrency(summary.expenses.aibQuota)}`
              : ""}
          </p>
        </div>
        <div className="card-panel p-4">
          <p className="text-xs text-ink-muted">IRPF retenido (clientes)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
            {formatCurrency(summary.issued.irpfWithheld)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Resta en el pago a cuenta 130
          </p>
        </div>
      </div>

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="form-section-title">IVA por tipo (emitidas)</h2>
          <p className="form-section-hint">
            Desglose de bases y cuotas sujetas del periodo
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Base</th>
              <th className="px-4 py-2 text-right font-medium">Cuota</th>
            </tr>
          </thead>
          <tbody>
            {summary.issued.vatBuckets.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-ink-muted"
                >
                  Sin bases sujetas a IVA en este trimestre
                </td>
              </tr>
            ) : (
              summary.issued.vatBuckets.map((b) => (
                <tr key={b.rate} className="border-b border-line/50">
                  <td className="px-4 py-2">{b.rate}%</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(b.base)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(b.quota)}
                  </td>
                </tr>
              ))
            )}
            {(summary.issued.baseExenta > 0 ||
              summary.issued.baseIntracom > 0 ||
              summary.issued.baseCanarias > 0 ||
              summary.issued.baseExport > 0 ||
              summary.issued.baseMarketplaceCollected > 0) && (
              <>
                {summary.issued.baseExenta > 0 ? (
                  <tr className="border-b border-line/50 text-ink-muted">
                    <td className="px-4 py-2">Exenta / sin IVA</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(summary.issued.baseExenta)}
                    </td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                ) : null}
                {summary.issued.baseIntracom > 0 ? (
                  <tr className="border-b border-line/50 text-ink-muted">
                    <td className="px-4 py-2">Intracomunitaria</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(summary.issued.baseIntracom)}
                    </td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                ) : null}
                {summary.issued.baseCanarias > 0 ? (
                  <tr className="border-b border-line/50 text-ink-muted">
                    <td className="px-4 py-2">Canarias</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(summary.issued.baseCanarias)}
                    </td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                ) : null}
                {summary.issued.baseExport > 0 ? (
                  <tr className="border-b border-line/50 text-ink-muted">
                    <td className="px-4 py-2">Exportación</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(summary.issued.baseExport)}
                    </td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                ) : null}
                {summary.issued.baseMarketplaceCollected > 0 ? (
                  <tr className="border-b border-line/50 text-ink-muted">
                    <td className="px-4 py-2">
                      Marketplace OSS (IVA recaudado por Amazon)
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(summary.issued.baseMarketplaceCollected)}
                    </td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ModeloDraft title="Borrador Modelo 303" model="303" summary={summary} />
        {regime !== "131" ? (
          <ModeloDraft
            title="Borrador Modelo 130"
            model="130"
            summary={summary}
          />
        ) : (
          <section className="card-panel space-y-2 p-5 sm:p-6">
            <h2 className="form-section-title">Modelo 131</h2>
            <p className="text-sm text-ink-muted">
              Tienes configurado régimen de módulos (131). El borrador 130 no
              aplica. Cambia el régimen en Ajustes si estás en estimación
              directa.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
