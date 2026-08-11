import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InvoiceForm } from "@/components/documents/InvoiceForm";

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
