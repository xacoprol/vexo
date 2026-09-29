"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachDocumentToExpense } from "@/app/(app)/fiscal/expenses/attach-actions";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";

type Props = {
  expenseId: string;
  documentId: string | null;
};

/** Adjuntar PDF a un gasto que se creó sin documento. */
export function ExpenseAttachSingle({ expenseId, documentId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (documentId) {
    return (
      <p className="rounded-lg border border-line bg-accent-soft/40 px-3 py-2 text-sm text-ink-muted">
        Factura original guardada.{" "}
        <a
          href={fiscalDocumentHref(documentId)}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-accent underline"
        >
          Ver archivo
        </a>
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-3 text-sm">
      <p className="text-ink-muted">Este gasto no tiene PDF adjunto.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Subiendo…" : "Adjuntar factura"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const fd = new FormData();
            fd.set("file", file);
            setError(null);
            setOk(false);
            startTransition(() => {
              void attachDocumentToExpense(expenseId, fd).then((res) => {
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setOk(true);
                router.refresh();
              });
            });
          }}
        />
        {ok ? <span className="text-xs text-success">Adjunto</span> : null}
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
