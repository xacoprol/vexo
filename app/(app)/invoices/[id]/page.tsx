import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { paymentTotals } from "@/lib/invoice-payments";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { annulInvoice, setInvoiceStatus } from "../actions";
import { SendDocumentButton } from "@/components/documents/SendDocumentButton";
import { DeleteInvoiceButton } from "@/components/invoices/DeleteInvoiceButton";
import { InvoicePaymentsPanel } from "@/components/invoices/InvoicePaymentsPanel";
import { MarkPendingButton } from "@/components/invoices/MarkPendingButton";
import { SendReminderButton } from "@/components/documents/SendReminderButton";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      lines: { orderBy: { sortOrder: "asc" } },
      quote: true,
      recurringTemplate: true,
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!invoice) notFound();

  const totals = paymentTotals(invoice.total, invoice.payments);
  const canRemind =
    invoice.status !== "ANULADA" &&
    invoice.status !== "PAGADA" &&
    totals.remaining > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/invoices" className="text-sm text-ink-muted hover:text-accent">
            ← Facturas
          </Link>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight">
            {invoice.fullNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge status={invoice.status} />
            {invoice.vatOperationType &&
            invoice.vatOperationType !== "SUJETA" ? (
              <span className="badge bg-accent-soft text-accent">
                {invoice.vatOperationType === "INTRACOMUNITARIA"
                  ? "Intracomunitaria"
                  : invoice.vatOperationType === "CANARIAS"
                    ? "Canarias"
                    : invoice.vatOperationType === "EXPORTACION"
                      ? "Exportación"
                      : invoice.vatOperationType === "EXENTA"
                        ? "Exenta"
                        : invoice.vatOperationType}
              </span>
            ) : null}
            <span className="text-sm text-ink-muted">
              {invoice.client.name} · {formatDate(invoice.issueDate)}
            </span>
            {invoice.quote && (
              <Link
                href={`/quotes/${invoice.quote.id}`}
                className="text-sm text-accent hover:underline"
              >
                Origen: {invoice.quote.fullNumber}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status !== "ANULADA" && (
            <>
              <SendDocumentButton kind="invoice" id={id} />
              {canRemind ? <SendReminderButton invoiceId={id} /> : null}
              <Link href={`/invoices/${id}/edit`} className="btn-secondary">
                Editar
              </Link>
            </>
          )}
          <Link
            href={`/api/invoices/${id}/pdf`}
            className="btn-primary"
            target="_blank"
          >
            Descargar PDF
          </Link>
          {invoice.sourceDocumentId ? (
            <a
              href={`/api/fiscal/documents/${invoice.sourceDocumentId}`}
              className="btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              PDF original
            </a>
          ) : null}
          <DeleteInvoiceButton
            invoiceId={id}
            fullNumber={invoice.fullNumber}
          />
        </div>
      </div>

      {invoice.status !== "ANULADA" && (
        <div className="flex flex-wrap gap-2">
          {invoice.status !== "PAGADA" && (
            <form action={setInvoiceStatus.bind(null, id, "PAGADA")}>
              <button type="submit" className="btn-secondary text-success">
                Marcar pagada
              </button>
            </form>
          )}
          {(invoice.status === "PAGADA" || invoice.payments.length > 0) && (
            <MarkPendingButton invoiceId={id} />
          )}
          <form action={annulInvoice.bind(null, id)}>
            <button type="submit" className="btn-ghost text-warning text-sm">
              Anular factura
            </button>
          </form>
        </div>
      )}

      <InvoicePaymentsPanel
        invoiceId={id}
        total={totals.total}
        paid={totals.paid}
        remaining={totals.remaining}
        defaultMethod={invoice.paymentMethod || "Transferencia"}
        payments={invoice.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidAt: p.paidAt,
          method: p.method,
          notes: p.notes,
        }))}
        disabled={invoice.status === "ANULADA"}
      />

      <div className="card-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Concepto</th>
              <th className="px-4 py-2 text-right font-medium">Cant.</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">Dto</th>
              <th className="px-4 py-2 text-right font-medium">IVA</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-line/50">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {Number(l.quantity)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatCurrency(Number(l.unitPrice))}
                </td>
                <td className="px-4 py-2 text-right">{l.discountPct}%</td>
                <td className="px-4 py-2 text-right">{l.vatRate}%</td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatCurrency(Number(l.lineSubtotal))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end border-t border-line p-4">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Base imponible</span>
              <span className="font-mono">
                {formatCurrency(Number(invoice.subtotal))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">IVA</span>
              <span className="font-mono">
                {formatCurrency(Number(invoice.vatAmount))}
              </span>
            </div>
            {Number(invoice.irpfAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">
                  IRPF (−{invoice.irpfRate}%)
                </span>
                <span className="font-mono text-danger">
                  −{formatCurrency(Number(invoice.irpfAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-1 font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatCurrency(Number(invoice.total))}
              </span>
            </div>
            {totals.paid > 0 && (
              <>
                <div className="flex justify-between text-success">
                  <span>Cobrado</span>
                  <span className="font-mono">{formatCurrency(totals.paid)}</span>
                </div>
                <div className="flex justify-between font-medium text-accent">
                  <span>Pendiente</span>
                  <span className="font-mono">
                    {formatCurrency(totals.remaining)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
