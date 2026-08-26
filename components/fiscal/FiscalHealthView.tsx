import Link from "next/link";
import type { FiscalHealthResult } from "@/lib/fiscal-health/types";
import { statusLabel } from "@/lib/fiscal-health/issue";

type Props = {
  health: FiscalHealthResult;
  annualHref: string;
  quarterHref?: string;
};

function severityIcon(severity: string): string {
  switch (severity) {
    case "CRITICAL":
    case "ERROR":
      return "❌";
    case "WARNING":
      return "⚠️";
    default:
      return "ℹ️";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "READY":
      return "bg-success/15 text-success";
    case "READY_WITH_WARNINGS":
      return "bg-warning/15 text-warning";
    case "NOT_READY":
      return "bg-danger/15 text-danger";
    default:
      return "bg-line text-ink-muted";
  }
}

export function FiscalHealthView({ health, annualHref, quarterHref }: Props) {
  const blockers = health.blockers;
  const nonBlockers = health.issues.filter((i) => !i.blocksFiling);
  const passed = health.checks.filter((c) => c.passed);
  const failed = health.checks.filter((c) => !c.passed);

  const periodLabel =
    health.mode === "quarter" && health.quarter != null
      ? `${health.quarter}T ${health.year}`
      : `Año ${health.year}`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-bg-elevated p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Salud fiscal · {periodLabel}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-lg px-3 py-1 text-sm font-semibold ${statusBadgeClass(health.status)}`}
          >
            {health.statusLabel}
          </span>
          {blockers.length > 0 ? (
            <span className="text-sm text-danger">
              {blockers.length} problema{blockers.length === 1 ? "" : "s"}{" "}
              bloqueante{blockers.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {nonBlockers.length > 0 ? (
            <span className="text-sm text-ink-muted">
              {nonBlockers.length} elemento
              {nonBlockers.length === 1 ? "" : "s"} para revisar
            </span>
          ) : null}
          <span className="text-sm text-ink-muted">
            {passed.length} comprobación{passed.length === 1 ? "" : "es"}{" "}
            correcta{passed.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {health.mode === "quarter" && quarterHref ? (
            <Link href={annualHref} className="btn-ghost text-xs">
              Ver auditoría anual →
            </Link>
          ) : null}
          {health.mode === "annual" && quarterHref ? (
            <Link href={quarterHref} className="btn-ghost text-xs">
              ← Ver trimestre actual
            </Link>
          ) : null}
        </div>
      </div>

      {health.modelStatuses.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Modelos
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {health.modelStatuses.map((m) => (
              <div
                key={m.model}
                className="flex items-center justify-between rounded-lg border border-line/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{m.label}</span>
                <span className={statusBadgeClass(m.status)}>
                  {statusLabel(m.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {blockers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-danger">
            Bloqueantes
          </h2>
          <ul className="space-y-2">
            {blockers.map((issue) => (
              <li
                key={issue.fingerprint}
                className="rounded-lg border border-danger/30 bg-danger/5 p-3"
              >
                <p className="font-medium text-ink">
                  {severityIcon(issue.severity)} {issue.title}
                </p>
                <p className="mt-1 text-sm text-ink-muted">{issue.description}</p>
                {issue.href ? (
                  <Link
                    href={issue.href}
                    className="mt-2 inline-block text-sm text-accent hover:underline"
                  >
                    Revisar →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {nonBlockers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Revisiones y avisos
          </h2>
          <ul className="space-y-2">
            {nonBlockers.map((issue) => (
              <li
                key={issue.fingerprint}
                className="rounded-lg border border-line/60 p-3"
              >
                <p className="font-medium text-ink">
                  {severityIcon(issue.severity)} {issue.title}
                </p>
                <p className="mt-1 text-sm text-ink-muted">{issue.description}</p>
                {issue.originalCode ? (
                  <p className="mt-1 font-mono text-xs text-ink-muted">
                    {issue.sourceModel} · {issue.originalCode}
                  </p>
                ) : null}
                {issue.href ? (
                  <Link
                    href={issue.href}
                    className="mt-2 inline-block text-sm text-accent hover:underline"
                  >
                    Revisar →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {failed.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Comprobaciones pendientes
          </h2>
          <ul className="space-y-1 text-sm text-ink-muted">
            {failed.map((c) => (
              <li key={c.id}>
                ✗ {c.label}
                {c.detail ? ` — ${c.detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {passed.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Comprobaciones superadas
          </h2>
          <ul className="space-y-1 text-sm text-ink-muted">
            {passed.map((c) => (
              <li key={c.id}>✓ {c.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-ink-muted">
        Ejecutado {health.checkedAt.toLocaleString("es-ES")} · ~
        {health.queryCount} consultas Prisma
      </p>
    </div>
  );
}
