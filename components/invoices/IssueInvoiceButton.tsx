"use client";

import { useState, useTransition } from "react";
import { issueInvoice } from "@/app/(app)/invoices/actions";

export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "¿Emitir fiscalmente esta factura? Quedará sellada, inmutable y no se podrá borrar."
            )
          ) {
            return;
          }
          setError(null);
          startTransition(() => {
            void issueInvoice(invoiceId).then((res) => {
              if (res.error) setError(res.error);
              else window.location.reload();
            });
          });
        }}
      >
        {pending ? "Emitiendo…" : "Emitir factura"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
