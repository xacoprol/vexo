import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { BookImportForm } from "@/components/fiscal/BookImportForm";
import { deleteRegisterBook } from "./actions";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";

const BOOK_LABEL: Record<string, string> = {
  INGRESOS: "Ingresos",
  GASTOS: "Gastos",
  BIENES: "Bienes de inversión",
};

export default async function FiscalBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const year = parseInt(sp.year ?? "", 10);
  const type = (sp.type ?? "").toUpperCase();

  const books = await prisma.registerBook.findMany({
    where: {
      ...(Number.isFinite(year) ? { year } : {}),
      ...(type === "INGRESOS" || type === "GASTOS" || type === "BIENES"
        ? { bookType: type }
        : {}),
    },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, take: 500 },
      document: true,
      _count: { select: { lines: true } },
    },
    orderBy: [{ year: "desc" }, { bookType: "asc" }],
  });

  const years = [
    ...new Set(
      (
        await prisma.registerBook.findMany({
          select: { year: true },
          distinct: ["year"],
          orderBy: { year: "desc" },
        })
      ).map((b) => b.year)
    ),
  ];

  const active = books[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Libros registro
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Ingresos, gastos y bienes de inversión (importación Excel gestoría)
        </p>
      </div>

      <BookImportForm />

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/fiscal/books"
          className={!sp.year && !type ? "btn-primary text-xs" : "btn-ghost text-xs"}
        >
          Todos
        </Link>
        {years.map((y) => (
          <Link
            key={y}
            href={`/fiscal/books?year=${y}`}
            className={
              year === y && !type ? "btn-primary text-xs" : "btn-ghost text-xs"
            }
          >
            {y}
          </Link>
        ))}
        {(["INGRESOS", "GASTOS", "BIENES"] as const).map((t) => (
          <Link
            key={t}
            href={`/fiscal/books?type=${t}${Number.isFinite(year) ? `&year=${year}` : ""}`}
            className={type === t ? "btn-primary text-xs" : "btn-ghost text-xs"}
          >
            {BOOK_LABEL[t]}
          </Link>
        ))}
      </div>

      {books.length === 0 ? (
        <p className="card-panel px-4 py-8 text-center text-sm text-ink-muted">
          No hay libros importados. Sube los Excel de la gestoría.
        </p>
      ) : (
        <div className="space-y-6">
          {books.map((book) => (
            <section key={book.id} className="card-panel overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {BOOK_LABEL[book.bookType] ?? book.bookType} {book.year}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    {book._count.lines} líneas
                    {book.sourceFile ? ` · ${book.sourceFile}` : ""}
                    {book.document ? (
                      <>
                        {" · "}
                        <a
                          href={fiscalDocumentHref(book.document.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline"
                        >
                          Descargar original
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <form action={deleteRegisterBook.bind(null, book.id)}>
                  <button type="submit" className="text-xs text-danger hover:underline">
                    Borrar libro
                  </button>
                </form>
              </div>
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Factura</th>
                    <th className="px-3 py-2 text-left">Concepto</th>
                    <th className="px-3 py-2 text-left">Contraparte</th>
                    <th className="px-3 py-2 text-right">Base</th>
                    <th className="px-3 py-2 text-right">IVA</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(book.id === active?.id ? book.lines : book.lines.slice(0, 30)).map(
                    (l) => (
                      <tr key={l.id} className="border-b border-line/40">
                        <td className="px-3 py-2 text-ink-muted">
                          {l.issueDate ? formatDate(l.issueDate) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {l.invoiceNumber ?? "—"}
                        </td>
                        <td className="px-3 py-2">{l.concept ?? "—"}</td>
                        <td className="px-3 py-2 text-ink-muted">
                          {l.counterparty ?? "—"}
                          {l.nif ? (
                            <span className="ml-1 text-xs">({l.nif})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCurrency(Number(l.base))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCurrency(Number(l.vatAmount))}
                          <span className="ml-1 text-xs text-ink-muted">
                            ({l.vatRate}%)
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCurrency(Number(l.total))}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
              {book.lines.length > 30 && book.id !== active?.id ? (
                <p className="px-4 py-2 text-xs text-ink-muted">
                  Mostrando 30 de {book._count.lines}. Filtra por año/tipo para
                  ver más.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
