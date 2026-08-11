import Link from "next/link";
import { Fragment, Suspense } from "react";
import { InlineSkeleton } from "@/components/ui/PageSkeleton";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { EXPENSE_CATEGORIES, isExpenseIntracom } from "@/lib/fiscal";
import { parsePage, paginationMeta } from "@/lib/pagination";
import { Pagination } from "@/components/ui/Pagination";
import { LiveSearch } from "@/components/ui/LiveSearch";
import { ExpenseDropZone } from "@/components/fiscal/ExpenseDropZone";
import { deleteExpense } from "./actions";
import type { Prisma } from "@prisma/client";

const categoryLabel = (id: string) =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(date: Date): string {
  const label = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const MISSING_NIF_WHERE: Prisma.ExpenseWhereInput = {
  OR: [{ supplierNif: null }, { supplierNif: "" }],
  vatOperationType: { in: ["INTERIOR", "INTRACOMUNITARIA"] },
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; missingNif?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();
  const page = parsePage(sp.page);
  const missingNifOnly =
    sp.missingNif === "1" || sp.missingNif === "true" || sp.missingNif === "on";

  const searchWhere: Prisma.ExpenseWhereInput | undefined = query
    ? {
        OR: [
          { supplierName: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
          { supplierNif: { contains: query, mode: "insensitive" as const } },
          { invoiceNumber: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const where: Prisma.ExpenseWhereInput | undefined = (() => {
    if (missingNifOnly && searchWhere) {
      return { AND: [MISSING_NIF_WHERE, searchWhere] };
    }
    if (missingNifOnly) return MISSING_NIF_WHERE;
    return searchWhere;
  })();

  const total = await prisma.expense.count({ where });
  const meta = paginationMeta(total, page);
  const [expenses, missingNifCount, missingIntracomNif] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip: meta.skip,
      take: meta.take,
    }),
    prisma.expense.count({
      where: {
        OR: [{ supplierNif: null }, { supplierNif: "" }],
        vatOperationType: "INTERIOR",
      },
    }),
    prisma.expense.count({
      where: {
        OR: [{ supplierNif: null }, { supplierNif: "" }],
        vatOperationType: "INTRACOMUNITARIA",
      },
    }),
  ]);

  const monthSections: { key: string; label: string; items: typeof expenses }[] =
    [];
  for (const e of expenses) {
    const key = monthKey(e.issueDate);
    const last = monthSections[monthSections.length - 1];
    if (!last || last.key !== key) {
      monthSections.push({
        key,
        label: monthLabel(e.issueDate),
        items: [e],
      });
    } else {
      last.items.push(e);
    }
  }

  const filterParams = {
    q: query,
    missingNif: missingNifOnly ? "1" : undefined,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
            ← Fiscal
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Gastos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Facturas recibidas para IVA soportado y modelo 130
          </p>
        </div>
        <Link href="/fiscal/expenses/new" className="btn-ghost text-sm">
          Alta manual
        </Link>
      </div>

      <ExpenseDropZone />

      {missingIntracomNif > 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {missingIntracomNif} compra(s) UE sin NIF-IVA: afectan al{" "}
          <strong>349</strong> (y el 303 ya puede llevarlas). Complétalas antes
          de presentar.{" "}
          <Link href="/fiscal/expenses?missingNif=1" className="underline">
            Ver solo sin NIF
          </Link>
        </p>
      ) : null}

      {missingNifCount > 0 ? (
        <p className="rounded-lg border border-line bg-line/30 px-4 py-3 text-sm text-ink-muted">
          {missingNifCount} gasto(s) interior(es) sin NIF. Solo importan para el{" "}
          <strong className="text-ink">347</strong> si el mismo proveedor supera
          3.005,06 €/año. AliExpress/China barato: no urgente.{" "}
          {missingNifOnly ? (
            <Link href="/fiscal/expenses" className="text-accent underline">
              Ver todos
            </Link>
          ) : (
            <Link
              href="/fiscal/expenses?missingNif=1"
              className="text-accent underline"
            >
              Ver sin NIF
            </Link>
          )}
        </p>
      ) : null}

      {missingNifOnly ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-warning/15 px-2.5 py-1 text-warning">
            Filtro: sin NIF ({total})
          </span>
          <Link href="/fiscal/expenses" className="text-ink-muted hover:text-accent">
            Quitar filtro
          </Link>
        </div>
      ) : null}

      <Suspense fallback={<InlineSkeleton />}>
        <LiveSearch placeholder="Buscar proveedor, NIF, nº factura o concepto…" />
      </Suspense>

      <div className="card-panel overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Nº factura
              </th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                Categoría
              </th>
              <th className="px-4 py-3 font-medium text-right">Base</th>
              <th className="px-4 py-3 font-medium text-right">IVA</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="sticky right-0 z-10 bg-line/20 px-2 py-3 text-right font-medium sm:static sm:bg-transparent sm:px-4">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  {missingNifOnly
                    ? "No quedan gastos sin NIF."
                    : `No hay gastos${query ? " con ese criterio" : ""}.`}{" "}
                  {!missingNifOnly ? (
                    <Link
                      href="/fiscal/expenses/new"
                      className="text-accent underline"
                    >
                      Registrar el primero
                    </Link>
                  ) : (
                    <Link href="/fiscal/expenses" className="text-accent underline">
                      Volver al listado
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              monthSections.map((section) => (
                <Fragment key={section.key}>
                  <tr className="bg-line/30">
                    <td
                      colSpan={8}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink"
                    >
                      {section.label}
                    </td>
                  </tr>
                  {section.items.map((e) => {
                    const noNif = !e.supplierNif?.trim();
                    return (
                      <tr key={e.id} className="group border-b border-line/50">
                        <td className="px-4 py-3 text-ink-muted">
                          {formatDate(e.issueDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{e.supplierName}</span>
                          {e.description ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">
                              {e.description}
                            </p>
                          ) : null}
                          <span className="mt-1 flex flex-wrap gap-1">
                          {isExpenseIntracom(e.vatOperationType) ? (
                            <span className="badge bg-accent-soft text-accent">
                              Intracom
                            </span>
                          ) : null}
                          {e.isInvestment ? (
                            <span className="badge bg-accent-soft text-accent">
                              Inversión
                            </span>
                          ) : null}
                          {noNif ? (
                            <span className="badge bg-warning/15 text-warning">
                              Sin NIF
                            </span>
                          ) : null}
                            {!e.deductible ? (
                              <span className="badge bg-line text-ink-muted">
                                No deducible
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-ink-muted md:table-cell">
                          {e.invoiceNumber ?? "—"}
                        </td>
                        <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
                          {categoryLabel(e.category)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatCurrency(Number(e.subtotal))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatCurrency(Number(e.vatAmount))}
                          <span className="ml-1 text-xs text-ink-muted">
                            ({e.vatRate}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatCurrency(Number(e.total))}
                        </td>
                        <td className="sticky right-0 z-10 bg-bg-elevated px-2 py-3 group-hover:bg-accent-soft/20 sm:static sm:bg-transparent sm:px-4">
                        <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                          {e.documentId ? (
                            <a
                              href={`/api/fiscal/documents/${e.documentId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-ghost px-2 py-1 text-xs"
                            >
                              PDF
                            </a>
                          ) : null}
                          <Link
                            href={`/fiscal/expenses/${e.id}/edit`}
                            className="btn-ghost px-2 py-1 text-xs"
                          >
                            Editar
                          </Link>
                            <form action={deleteExpense.bind(null, e.id)}>
                              <button
                                type="submit"
                                className="btn-ghost px-2 py-1 text-xs text-danger"
                              >
                                Borrar
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/fiscal/expenses"
        params={filterParams}
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        pageSize={meta.pageSize}
      />
    </div>
  );
}
