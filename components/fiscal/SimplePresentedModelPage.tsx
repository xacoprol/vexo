import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";

type Props = {
  modelType: "347" | "349" | "036";
  title: string;
  hint: string;
};

export async function SimplePresentedModelPage({
  modelType,
  title,
  hint,
}: Props) {
  const filings = await prisma.fiscalFiling.findMany({
    where: { modelType },
    include: { documents: { take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{hint}</p>
      </div>

      <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
        Sube el PDF en{" "}
        <Link href="/fiscal/filings" className="text-accent underline">
          Presentados
        </Link>{" "}
        o en el{" "}
        <Link href="/fiscal/archive" className="text-accent underline">
          Archivo
        </Link>
        . Aquí ves lo ya registrado.
      </p>

      <section className="card-panel overflow-x-auto">
        {filings.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Aún no hay {modelType} presentados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Periodo</th>
                <th className="px-4 py-2 text-right">Resultado</th>
                <th className="px-4 py-2 text-left">Presentado</th>
                <th className="px-4 py-2 text-left">Documento</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} className="border-b border-line/50">
                  <td className="px-4 py-2">
                    {f.quarter ? `${f.quarter}T ${f.year}` : `Año ${f.year}`}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(Number(f.result))}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {f.filedAt ? formatDate(f.filedAt) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {f.documents[0] ? (
                      <a
                        href={fiscalDocumentHref(f.documents[0].id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-ink-muted">
                        {f.sourceFileName ?? "—"}
                      </span>
                    )}
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
