"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

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

/** Selector año/mes + descarga del Excel gestoría. */
export function IncomeGestoriaExportLink() {
  const searchParams = useSearchParams();
  const now = new Date();
  const yNow = now.getFullYear();

  const initialYear =
    searchParams.get("year") || String(yNow);
  const monthFromUrl = searchParams.get("month");
  const initialMonth =
    monthFromUrl && /^\d{1,2}$/.test(monthFromUrl)
      ? String(Number(monthFromUrl))
      : String(now.getMonth() + 1);

  const [year, setYear] = useState(initialYear);
  /** "" = todo el año */
  const [month, setMonth] = useState(initialMonth);

  const years = [yNow + 1, yNow, yNow - 1, yNow - 2].map(String);

  const qs = new URLSearchParams();
  qs.set("year", year);
  if (month) qs.set("month", month);

  const periodLabel = month
    ? `${year}-${String(Number(month)).padStart(2, "0")}`
    : year;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="gestoriaExportYear">
          Año
        </label>
        <select
          id="gestoriaExportYear"
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
        <label className="label" htmlFor="gestoriaExportMonth">
          Mes
        </label>
        <select
          id="gestoriaExportMonth"
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
        href={`/api/fiscal/income/export?${qs.toString()}`}
        className="btn-secondary text-sm self-end"
        title="Excel: Resumen, Amazon, Shopify y facturas venta por email"
      >
        Descargar informe ({periodLabel})
      </a>
    </div>
  );
}
