import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { paymentTotals } from "@/lib/invoice-payments";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VerifactuBadge } from "@/components/invoices/VerifactuBadge";
import {
  resolveVerifactuInvoiceStatus,
} from "@/lib/verifactu";
import { annulInvoice, setInvoiceStatus } from "../actions";
import { SendDocumentButton } from "@/components/documents/SendDocumentButton";
import { DeleteInvoiceButton } from "@/components/invoices/DeleteInvoiceButton";
import { IssueInvoiceButton } from "@/components/invoices/IssueInvoiceButton";
import { InvoicePaymentsPanel } from "@/components/invoices/InvoicePaymentsPanel";
import { MarkPendingButton } from "@/components/invoices/MarkPendingButton";
import { SendReminderButton } from "@/components/documents/SendReminderButton";
import { isInvoiceDraft, isInvoiceIssued } from "@/lib/invoice-fiscal-lifecycle";

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
      marketplaceIncome: {
        select: { id: true, externalRef: true, externalKey: true, channel: true },
      },
      payments: { orderBy: { paidAt: "desc" } },
      verifactuEvents: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          kind: true,
          status: true,
          aeatCode: true,
          aeatMessage: true,
          createdAt: true,
        },
      },
    },
  });
  if (!invoice) notFound();

  const totals = paymentTotals(invoice.total, invoice.payments);
  const canRemind =
    invoice.status !== "ANULADA" &&
    invoice.status !== "PAGADA" &&
    totals.remaining > 0;

  const draft = isInvoiceDraft(invoice);
  const issued = isInvoiceIssued(invoice);

  const hasPending = invoice.verifactuEvents.some(
    (e) => e.status === "PENDING" || e.status === "SENT"
  );
  const hasRejected = invoice.verifactuEvents.some(
    (e) => e.status === "REJECTED"
  );
  const verifactuStatus = resolveVerifactuInvoiceStatus({
    status: invoice.status,
    verifactuHash: invoice.verifactuHash,
    verifactuSentAt: invoice.verifactuSentAt,
    pendingEvent: hasPending,
    rejectedEvent: hasRejected && !invoice.verifactuSentAt,
  });

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
            {draft ? (
              <span className="badge bg-line/40 text-ink-muted">Borrador</span>
            ) : (
              <span className="badge bg-success/15 text-success">Emitida</span>
            )}
            <span className="badge bg-accent-soft text-accent">
              {invoice.invoiceKind === "SIMPLIFIED"
                ? "Simplificada (F2)"
                : "Completa (F1)"}
            </span>
            <VerifactuBadge status={verifactuStatus} />
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
            {invoice.marketplaceIncome && (
              <Link
                href={`/fiscal/income/${invoice.marketplaceIncome.id}/edit`}
                className="text-sm text-accent hover:underline"
              >
                Origen:{" "}
                {invoice.marketplaceIncome.channel === "SHOPIFY"
                  ? "Shopify"
                  : invoice.marketplaceIncome.channel === "AMAZON"
                    ? "Amazon"
                    : invoice.marketplaceIncome.channel}{" "}
                {invoice.marketplaceIncome.externalRef ??
                  invoice.marketplaceIncome.externalKey}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status !== "ANULADA" && (
            <>
              {draft ? <IssueInvoiceButton invoiceId={id} /> : null}
              {issued ? <SendDocumentButton kind="invoice" id={id} /> : null}
              {canRemind && issued ? (
                <SendReminderButton invoiceId={id} />
              ) : null}
              {draft ? (
                <Link href={`/invoices/${id}/edit`} className="btn-secondary">
                  Editar
                </Link>
              ) : (
                <span
                  className="btn-secondary cursor-not-allowed opacity-60"
                  title="La factura ya ha sido emitida y su contenido fiscal no puede modificarse. Usa anulación o una rectificativa (fase futura)."
                >
                  Editar
                </span>
              )}
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
          {draft ? (
            <DeleteInvoiceButton
              invoiceId={id}
              fullNumber={invoice.fullNumber}
            />
          ) : null}
        </div>
      </div>

      {issued && invoice.status !== "ANULADA" ? (
        <p className="rounded-lg border border-line bg-line/20 px-3 py-2 text-sm text-ink-muted">
          Factura emitida: el contenido fiscal está bloqueado. Puedes gestionar
          cobros y anular. La rectificativa formal llegará en una fase
          posterior.
        </p>
      ) : null}

      {draft ? (
        <p className="rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-sm text-ink">
          Borrador: editable y borrable. No entra en libros ni modelos hasta que
          pulses <strong>Emitir factura</strong>.
        </p>
      ) : null}

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
          {issued ? (
            <form action={annulInvoice.bind(null, id)}>
              <button type="submit" className="btn-ghost text-warning text-sm">
                Anular factura
              </button>
            </form>
          ) : null}
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

      {invoice.verifactuHash || invoice.verifactuEvents.length > 0 ? (
        <div className="card-panel space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Veri*Factu</h2>
            <Link
              href="/fiscal/verifactu"
              className="text-xs text-accent hover:underline"
            >
              Panel Veri*Factu
            </Link>
          </div>
          {invoice.verifactuHash ? (
            <p className="font-mono text-xs text-ink-muted break-all">
              Huella: {invoice.verifactuHash}
            </p>
          ) : null}
          {invoice.verifactuSentAt ? (
            <p className="text-xs text-ink-muted">
              Remitida: {formatDate(invoice.verifactuSentAt)}
            </p>
          ) : null}
          {invoice.verifactuEvents.length > 0 ? (
            <ul className="space-y-1 text-xs text-ink-muted">
              {invoice.verifactuEvents.map((ev) => (
                <li key={ev.id}>
                  {ev.kind} · {ev.status}
                  {ev.aeatCode ? ` · ${ev.aeatCode}` : ""}
                  {ev.aeatMessage ? ` — ${ev.aeatMessage}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
