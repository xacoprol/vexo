"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { parseMarketplaceIncomeUpload } from "@/app/(app)/fiscal/income/actions";
import { saveMarketplaceIncomeQueue } from "@/lib/marketplace-income-storage";
import { formatCurrency } from "@/lib/calculations";
import { Spinner } from "@/components/ui/Spinner";

function newLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function MarketplaceIncomeDropZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    setError(null);
    setHint(null);
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await parseMarketplaceIncomeUpload(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      saveMarketplaceIncomeQueue({
        channel: res.channel,
        needsPeriodDate: res.needsPeriodDate,
        items: res.rows.map((r) => ({
          ...r,
          localId: newLocalId(),
          sourceFile: res.sourceFile,
          documentId: res.sourceDocumentId,
        })),
      });
      const channelLabel = res.channel === "SHOPIFY" ? "Shopify" : "Amazon";
      setHint(
        `${channelLabel}: ${res.summary.count} líneas · con IVA ${formatCurrency(res.summary.taxableBase)} + ${formatCurrency(res.summary.taxableVat)} IVA · sin IVA ${formatCurrency(res.summary.exemptBase)}`
      );
      router.push("/fiscal/income/import");
    } finally {
      setParsing(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!parsing) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={onDrop}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center transition sm:py-12 ${
          dragging
            ? "border-accent bg-accent-soft/60"
            : "border-line bg-bg-elevated hover:border-accent/50 hover:bg-accent-soft/30"
        } ${parsing ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,application/pdf,image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={parsing}
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium text-ink">
          {parsing ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner className="h-4 w-4" label="Leyendo informe" />
              Leyendo informe…
            </span>
          ) : dragging
            ? "Suelta el archivo aquí"
            : "Arrastra CSV o captura del resumen IVA (Shopify)"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Amazon: VAT Tax Report CSV · Shopify: CSV por país, Informe IVA o
          resumen del chat/email
        </p>
        {!parsing ? (
          <p className="mt-3 text-xs font-medium text-accent">
            o haz clic para elegir archivo
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
