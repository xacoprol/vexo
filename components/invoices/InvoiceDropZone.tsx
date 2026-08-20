"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import type { ParsedInvoiceDraft } from "@/lib/gemini-invoice";
import {
  saveInvoiceDraftQueue,
  type InvoiceQueueItem,
} from "@/lib/invoice-draft-storage";
import {
  compressUploadFile,
  formatBytes,
} from "@/lib/compress-upload";
import { Spinner } from "@/components/ui/Spinner";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif";
const MAX_FILES = 30;
const CLIENT_TIMEOUT_MS = 90_000;

function newLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type ParseApiResult =
  | { ok: true; draft: ParsedInvoiceDraft }
  | { ok: false; error: string };

async function parseInvoiceViaApi(file: File): Promise<ParseApiResult> {
  if (file.size > 4_200_000) {
    return {
      ok: false,
      error: `Archivo demasiado grande (${formatBytes(file.size)}) tras comprimir. Prueba JPG.`,
    };
  }

  const fd = new FormData();
  fd.set("file", file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const res = await fetch("/api/invoices/parse", {
      method: "POST",
      body: fd,
      signal: controller.signal,
      credentials: "same-origin",
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      if (res.status === 413) {
        return { ok: false, error: "Archivo demasiado grande" };
      }
      if (res.status === 504 || res.status === 408) {
        return {
          ok: false,
          error:
            "Tiempo de espera agotado en el servidor. Prueba una imagen PNG/JPG o de una en una.",
        };
      }
      return {
        ok: false,
        error: `Respuesta inesperada del servidor (${res.status}). Prueba de nuevo.`,
      };
    }

    const data = (await res.json()) as ParseApiResult;
    if (!data || typeof data !== "object" || !("ok" in data)) {
      return { ok: false, error: "Respuesta inválida del servidor" };
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        error:
          "Tiempo de espera agotado al leer la factura. Prueba PNG/JPG o de una en una.",
      };
    }
    const msg = e instanceof Error ? e.message : "Error de red al subir";
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return {
        ok: false,
        error:
          "No se pudo subir (red o archivo demasiado grande). Prueba JPG.",
      };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

type Props = {
  compact?: boolean;
};

export function InvoiceDropZone({ compact }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);

  const parsing = progress != null;

  async function handleFiles(fileList: FileList | File[] | null) {
    setError(null);
    const files = Array.from(fileList ?? []).filter((f) => f.size > 0);
    if (!files.length) return;
    if (files.length > MAX_FILES) {
      setError(`Máximo ${MAX_FILES} archivos a la vez`);
      return;
    }

    const ok: InvoiceQueueItem[] = [];
    const failures: string[] = [];

    setProgress({
      current: 1,
      total: files.length,
      fileName: files[0].name,
    });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({
          current: i + 1,
          total: files.length,
          fileName: file.name,
        });

        const { file: upload } = await compressUploadFile(file);
        const res = await parseInvoiceViaApi(upload);
        if (!res.ok) {
          failures.push(`${file.name}: ${res.error}`);
          continue;
        }
        ok.push({
          ...res.draft,
          localId: newLocalId(),
          fileName: file.name,
        });

        if (i < files.length - 1) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (!ok.length) {
        setError(
          failures[0] ?? "No se pudo leer ninguna factura. Prueba de nuevo."
        );
        return;
      }

      if (failures.length) {
        setError(
          `Se leyeron ${ok.length} de ${files.length}. Fallaron: ${failures.join(" · ")}`
        );
      }

      saveInvoiceDraftQueue(ok);
      router.push("/invoices/import");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo procesar la subida"
      );
    } finally {
      setProgress(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
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
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 text-center transition ${
          compact ? "py-6" : "py-10 sm:py-12"
        } ${
          dragging
            ? "border-accent bg-accent-soft/60"
            : "border-line bg-bg-elevated hover:border-accent/50 hover:bg-accent-soft/30"
        } ${parsing ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          disabled={parsing}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium text-ink">
          {parsing ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner className="h-4 w-4" />
              {progress
                ? `Leyendo ${progress.current}/${progress.total}…`
                : "Leyendo…"}
            </span>
          ) : dragging
            ? "Suelta aquí las facturas emitidas"
            : "Arrastra facturas de ingreso históricas (PDF/imagen)"}
        </p>
        {parsing ? (
          <p className="mt-1 truncate text-xs text-ink-muted">
            {progress.fileName}
          </p>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">
            Conserva el nº original · Gemini lee · tú revisas · hasta{" "}
            {MAX_FILES} archivos
          </p>
        )}
        {!parsing ? (
          <p className="mt-3 text-xs font-medium text-accent">
            o haz clic para elegir archivos
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
