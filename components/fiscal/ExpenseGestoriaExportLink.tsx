"use client";

import { useState } from "react";

const MONTHS = [
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

/** Selector año/mes + descarga Excel gestoría de gastos (y ZIP de PDFs). */
export function ExpenseGestoriaExportLink() {
  const now = new Date();
  const yNow = now.getFullYear();

  const [year, setYear] = useState(String(yNow));
  /** "" = todo el año */
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const years = [yNow + 1, yNow, yNow - 1, yNow - 2].map(String);

  const qs = new URLSearchParams();
  qs.set("year", year);
  if (month) qs.set("month", month);

  const monthTag = month
    ? `${year}-${String(Number(month)).padStart(2, "0")}`
    : null;
  const periodLabel = monthTag ?? year;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="expenseExportYear">
          Año
        </label>
        <select
          id="expenseExportYear"
          className="input w-auto min-w-[5.5rem]"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="expenseExportMonth">
          Mes
        </label>
        <select
          id="expenseExportMonth"
          className="input w-auto min-w-[9rem]"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
          <option value="">Todo el año</option>
        </select>
      </div>
      <a
        href={`/api/fiscal/expenses/export?${qs.toString()}`}
        className="btn-secondary text-sm self-end"
        title="Excel: resumen, detalle y gastos sin PDF"
      >
        Informe Excel ({periodLabel})
      </a>
      {monthTag ? (
        <a
          href={`/api/fiscal/expenses/zip?month=${monthTag}`}
          className="btn-ghost text-sm self-end"
          title="ZIP con los PDFs del mes"
        >
          ZIP PDFs
        </a>
      ) : null}
    </div>
  );
}
