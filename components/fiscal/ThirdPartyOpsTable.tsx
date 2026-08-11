"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { ThirdPartyOp } from "@/lib/fiscal-347-349";

type Props = {
  title: string;
  hint?: string;
  ops: ThirdPartyOp[];
  emptyText?: string;
  keyLabels?: Record<string, string>;
};

export function ThirdPartyOpsTable({
  title,
  hint,
  ops,
  emptyText = "Ninguna operación en este bloque.",
  keyLabels = {},
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  function amountPlain(n: number): string {
    return n.toFixed(2).replace(".", ",");
  }

  async function copyAll() {
    const lines = ops.map(
      (o) =>
        `${o.key}\t${o.nif}\t${o.name}\t${o.countryCode ?? ""}\t${amountPlain(o.amount)}`
    );
    await copyText("all", lines.join("\n"));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
        </div>
        {ops.length > 0 ? (
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => void copyAll()}
          >
            {copied === "all" ? "Copiado" : "Copiar lista"}
          </button>
        ) : null}
      </div>

      {ops.length === 0 ? (
        <p className="text-sm text-ink-muted">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Clave</th>
                <th className="px-2 py-2 text-left font-medium">NIF / VAT</th>
                <th className="px-2 py-2 text-left font-medium">Nombre</th>
                <th className="px-2 py-2 text-left font-medium">País</th>
                <th className="px-2 py-2 text-right font-medium">Base</th>
                <th className="px-2 py-2 text-right font-medium">Ops</th>
                <th className="px-2 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => {
                const rowKey = `${o.key}-${o.nif}`;
                return (
                  <tr key={rowKey} className="border-b border-line/50">
                    <td className="px-2 py-2 font-mono">
                      {o.key}
                      {keyLabels[o.key] ? (
                        <span className="ml-1 text-xs text-ink-muted">
                          {keyLabels[o.key]}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{o.nif}</td>
                    <td className="px-2 py-2">{o.name || "—"}</td>
                    <td className="px-2 py-2 text-ink-muted">
                      {o.countryCode ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatCurrency(o.amount)}
                    </td>
                    <td className="px-2 py-2 text-right text-ink-muted">
                      {o.count}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        onClick={() =>
                          void copyText(rowKey, amountPlain(o.amount))
                        }
                      >
                        {copied === rowKey ? "OK" : "Copiar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
