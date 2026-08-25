import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { buildRecentMonthTotals, buildYearStats } from "@/lib/stats";
import {
  buildUpcomingDeadlines,
  urgencyLabel,
} from "@/lib/fiscal-calendar";
import { listPendingLiquidaciones } from "@/lib/fiscal-payments";

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();

  const [
    yearStats,
    chartRows,
    upcoming,
    recentPending,
    pendingPay,
    aeatOpen,
  ] = await Promise.all([
    buildYearStats(year),
    buildRecentMonthTotals(6),
    prisma.recurringInvoiceTemplate.findMany({
      where: { status: "ACTIVA", nextRunDate: { not: null } },
      include: { client: true },
      orderBy: { nextRunDate: "asc" },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["PENDIENTE", "VENCIDA"] } },
      include: { client: true, payments: { select: { amount: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    listPendingLiquidaciones(),
    prisma.aeatCommunication.findMany({
      where: { status: "ABIERTA" },
      orderBy: [{ dueAt: "asc" }, { occurredAt: "desc" }],
      take: 5,
    }),
  ]);

  const deadlines = buildUpcomingDeadlines(now).slice(0, 4);

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthPoint = yearStats.months.find((m) => m.key === monthKey);
  const quarter = Math.floor(now.getMonth() / 3);
  const quarterIncome = yearStats.months
    .slice(quarter * 3, quarter * 3 + 3)
    .reduce((s, m) => s + m.incomeBase, 0);

  const chartData = chartRows.map((r) => ({
    label: r.label,
    total: r.incomeBase,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Ingresos, cobros y plazos fiscales
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/fiscal/guide" className="btn-primary text-sm">
            Guía fiscal
          </Link>
          <Link href="/stats" className="btn-secondary text-sm">
            Estadísticas
          </Link>
        </div>
      </div>

      {(pendingPay.length > 0 ||
        aeatOpen.some((a) => a.dueAt && a.dueAt < now)) && (
        <div className="space-y-2">
          {pendingPay.length > 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              {pendingPay.length} liquidación(es) sin NRC.{" "}
              <Link href="/fiscal/payments" className="font-medium underline">
                Ir a pagos
              </Link>
            </p>
          ) : null}
          {aeatOpen.some((a) => a.dueAt && a.dueAt < now) ? (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              Hay comunicaciones AEAT con plazo vencido.{" "}
              <Link href="/fiscal/aeat" className="font-medium underline">
                Revisar
              </Link>
            </p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Mes actual",
            value: monthPoint?.incomeBase ?? 0,
            hint: "Base W3D + marketplace",
          },
          {
            label: "Trimestre",
            value: Math.round((quarterIncome + Number.EPSILON) * 100) / 100,
          },
          {
            label: "Año",
            value: yearStats.incomeBase,
            hint: `Cobrado ${formatCurrency(yearStats.collected)}`,
          },
          {
            label: "Pendiente de cobro",
            value: yearStats.pendingCollect,
            hint: `${yearStats.pendingCount} facturas`,
          },
        ].map((card) => (
          <div key={card.label} className="card-panel p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
              {formatCurrency(card.value)}
            </p>
            {"hint" in card && card.hint ? (
              <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card-panel p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ingresos (6 meses)</h2>
            <Link href="/stats" className="text-xs text-accent hover:underline">
              Desglose
            </Link>
          </div>
          <RevenueChart data={chartData} />
        </section>

        <section className="card-panel p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Plazos fiscales</h2>
            <Link
              href="/fiscal/guide"
              className="text-xs text-accent hover:underline"
            >
              Guía
            </Link>
          </div>
          <ul className="space-y-3 text-sm">
            {deadlines.map((d) => {
              const u = urgencyLabel(d.dueDate, now);
              return (
                <li
                  key={`${d.model}-${d.periodLabel}`}
                  className="flex justify-between gap-2 border-b border-line/50 pb-2"
                >
                  <div>
                    <Link
                      href={d.href}
                      className="font-medium hover:text-accent"
                    >
                      {d.model} · {d.periodLabel}
                    </Link>
                    <p className="text-xs text-ink-muted">{d.dueLabel}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs ${
                      u.kind === "overdue" || u.kind === "soon"
                        ? "text-warning"
                        : "text-ink-muted"
                    }`}
                  >
                    {u.text}
                  </span>
                </li>
              );
            })}
          </ul>
          {aeatOpen.length > 0 ? (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-xs font-medium text-ink-muted">AEAT abiertas</p>
              <ul className="mt-2 space-y-2 text-sm">
                {aeatOpen.map((a) => (
                  <li key={a.id}>
                    <Link href="/fiscal/aeat" className="hover:text-accent">
                      {a.subject}
                    </Link>
                    {a.dueAt ? (
                      <span className="ml-2 text-xs text-ink-muted">
                        plazo {formatDate(a.dueAt)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Próximas periódicas</h2>
            <Link
              href="/recurring"
              className="text-xs text-accent hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <ul className="space-y-3 text-sm">
            {upcoming.length === 0 ? (
              <li className="text-ink-muted">No hay periódicas activas</li>
            ) : (
              upcoming.map((t) => (
                <li
                  key={t.id}
                  className="flex justify-between gap-2 border-b border-line/50 pb-2"
                >
                  <div>
                    <Link
                      href={`/recurring/${t.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {t.name}
                    </Link>
                    <p className="text-xs text-ink-muted">{t.client.name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {formatDate(t.nextRunDate)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card-panel overflow-x-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">
              Facturas pendientes / vencidas
            </h2>
            <Link
              href="/invoices?status=PENDIENTE"
              className="text-xs text-accent hover:underline"
            >
              Ver facturas
            </Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {recentPending.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-ink-muted">
                    Todo al día
                  </td>
                </tr>
              ) : (
                recentPending.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-line/50 transition hover:bg-accent-soft/40"
                  >
                    <td className="px-4 py-2 font-mono">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="hover:text-accent"
                      >
                        {inv.fullNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{inv.client.name}</td>
                    <td className="px-4 py-2 text-ink-muted">
                      Vence {formatDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(
                        Math.max(
                          0,
                          Number(inv.total) -
                            inv.payments.reduce(
                              (s, p) => s + Number(p.amount),
                              0
                            )
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
