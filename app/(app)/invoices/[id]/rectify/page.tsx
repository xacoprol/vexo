import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RectifyInvoiceWizard } from "@/components/invoices/RectifyInvoiceWizard";
import { canRectifyInvoice } from "@/lib/invoice-rectification";

export default async function RectifyInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      fullNumber: true,
      fiscalStatus: true,
      status: true,
      invoiceFiscalType: true,
      subtotal: true,
      vatAmount: true,
      total: true,
      invoiceKind: true,
    },
  });
  if (!invoice) notFound();

  if (invoice.invoiceFiscalType === "RECTIFYING") {
    redirect(`/invoices/${id}`);
  }

  const check = canRectifyInvoice(invoice);
  if (!check.ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href={`/invoices/${id}`} className="text-sm text-accent">
          ← Volver
        </Link>
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          {check.reason}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/invoices/${id}`} className="text-sm text-accent">
        ← {invoice.fullNumber}
      </Link>
      <RectifyInvoiceWizard
        original={{
          id: invoice.id,
          fullNumber: invoice.fullNumber,
          subtotal: Number(invoice.subtotal),
          vatAmount: Number(invoice.vatAmount),
          total: Number(invoice.total),
          invoiceKind: invoice.invoiceKind,
        }}
      />
    </div>
  );
}
