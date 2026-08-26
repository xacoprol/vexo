"use client";

import { useState, useTransition } from "react";
import { deleteInvoice } from "@/app/(app)/invoices/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";

type Props = {
  invoiceId: string;
  fullNumber: string;
};

export function DeleteInvoiceButton({ invoiceId, fullNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(() => {
      void deleteInvoice(invoiceId)
        .then(() => setOpen(false))
        .catch((err) => {
          if (isRedirectError(err)) return;
          setError(err instanceof Error ? err.message : String(err));
        });
    });
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-lg border border-danger px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Eliminar
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-invoice-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="card-panel w-full max-w-md space-y-4 p-5 shadow-xl">
            <div>
              <h2
                id="delete-invoice-title"
                className="text-lg font-semibold tracking-tight"
              >
                Eliminar factura
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                ¿Seguro que quieres eliminar{" "}
                <span className="font-mono font-medium text-ink">
                  {fullNumber}
                </span>
                ? Esta acción no se puede deshacer. Solo borradores: si era la
                última de la serie, su número vuelve a quedar disponible. Las
                facturas emitidas no se pueden eliminar (usa anulación).
              </p>
            </div>

            {error ? (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={pending}
                onClick={handleConfirm}
              >
                {pending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
