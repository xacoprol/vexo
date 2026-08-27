import Link from "next/link";
import type { FiscalObligationEntry } from "@/lib/fiscal-obligations/types";

function obligationLabel(status: FiscalObligationEntry["obligationStatus"]): string {
  switch (status) {
    case "REQUIRED":
      return "Debes presentarlo";
    case "NOT_REQUIRED":
      return "No obligatorio";
    case "NOT_APPLICABLE":
      return "No consta / no aplica";
    default:
      return "Revisar obligación";
  }
}

function filingLabel(status: FiscalObligationEntry["filingStatus"]): string {
  switch (status) {
    case "FILED":
      return "Presentado";
    case "DUE":
      return "Pendiente (plazo cercano)";
    case "UPCOMING":
      return "Pendiente";
    case "OVERDUE":
      return "Fuera de plazo";
    case "REQUIRES_REVIEW":
      return "Requiere revisión";
    default:
      return "—";
  }
}

function opsNote(entry: FiscalObligationEntry): string | null {
  if (entry.operationsSignal === "ZERO_OPS") {
    return "Sin operaciones este período (no implica «no aplica»).";
  }
  if (entry.operationsSignal === "HAS_OPS") {
    return "Hay operaciones detectadas.";
  }
  return null;
}

const HREF: Record<string, (year: number, q?: number | null) => string> = {
  "130": (y, q) => `/fiscal/130?year=${y}&q=${q ?? 1}`,
  "303": (y, q) => `/fiscal/303?year=${y}&q=${q ?? 1}`,
  "349": (y, q) => `/fiscal/349?year=${y}&q=${q ?? 1}`,
  "347": (y) => `/fiscal/347?year=${y}`,
  "390": (y) => `/fiscal/390?year=${y}`,
  "111": () => "/settings",
  "115": () => "/settings",
  "180": () => "/settings",
  "190": () => "/settings",
};

type Props = {
  year: number;
  quarter: number;
  quarterly: FiscalObligationEntry[];
  annual: FiscalObligationEntry[];
  completeness: string;
};

export function FiscalObligationsPanel({
  year,
  quarter,
  quarterly,
  annual,
  completeness,
}: Props) {
  return (
    <section className="card-panel space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Mis obligaciones
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {quarter}T {year}
            {completeness !== "COMPLETE"
              ? ` · Perfil ${completeness === "INSUFFICIENT" ? "insuficiente" : "parcial"}`
              : ""}
          </p>
        </div>
        <Link href="/settings" className="text-sm text-accent underline">
          Perfil censal
        </Link>
      </div>

      <ul className="divide-y divide-line/60">
        {quarterly.map((e) => {
          const href = HREF[e.model]?.(year, e.period.quarter) ?? "/settings";
          const ops = opsNote(e);
          return (
            <li
              key={`${e.model}-${e.period.label}`}
              className="flex flex-wrap items-start justify-between gap-2 py-2.5"
            >
              <div>
                <Link href={href} className="font-medium text-ink hover:text-accent">
                  {e.model}
                </Link>
                <p className="text-sm text-ink-muted">
                  {obligationLabel(e.obligationStatus)}
                  {" · "}
                  {filingLabel(e.filingStatus)}
                </p>
                {ops ? (
                  <p className="text-xs text-ink-muted">{ops}</p>
                ) : null}
                {e.warnings[0] ? (
                  <p className="text-xs text-amber-800">{e.warnings[0]}</p>
                ) : null}
              </div>
              <span className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted">
                censo {e.censusSignal}
              </span>
            </li>
          );
        })}
      </ul>

      {annual.length > 0 ? (
        <div className="border-t border-line pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Anuales {year}
          </h3>
          <ul className="mt-2 divide-y divide-line/60">
            {annual.map((e) => {
              const href = HREF[e.model]?.(year) ?? "/settings";
              return (
                <li
                  key={`a-${e.model}`}
                  className="flex flex-wrap items-start justify-between gap-2 py-2"
                >
                  <div>
                    <Link
                      href={href}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {e.model}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      {obligationLabel(e.obligationStatus)}
                      {" · "}
                      {filingLabel(e.filingStatus)}
                    </p>
                  </div>
                  <span className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted">
                    censo {e.censusSignal}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
