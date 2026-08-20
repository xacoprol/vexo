"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import type { ParsedExpenseDraft } from "@/lib/gemini-expense";
import {
  saveExpenseDraft,
  saveExpenseDraftQueue,
  type ExpenseQueueItem,
} from "@/lib/expense-draft-storage";
import {
  compressUploadFile,
  formatBytes,
} from "@/lib/compress-upload";
import { Spinner } from "@/components/ui/Spinner";

type Props = {
  /** Si se pasa y solo hay 1 archivo, rellena el formulario en la misma página. */
  onParsed?: (draft: ParsedExpenseDraft) => void;
  compact?: boolean;
};

const ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/gif,text/csv,.csv";
const MAX_FILES = 30;
const CLIENT_TIMEOUT_MS = 90_000;

function newLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type ParseApiResult =
  | {
      ok: true;
      draft: ParsedExpenseDraft;
      drafts?: ParsedExpenseDraft[];
    }
  | { ok: false; error: string };

async function parseExpenseViaApi(file: File): Promise<ParseApiResult> {
  if (file.size > 4_200_000) {
    return {
      ok: false,
      error: `Archivo demasiado grande (${formatBytes(file.size)}) tras comprimir. Prueba JPG o un PDF más ligero.`,
    };
  }

  const fd = new FormData();
  fd.set("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const res = await fetch("/api/expenses/parse", {
      method: "POST",
      body: fd,
      signal: controller.signal,
      credentials: "same-origin",
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      if (res.status === 413) {
        return {
          ok: false,
          error: "Archivo demasiado grande para el servidor. Prueba JPG.",
        };
      }
      if (res.status === 504 || res.status === 408) {
        return {
          ok: false,
          error:
            "Tiempo de espera agotado. Prueba PNG/JPG o sube de una en una.",
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
        error: "Tiempo de espera agotado al leer el gasto.",
      };
    }
    const msg = e instanceof Error ? e.message : "Error de red al subir";
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return {
        ok: false,
        error:
          "No se pudo subir (red o archivo demasiado grande). Prueba de nuevo o usa JPG.",
      };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export function ExpenseDropZone({ onParsed, compact }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
    phase?: "compress" | "parse";
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

    const ok: ExpenseQueueItem[] = [];
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
          phase: "compress",
        });

        let upload: File;
        try {
          const compressed = await compressUploadFile(file);
          upload = compressed.file;
        } catch (e) {
          failures.push(
            `${file.name}: ${e instanceof Error ? e.message : "No se pudo leer"}`
          );
          continue;
        }

        setProgress({
          current: i + 1,
          total: files.length,
          fileName: upload.name,
          phase: "parse",
        });

        const res = await parseExpenseViaApi(upload);
        if (!res.ok) {
          failures.push(`${file.name}: ${res.error}`);
          continue;
        }
        const drafts =
          res.drafts && res.drafts.length > 0 ? res.drafts : [res.draft];
        for (const draft of drafts) {
          ok.push({
            ...draft,
            localId: newLocalId(),
            fileName: file.name,
          });
        }

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

      if (ok.length === 1 && onParsed) {
        onParsed(ok[0]);
        return;
      }

      if (ok.length === 1) {
        saveExpenseDraft(ok[0]);
        router.push("/fiscal/expenses/new");
        return;
      }

      saveExpenseDraftQueue(ok);
      router.push("/fiscal/expenses/batch");
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
                ? progress.phase === "compress"
                  ? `Comprimiendo ${progress.current}/${progress.total}…`
                  : `Leyendo ${progress.current}/${progress.total}…`
                : "Leyendo…"}
            </span>
          ) : dragging
            ? "Suelta aquí las facturas"
            : "Arrastra aquí una o varias facturas de gasto"}
        </p>
        {parsing ? (
          <p className="mt-1 truncate text-xs text-ink-muted">
            {progress.fileName}
          </p>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">
            PDF → JPG al subir · Drive: descárgalo antes · hasta {MAX_FILES} ·
            tú revisas y guardas
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
