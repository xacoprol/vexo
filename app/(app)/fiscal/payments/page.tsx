import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import { listPendingLiquidaciones } from "@/lib/fiscal-payments";
import { createTaxPayment, deleteTaxPayment } from "./actions";

export default async function FiscalPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filingId?: string;
    modelType?: string;
    year?: string;
    quarter?: string;
    amount?: string;
  }>;
}) {
  const sp = await searchParams;
  const prefillFilingId = sp.filingId?.trim() || "";
  const prefillModel = sp.modelType?.trim() || "";
  const prefillYear = sp.year?.trim() || "";
  const prefillQuarter = sp.quarter?.trim() || "";
  const prefillAmount = sp.amount?.trim() || "";

  const [payments, pending] = await Promise.all([
    prisma.taxPayment.findMany({
      include: { document: true, filing: true },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    }),
    listPendingLiquidaciones(),
  ]);

  const byYear = new Map<number, number>();
  for (const p of payments) {
    if (p.year == null || p.status !== "PAGADO") continue;
    byYear.set(p.year, (byYear.get(p.year) ?? 0) + Number(p.amount));
  }

  const today = new Date().toISOString().slice(0, 10);

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
          Tras presentar un 303/130 a ingresar, registra el NRC aquí y queda
          ligado al modelo.
        </p>
      </div>

      {pending.length > 0 ? (
        <section className="card-panel space-y-3 p-4">
          <h2 className="text-sm font-semibold text-warning">
            Pendientes de pago ({pending.length})
          </h2>
          <p className="text-xs text-ink-muted">
            Presentados con resultado a ingresar y sin pago registrado.
          </p>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.filingId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">
                    {p.modelType} · {p.periodLabel}
                  </p>
                  <p className="text-xs text-ink-muted">
                    A ingresar{" "}
                    <span className="font-mono">
                      {formatCurrency(p.result)}
                    </span>
                    {p.filedAt ? ` · presentado ${formatDate(p.filedAt)}` : ""}
                  </p>
                </div>
                <Link href={p.paymentHref} className="btn-primary text-xs">
                  Registrar NRC
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
        <h2 className="text-sm font-semibold">
          {prefillFilingId ? "Registrar pago del modelo" : "Registrar pago"}
        </h2>
        {prefillFilingId ? (
          <p className="text-xs text-ink-muted">
            Prefijado desde el presentado. Introduce NRC (y fecha/justificante
            si lo tienes) y guarda.
          </p>
        ) : null}
        <form
          action={createTaxPayment}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {prefillFilingId ? (
            <input type="hidden" name="filingId" value={prefillFilingId} />
          ) : null}
          <div>
            <label className="label" htmlFor="modelType">
              Modelo
            </label>
            <input
              id="modelType"
              name="modelType"
              className="input"
              placeholder="303"
              defaultValue={prefillModel}
              readOnly={Boolean(prefillFilingId)}
            />
          </div>
          <div>
            <label className="label" htmlFor="year">
              Año
            </label>
            <input
              id="year"
              name="year"
              type="number"
              className="input"
              defaultValue={prefillYear}
              readOnly={Boolean(prefillFilingId)}
            />
          </div>
          <div>
            <label className="label" htmlFor="quarter">
              Trimestre
            </label>
            <input
              id="quarter"
              name="quarter"
              type="number"
              min={1}
              max={4}
              className="input"
              defaultValue={prefillQuarter}
              readOnly={Boolean(prefillFilingId)}
            />
          </div>
          <div>
            <label className="label" htmlFor="amount">
              Importe
            </label>
            <input
              id="amount"
              name="amount"
              className="input"
              required
              defaultValue={prefillAmount}
            />
          </div>
          <div>
            <label className="label" htmlFor="paidAt">
              Fecha pago
            </label>
            <input
              id="paidAt"
              name="paidAt"
              type="date"
              className="input"
              defaultValue={prefillFilingId ? today : ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="nrc">
              NRC
            </label>
            <input
              id="nrc"
              name="nrc"
              className="input"
              placeholder="Número de referencia completo"
              autoFocus={Boolean(prefillFilingId)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="file">
              Justificante
            </label>
            <input id="file" name="file" type="file" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">
              Notas
            </label>
            <input id="notes" name="notes" className="input" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary text-sm">
              Guardar pago
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
                <th className="px-4 py-2 text-left">Estado</th>
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
                  <td className="px-4 py-2 text-xs text-ink-muted">
                    {p.status}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={deleteTaxPayment.bind(null, p.id)}>
                      <button
                        type="submit"
                        className="text-xs text-danger hover:underline"
                      >
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
