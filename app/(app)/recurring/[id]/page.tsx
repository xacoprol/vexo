import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { setRecurringStatus } from "../actions";
import { DeleteRecurringButton } from "@/components/recurring/DeleteRecurringButton";

export default async function RecurringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await prisma.recurringInvoiceTemplate.findUnique({
    where: { id },
    include: {
      client: true,
      lines: { orderBy: { sortOrder: "asc" } },
      quotes: { orderBy: { issueDate: "desc" }, take: 50 },
      invoices: { orderBy: { issueDate: "desc" }, take: 50 },
    },
  });
  if (!template) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/recurring" className="text-sm text-ink-muted hover:text-accent">
            ← Periódicas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {template.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={template.status} />
            <StatusBadge status={template.frequency} />
            <span className="text-sm text-ink-muted">
              {template.client.name} · Día {template.dayOfMonth} · Próxima{" "}
              {formatDate(template.nextRunDate)}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Genera proformas automáticamente. Conviértelas en factura desde
            Presupuestos cuando quieras.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/recurring/${id}/edit`} className="btn-secondary">
            Editar
          </Link>
          {template.status === "ACTIVA" ? (
            <form action={setRecurringStatus.bind(null, id, "PAUSADA")}>
              <button type="submit" className="btn-secondary">
                Pausar
              </button>
            </form>
          ) : template.status === "PAUSADA" ? (
            <form action={setRecurringStatus.bind(null, id, "ACTIVA")}>
              <button type="submit" className="btn-primary">
                Reanudar
              </button>
            </form>
          ) : null}
          <DeleteRecurringButton templateId={id} name={template.name} />
        </div>
      </div>

      <div className="card-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left">Concepto</th>
              <th className="px-4 py-2 text-right">Cant.</th>
              <th className="px-4 py-2 text-right">Precio</th>
              <th className="px-4 py-2 text-right">IVA</th>
            </tr>
          </thead>
          <tbody>
            {template.lines.map((l) => (
              <tr key={l.id} className="border-b border-line/50">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right">{Number(l.quantity)}</td>
                <td className="px-4 py-2 text-right">
                  {formatCurrency(Number(l.unitPrice))}
                </td>
                <td className="px-4 py-2 text-right">{l.vatRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold">
          Proformas generadas
        </div>
        <table className="w-full text-sm">
          <tbody>
            {template.quotes.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-ink-muted">
                  Aún no se ha generado ninguna proforma
                </td>
              </tr>
            ) : (
              template.quotes.map((q) => (
                <tr key={q.id} className="border-b border-line/50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/quotes/${q.id}`}
                      className="font-mono hover:text-accent"
                    >
                      {q.fullNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {formatDate(q.issueDate)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={q.status} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(Number(q.total))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {template.invoices.length > 0 ? (
        <section className="card-panel overflow-x-auto">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">
            Facturas convertidas
          </div>
          <table className="w-full text-sm">
            <tbody>
              {template.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-line/50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-mono hover:text-accent"
                    >
                      {inv.fullNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {formatDate(inv.issueDate)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(Number(inv.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
