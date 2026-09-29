"use client";

import { useSearchParams } from "next/navigation";

/** Enlace de descarga del Excel gestoría según filtros año/mes actuales. */
export function IncomeGestoriaExportLink() {
  const searchParams = useSearchParams();
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  const now = new Date();
  // Sin filtro de mes: año en curso (no el mes), para no dejar Amazon a 0
  // si aún no hay CSV del mes actual. Con año+mes en la URL: ese periodo.
  const year = yearParam || String(now.getFullYear());
  const month =
    monthParam && /^\d{1,2}$/.test(monthParam) ? monthParam : null;

  const qs = new URLSearchParams();
  qs.set("year", year);
  if (month) qs.set("month", month);

  const periodLabel = month
    ? `${year}-${String(Number(month)).padStart(2, "0")}`
    : year;

  return (
    <a
      href={`/api/fiscal/income/export?${qs.toString()}`}
      className="btn-secondary text-sm"
      title="Excel: Resumen, Amazon, Shopify y Facturas Vexo"
    >
      Informe gestoría ({periodLabel})
    </a>
  );
}
