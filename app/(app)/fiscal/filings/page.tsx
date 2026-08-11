import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { FilingDropZone } from "@/components/fiscal/FilingDropZone";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import { deleteFiscalFiling } from "./actions";

function periodLabel(modelType: string, year: number, quarter: number | null) {
  if (modelType === "390" || modelType === "347" || modelType === "036" || quarter == null) {
    return `Año ${year}`;
  }
  return `${quarter}T ${year}`;
}

function modelHref(modelType: string, year: number, quarter: number | null) {
  if (modelType === "390") return `/fiscal/390?year=${year}`;
  if (modelType === "347") return `/fiscal/347`;
  if (modelType === "349") return `/fiscal/349`;
  if (modelType === "036") return `/fiscal/036`;
  return `/fiscal/${modelType}?year=${year}&q=${quarter ?? 1}`;
}

export default async function FiscalFilingsPage() {
  const filings = await prisma.fiscalFiling.findMany({
    include: { documents: { take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: [{ year: "desc" }, { modelType: "asc" }, { quarter: "asc" }],
  });

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
            Operativo: 3T 2026. Histórico en{" "}
            <Link href="/fiscal/archive" className="text-accent underline">
              Archivo
            </Link>
            . Sube 303, 130, 390, 347, 349 o 036.
          </p>
        </div>
      </div>

      <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
        Gemini lee el PDF. Revisas las casillas y se guarda como oficial. Si hay
        Blob configurado, el PDF queda archivado.
      </p>

      <FilingDropZone />

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Registrados (operativos)</h2>
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
                <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                <th className="px-4 py-2 text-right font-medium">Gastos</th>
                <th className="px-4 py-2 text-right font-medium">Resultado</th>
                <th className="px-4 py-2 text-left font-medium">Presentado</th>
                <th className="px-4 py-2 text-left font-medium">Archivo</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => {
                const href = modelHref(f.modelType, f.year, f.quarter);
                const doc = f.documents[0];
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
                      {f.incomeBase == null
                        ? "—"
                        : formatCurrency(Number(f.incomeBase))}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {f.expensesBase == null
                        ? "—"
                        : formatCurrency(Number(f.expensesBase))}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(Number(f.result))}
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
                      <form action={deleteFiscalFiling.bind(null, f.id)}>
                        <button
                          type="submit"
                          className="text-xs text-danger hover:underline"
                        >
                          Borrar
                        </button>
                      </form>
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
