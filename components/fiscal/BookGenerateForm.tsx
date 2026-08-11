"use client";

import { useState, useTransition } from "react";
import { regenerateRegisterBooksFromApp } from "@/app/(app)/fiscal/books/actions";

export function BookGenerateForm({ defaultYear }: { defaultYear: number }) {
  const [year, setYear] = useState(defaultYear);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card-panel space-y-3 px-4 py-4">
      <div>
        <h2 className="text-sm font-semibold">Generar desde Vexo</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Crea o regenera ingresos, gastos y bienes del año a partir de
          facturas, marketplace, gastos y activos. Sustituye el libro de ese
          año si ya existía.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="bookGenYear">
            Año
          </label>
          <input
            id="bookGenYear"
            type="number"
            className="input w-28"
            min={2000}
            max={2100}
            value={year}
            disabled={pending}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || defaultYear)}
          />
        </div>
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const res = await regenerateRegisterBooksFromApp(year);
              if (res.ok) setMessage(res.summary);
              else setError(res.error);
            });
          }}
        >
          {pending ? "Generando…" : "Generar libros del año"}
        </button>
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
