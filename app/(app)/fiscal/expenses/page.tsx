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

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();
  const page = parsePage(sp.page);

  const where = query
    ? {
        OR: [
          { supplierName: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
          { supplierNif: { contains: query, mode: "insensitive" as const } },
          { invoiceNumber: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : undefined;

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

      {missingNifCount + missingIntracomNif > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {missingNifCount > 0
            ? `${missingNifCount} gasto(s) interior(es) sin NIF (afectan al 347). `
            : null}
          {missingIntracomNif > 0
            ? `${missingIntracomNif} intracom sin NIF-IVA (afectan al 349). `
            : null}
          Complétalos antes de presentar.
        </p>
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
                  No hay gastos{query ? " con ese criterio" : ""}.{" "}
                  <Link
                    href="/fiscal/expenses/new"
                    className="text-accent underline"
                  >
                    Registrar el primero
                  </Link>
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
                  {section.items.map((e) => (
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
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        basePath="/fiscal/expenses"
        params={{ q: query }}
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        pageSize={meta.pageSize}
      />
    </div>
  );
}
