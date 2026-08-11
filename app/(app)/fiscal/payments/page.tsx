import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import { createTaxPayment, deleteTaxPayment } from "./actions";

export default async function FiscalPaymentsPage() {
  const payments = await prisma.taxPayment.findMany({
    include: { document: true },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });

  const byYear = new Map<number, number>();
  for (const p of payments) {
    if (p.year == null) continue;
    byYear.set(p.year, (byYear.get(p.year) ?? 0) + Number(p.amount));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Liquidaciones y pagos
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Resumen de pagos a la AEAT y justificantes
        </p>
      </div>

      {byYear.size ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[...byYear.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([y, total]) => (
              <div key={y} className="card-panel p-4">
                <p className="text-xs text-ink-muted">{y}</p>
                <p className="mt-1 font-mono text-lg">
                  {formatCurrency(total)}
                </p>
              </div>
            ))}
        </div>
      ) : null}

      <section className="card-panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Registrar pago</h2>
        <form action={createTaxPayment} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="modelType">Modelo</label>
            <input id="modelType" name="modelType" className="input" placeholder="303" />
          </div>
          <div>
            <label className="label" htmlFor="year">Año</label>
            <input id="year" name="year" type="number" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="quarter">Trimestre</label>
            <input id="quarter" name="quarter" type="number" min={1} max={4} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="amount">Importe</label>
            <input id="amount" name="amount" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="paidAt">Fecha pago</label>
            <input id="paidAt" name="paidAt" type="date" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="nrc">NRC</label>
            <input id="nrc" name="nrc" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="file">Justificante</label>
            <input id="file" name="file" type="file" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Notas</label>
            <input id="notes" name="notes" className="input" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary text-sm">
              Guardar
            </button>
          </div>
        </form>
      </section>

      <section className="card-panel overflow-x-auto">
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No hay pagos registrados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Modelo</th>
                <th className="px-4 py-2 text-left">Periodo</th>
                <th className="px-4 py-2 text-right">Importe</th>
                <th className="px-4 py-2 text-left">NRC</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink-muted">
                    {p.paidAt ? formatDate(p.paidAt) : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono">{p.modelType ?? "—"}</td>
                  <td className="px-4 py-2">
                    {p.year
                      ? p.quarter
                        ? `${p.quarter}T ${p.year}`
                        : String(p.year)
                      : "—"}
                    {p.document ? (
                      <>
                        {" · "}
                        <a
                          href={fiscalDocumentHref(p.document.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline"
                        >
                          PDF
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(Number(p.amount))}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                    {p.nrc ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={deleteTaxPayment.bind(null, p.id)}>
                      <button type="submit" className="text-xs text-danger hover:underline">
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
