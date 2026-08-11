import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { FilingDropZone } from "@/components/fiscal/FilingDropZone";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import {
  listPendingLiquidaciones,
  paymentHrefForFiling,
  PAYABLE_MODEL_TYPES,
} from "@/lib/fiscal-payments";
import { deleteFiscalFiling } from "./actions";

function periodLabel(modelType: string, year: number, quarter: number | null) {
  if (
    modelType === "390" ||
    modelType === "347" ||
    modelType === "036" ||
    quarter == null
  ) {
    return `Año ${year}`;
  }
  return `${quarter}T ${year}`;
}

function modelHref(modelType: string, year: number, quarter: number | null) {
  if (modelType === "390") return `/fiscal/390?year=${year}`;
  if (modelType === "347") return `/fiscal/347?year=${year}`;
  if (modelType === "349") return `/fiscal/349?year=${year}&q=${quarter ?? 1}`;
  if (modelType === "036") return `/fiscal/036`;
  return `/fiscal/${modelType}?year=${year}&q=${quarter ?? 1}`;
}

export default async function FiscalFilingsPage() {
  const [filings, pending] = await Promise.all([
    prisma.fiscalFiling.findMany({
      include: {
        documents: { take: 1, orderBy: { createdAt: "desc" } },
        taxPayments: {
          where: { status: "PAGADO" },
          take: 1,
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: [{ year: "desc" }, { modelType: "asc" }, { quarter: "asc" }],
    }),
    listPendingLiquidaciones(),
  ]);

  const pendingByFiling = new Set(pending.map((p) => p.filingId));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
            ← Fiscal
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Modelos presentados
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Modelos registrados en Vexo (tras presentar en AEAT). Puedes
            marcarlos desde el borrador 303/130, editarlos aquí o subir el PDF.
            Histórico también en{" "}
            <Link href="/fiscal/archive" className="text-accent underline">
              Archivo
            </Link>
            .
          </p>
        </div>
      </div>

      <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
        Opcional: Gemini lee el PDF y revisas casillas. También puedes marcar
        presentado desde el borrador del modelo. Si hay que ingresar, registra
        el NRC en{" "}
        <Link href="/fiscal/payments" className="text-accent underline">
          Pagos
        </Link>
        .
      </p>

      {pending.length > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {pending.length} liquidación(es) pendiente(s) de pago.{" "}
          <Link href="/fiscal/payments" className="font-medium underline">
            Ir a pagos / NRC
          </Link>
        </p>
      ) : null}

      <FilingDropZone />

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Registrados</h2>
        </div>
        {filings.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No hay presentados del trimestre actual. El histórico está en
            Archivo.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Modelo</th>
                <th className="px-4 py-2 text-left font-medium">Periodo</th>
                <th className="px-4 py-2 text-right font-medium">Resultado</th>
                <th className="px-4 py-2 text-left font-medium">Pago</th>
                <th className="px-4 py-2 text-left font-medium">Presentado</th>
                <th className="px-4 py-2 text-left font-medium">Archivo</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => {
                const href = modelHref(f.modelType, f.year, f.quarter);
                const doc = f.documents[0];
                const paid = f.taxPayments[0];
                const needsPay =
                  PAYABLE_MODEL_TYPES.has(f.modelType) &&
                  Number(f.result) > 0;
                const isPending = pendingByFiling.has(f.id);
                return (
                  <tr key={f.id} className="border-b border-line/50">
                    <td className="px-4 py-2 font-mono">
                      <Link href={href} className="hover:text-accent">
                        {f.modelType}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {periodLabel(f.modelType, f.year, f.quarter)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(Number(f.result))}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {!needsPay ? (
                        <span className="text-ink-muted">—</span>
                      ) : paid ? (
                        <span className="text-success">
                          Pagado
                          {paid.nrc ? (
                            <span className="ml-1 font-mono text-ink-muted">
                              {paid.nrc.slice(0, 10)}…
                            </span>
                          ) : null}
                        </span>
                      ) : isPending ? (
                        <Link
                          href={paymentHrefForFiling({
                            filingId: f.id,
                            modelType: f.modelType,
                            year: f.year,
                            quarter: f.quarter,
                            amount: Number(f.result),
                          })}
                          className="text-warning underline"
                        >
                          Registrar NRC
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">
                      {f.filedAt ? formatDate(f.filedAt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-muted">
                      {doc ? (
                        <a
                          href={fiscalDocumentHref(doc.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline"
                        >
                          PDF
                        </a>
                      ) : (
                        f.sourceFileName ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/fiscal/filings/${f.id}/edit`}
                          className="text-xs text-accent hover:underline"
                        >
                          Editar
                        </Link>
                        <form action={deleteFiscalFiling.bind(null, f.id)}>
                          <button
                            type="submit"
                            className="text-xs text-danger hover:underline"
                          >
                            Borrar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
