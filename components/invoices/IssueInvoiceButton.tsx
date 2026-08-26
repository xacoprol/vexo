"use client";

import { useState, useTransition } from "react";
import { issueInvoice } from "@/app/(app)/invoices/actions";
import { issueRectification } from "@/app/(app)/invoices/rectification-actions";

type Props = {
  invoiceId: string;
  label?: string;
  rectifying?: boolean;
};

export function IssueInvoiceButton({
  invoiceId,
  label,
  rectifying = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirmMsg = rectifying
    ? "¿Emitir la rectificativa? Quedará sellada, inmutable y enlazada a la original."
    : "¿Emitir fiscalmente esta factura? Quedará sellada, inmutable y no se podrá borrar.";

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          if (!confirm(confirmMsg)) return;
          setError(null);
          startTransition(() => {
            const action = rectifying ? issueRectification : issueInvoice;
            void action(invoiceId).then((res) => {
              if (res.error) setError(res.error);
              else window.location.reload();
            });
          });
        }}
      >
        {pending ? "Emitiendo…" : label ?? "Emitir factura"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
