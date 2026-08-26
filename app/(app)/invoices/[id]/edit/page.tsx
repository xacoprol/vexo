import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm } from "@/components/documents/InvoiceForm";
import {
  isInvoiceIssued,
  ISSUED_IMMUTABLE_ERROR,
} from "@/lib/invoice-fiscal-lifecycle";
import { prisma } from "@/lib/prisma";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, series, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, nif: true, email: true, countryCode: true } },
        lines: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.invoiceSeries.findMany({ orderBy: { prefix: "asc" } }),
    prisma.companySettings.findFirst(),
  ]);
  if (!invoice) notFound();
  if (invoice.status === "ANULADA") {
    return (
      <div className="space-y-4">
        <p>Las facturas anuladas no se pueden editar.</p>
        <Link href={`/invoices/${id}`} className="btn-secondary">
          Volver
        </Link>
      </div>
    );
  }
  if (isInvoiceIssued(invoice)) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10">
        <p className="text-sm text-ink">{ISSUED_IMMUTABLE_ERROR}</p>
        <p className="text-sm text-ink-muted">
          Puedes anular la factura o esperar a la fase de rectificativas. Los
          cobros y notas se gestionan desde la ficha.
        </p>
        <Link href={`/invoices/${id}`} className="btn-secondary">
          Volver a la factura
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Link
        href={`/invoices/${id}`}
        className="inline-block text-sm text-ink-muted hover:text-accent"
      >
        ← Volver a la factura
      </Link>
      <InvoiceForm
        series={series.map((s) => ({
          id: s.id,
          name: s.name,
          prefix: s.prefix,
        }))}
        defaultClient={invoice.client}
        defaultVatRate={settings?.defaultVatRate ?? 21}
        defaultIrpfRate={settings?.defaultIrpfRate ?? 15}
        invoice={{
          id: invoice.id,
          clientId: invoice.clientId,
          seriesId: invoice.seriesId,
          fullNumber: invoice.fullNumber,
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          dueDate: invoice.dueDate
            ? invoice.dueDate.toISOString().slice(0, 10)
            : "",
          status: invoice.status,
          paymentMethod: invoice.paymentMethod ?? "",
          invoiceKind: invoice.invoiceKind ?? "FULL",
          notes: invoice.notes ?? "",
          irpfRate: invoice.irpfRate,
          vatOperationType: invoice.vatOperationType,
          operationKey347: invoice.operationKey347 ?? "B",
          lines: invoice.lines.map((l) => ({
            id: l.id,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            vatRate: l.vatRate,
            discountPct: l.discountPct,
          })),
        }}
      />
    </div>
  );
}
