"use client";

import { useState, useTransition } from "react";
import type { RemitQueueResult } from "@/lib/verifactu-remit";

type Props = {
  action: () => Promise<RemitQueueResult>;
  disabled?: boolean;
};

export function VerifactuRemitButton({ action, disabled }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RemitQueueResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-secondary text-sm"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              const r = await action();
              setResult(r);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error al remitir");
            }
          });
        }}
      >
        {pending ? "Remitiendo…" : "Procesar cola ahora"}
      </button>
      {disabled ? (
        <p className="text-xs text-ink-muted">
          Activa modo VERIFACTU para procesar la cola.
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {result ? (
        <p className="text-xs text-ink-muted">
          Procesados {result.processed} · aceptados {result.accepted} ·
          rechazados {result.rejected}
          {result.errors.length
            ? ` · ${result.errors.slice(0, 2).join("; ")}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
