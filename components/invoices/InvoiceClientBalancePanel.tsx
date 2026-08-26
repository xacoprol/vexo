import { formatCurrency } from "@/lib/calculations";
import { computeClientInvoiceBalance } from "@/lib/invoice-rectification";

type Props = {
  invoiceTotal: number;
  rectificationsTotal: number;
  paid: number;
};

export function InvoiceClientBalancePanel({
  invoiceTotal,
  rectificationsTotal,
  paid,
}: Props) {
  const bal = computeClientInvoiceBalance({
    invoiceTotal,
    rectificationsTotal,
    paid,
  });
  if (rectificationsTotal === 0) return null;

  return (
    <section className="card-panel space-y-2 p-4 text-sm">
      <h3 className="form-section-title">Saldo tras rectificativas</h3>
      <dl className="space-y-1">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Factura original</dt>
          <dd className="font-mono">{formatCurrency(bal.invoiceTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Rectificativas</dt>
          <dd className="font-mono">{formatCurrency(bal.rectificationsTotal)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Neto</dt>
          <dd className="font-mono">{formatCurrency(bal.netTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Pagado</dt>
          <dd className="font-mono">{formatCurrency(bal.paid)}</dd>
        </div>
        {bal.clientCredit > 0 ? (
          <div className="flex justify-between text-accent">
            <dt>Saldo a favor del cliente</dt>
            <dd className="font-mono">{formatCurrency(bal.clientCredit)}</dd>
          </div>
        ) : null}
        {bal.amountDue > 0 ? (
          <div className="flex justify-between">
            <dt>Pendiente de cobro</dt>
            <dd className="font-mono">{formatCurrency(bal.amountDue)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs text-ink-muted">
        Los cobros históricos no se eliminan al rectificar.
      </p>
    </section>
  );
}
