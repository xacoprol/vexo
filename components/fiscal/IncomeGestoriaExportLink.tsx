"use client";

import { useSearchParams } from "next/navigation";

/** Enlace de descarga del Excel gestoría según filtros año/mes actuales. */
export function IncomeGestoriaExportLink() {
  const searchParams = useSearchParams();
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  const now = new Date();
  const year = yearParam || String(now.getFullYear());
  const month = monthParam || (!yearParam ? String(now.getMonth() + 1) : null);

  const qs = new URLSearchParams();
  qs.set("year", year);
  if (month) qs.set("month", month);

  const periodLabel = month
    ? `${year}-${String(month).padStart(2, "0")}`
    : year;

  return (
    <a
      href={`/api/fiscal/income/export?${qs.toString()}`}
      className="btn-secondary text-sm"
      title="Excel con hojas Amazon, Shopify y Facturas Vexo"
    >
      Informe gestoría ({periodLabel})
    </a>
  );
}
