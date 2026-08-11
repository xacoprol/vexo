import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/calculations";
import { ArchiveUploadForm } from "@/components/fiscal/ArchiveUploadForm";
import { removeFiscalArchiveDocument } from "./actions";
import { blobConfigured, fiscalDocumentHref } from "@/lib/fiscal-blob";

const CATEGORY_LABEL: Record<string, string> = {
  FILING: "Modelo",
  BOOK: "Libro",
  CENSUS: "Censo",
  PAYMENT: "Pago",
  AEAT: "AEAT",
  IRPF: "IRPF",
  OTHER: "Otro",
};

export default async function FiscalArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const category = sp.category?.trim().toUpperCase() || undefined;
  const docs = await prisma.fiscalDocument.findMany({
    where: category ? { category } : undefined,
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
  const blobOk = blobConfigured();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Archivo documental
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Justificantes de presentación, libros, censo, pagos y comunicaciones
          con la AEAT
        </p>
      </div>

      {!blobOk ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Falta <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> en el
          entorno. Configúralo en Vercel para poder subir archivos.
        </p>
      ) : (
        <ArchiveUploadForm />
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/fiscal/archive"
          className={!category ? "btn-primary text-xs" : "btn-ghost text-xs"}
        >
          Todos
        </Link>
        {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
          <Link
            key={key}
            href={`/fiscal/archive?category=${key}`}
            className={
              category === key ? "btn-primary text-xs" : "btn-ghost text-xs"
            }
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="card-panel overflow-x-auto">
        {docs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Aún no hay documentos archivados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Título</th>
                <th className="px-4 py-2 text-left font-medium">Tipo</th>
                <th className="px-4 py-2 text-left font-medium">Periodo</th>
                <th className="px-4 py-2 text-left font-medium">Subido</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-line/50">
                  <td className="px-4 py-2">
                    <a
                      href={fiscalDocumentHref(d.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      {d.title}
                    </a>
                    <p className="text-xs text-ink-muted">{d.sourceFileName}</p>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {CATEGORY_LABEL[d.category] ?? d.category}
                    {d.modelType ? ` · ${d.modelType}` : ""}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {d.year
                      ? d.quarter
                        ? `${d.quarter}T ${d.year}`
                        : String(d.year)
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {formatDate(d.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={removeFiscalArchiveDocument.bind(null, d.id)}>
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
