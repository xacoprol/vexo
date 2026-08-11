"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/calculations";

type Box = { code: string; label: string; value: number };

type Props = {
  boxes: Box[];
  result?: number;
  resultLabel?: string;
};

export function CopyableBoxes({ boxes, result, resultLabel }: Props) {
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
    const lines = boxes.map(
      (b) => `${b.code}\t${b.label}\t${amountPlain(b.value)}`
    );
    if (result != null) {
      lines.push(
        `RESULTADO\t${resultLabel ?? "Resultado"}\t${amountPlain(result)}`
      );
    }
    await copyText("all", lines.join("\n"));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          Copia cada importe e introdúcelo en la casilla de la sede AEAT
        </p>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => void copyAll()}
        >
          {copied === "all" ? "Copiado" : "Copiar todas"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Casilla</th>
              <th className="px-2 py-2 text-left font-medium">Qué es</th>
              <th className="px-2 py-2 text-right font-medium">Importe</th>
              <th className="px-2 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {boxes.map((b) => (
              <tr key={`${b.code}-${b.label}`} className="border-b border-line/50">
                <td className="px-2 py-2 font-mono font-medium">{b.code}</td>
                <td className="px-2 py-2 text-ink-muted">{b.label}</td>
                <td className="px-2 py-2 text-right font-mono">
                  {formatCurrency(b.value)}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() =>
                      void copyText(b.code, amountPlain(b.value))
                    }
                  >
                    {copied === b.code ? "OK" : "Copiar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-soft/50 px-4 py-3">
          <p className="text-sm font-medium">
            {resultLabel ?? "Resultado"}:{" "}
            <span className="font-mono">{formatCurrency(result)}</span>
          </p>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => void copyText("result", amountPlain(result))}
          >
            {copied === "result" ? "Copiado" : "Copiar resultado"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
