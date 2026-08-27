import Link from "next/link";
import type { FiscalCensusSuggestion } from "@/lib/fiscal-census-suggestions";

type Props = {
  suggestions: FiscalCensusSuggestion[];
};

export function CensusSuggestionsPanel({ suggestions }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <section className="card-panel space-y-3 p-6" id="census-pending">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Configuración pendiente
      </h2>
      <p className="text-sm text-ink-muted">
        Sugerencias a partir de filings y operaciones. No se aplican solas:
        confirma cada valor en el formulario.
      </p>
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <li
            key={`${s.field}-${s.suggestedValue}`}
            className="rounded-lg border border-line/60 px-4 py-3 text-sm"
          >
            <p className="font-medium">
              {s.field}{" "}
              <span className="text-ink-muted">
                → sugerido: {String(s.suggestedValue)}
              </span>
            </p>
            <p className="mt-1 text-ink-muted">{s.reason}</p>
            <ul className="mt-1 list-inside list-disc text-xs text-ink-muted">
              {s.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-muted">
              Confianza {s.confidence} · requiere confirmación
            </p>
            {s.href ? (
              <Link href={s.href} className="mt-2 inline-block text-accent underline">
                Configurar
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
