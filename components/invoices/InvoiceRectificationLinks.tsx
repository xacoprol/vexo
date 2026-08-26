import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { INVOICE_FISCAL_TYPE } from "@/lib/invoice-rectification";
import { IssueInvoiceButton } from "@/components/invoices/IssueInvoiceButton";
import { DeleteInvoiceButton } from "@/components/invoices/DeleteInvoiceButton";
import { isInvoiceDraft, isInvoiceIssued } from "@/lib/invoice-fiscal-lifecycle";

type RectInvoice = {
  id: string;
  fullNumber: string;
  issueDate: Date;
  fiscalStatus: string;
  rectificationType: string | null;
  rectificationMethod: string | null;
  subtotal: { toString(): string };
  vatAmount: { toString(): string };
  total: { toString(): string };
  rectifiesInvoice: {
    id: string;
    fullNumber: string;
    issueDate: Date;
  } | null;
};

export function RectificationDraftPanel({ invoice }: { invoice: RectInvoice }) {
  const draft = isInvoiceDraft(invoice);
  const issued = isInvoiceIssued(invoice);

  return (
    <section className="card-panel space-y-4 p-5">
      <div>
        <span className="badge bg-warning/15 text-warning">Rectificativa</span>
        {invoice.rectificationType ? (
          <span className="ml-2 badge bg-accent-soft text-accent">
            {invoice.rectificationType}
          </span>
        ) : null}
        {invoice.rectificationMethod ? (
          <span className="ml-2 badge bg-line/50 text-ink-muted">
            {invoice.rectificationMethod === "SUBSTITUTION"
              ? "Sustitución"
              : "Diferencias"}
          </span>
        ) : null}
      </div>

      {invoice.rectifiesInvoice ? (
        <p className="text-sm">
          Rectifica{" "}
          <Link
            href={`/invoices/${invoice.rectifiesInvoice.id}`}
            className="font-mono text-accent hover:underline"
          >
            {invoice.rectifiesInvoice.fullNumber}
          </Link>{" "}
          ({formatDate(invoice.rectifiesInvoice.issueDate)})
        </p>
      ) : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Base</dt>
          <dd className="font-mono">{formatCurrency(Number(invoice.subtotal))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">IVA</dt>
          <dd className="font-mono">{formatCurrency(Number(invoice.vatAmount))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Total</dt>
          <dd className="font-mono font-semibold">
            {formatCurrency(Number(invoice.total))}
          </dd>
        </div>
      </dl>

      {draft ? (
        <div className="flex flex-wrap gap-2">
          <IssueInvoiceButton invoiceId={invoice.id} label="Emitir rectificativa" rectifying />
          <DeleteInvoiceButton invoiceId={invoice.id} fullNumber={invoice.fullNumber} />
        </div>
      ) : issued ? (
        <p className="text-sm text-success">Rectificativa emitida e inmutable.</p>
      ) : null}
    </section>
  );
}

export function InvoiceRectificationLinks({
  invoiceId,
  rectifyingInvoices,
}: {
  invoiceId: string;
  rectifyingInvoices: {
    id: string;
    fullNumber: string;
    fiscalStatus: string;
    total: { toString(): string };
  }[];
}) {
  if (!rectifyingInvoices.length) return null;
  return (
    <section className="card-panel space-y-2 p-4">
      <h3 className="form-section-title">Rectificada por</h3>
      <ul className="space-y-1 text-sm">
        {rectifyingInvoices.map((r) => (
          <li key={r.id}>
            <Link
              href={`/invoices/${r.id}`}
              className="font-mono text-accent hover:underline"
            >
              {r.fullNumber}
            </Link>{" "}
            <span className="text-ink-muted">
              {formatCurrency(Number(r.total))}
              {r.fiscalStatus === "DRAFT" ? " · borrador" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function isRectifyingInvoice(invoice: {
  invoiceFiscalType?: string | null;
}): boolean {
  return invoice.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING;
}
