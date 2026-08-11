"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { parseFiscalFilingFromUpload } from "@/app/(app)/fiscal/filings/parse-actions";
import {
  saveFilingDraftQueue,
  type FilingQueueItem,
} from "@/lib/filing-draft-storage";
import { Spinner } from "@/components/ui/Spinner";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif";
const MAX_FILES = 30;

function newLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  compact?: boolean;
};

export function FilingDropZone({ compact }: Props) {
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

    const ok: FilingQueueItem[] = [];
    const failures: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({
        current: i + 1,
        total: files.length,
        fileName: file.name,
      });

      const fd = new FormData();
      fd.set("file", file);
      const res = await parseFiscalFilingFromUpload(fd);
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
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setProgress(null);

    if (!ok.length) {
      setError(
        failures[0] ?? "No se pudo leer ningún modelo. Prueba de nuevo."
      );
      return;
    }

    if (failures.length) {
      setError(
        `Se leyeron ${ok.length} de ${files.length}. Fallaron: ${failures.join(" · ")}`
      );
    }

    saveFilingDraftQueue(ok);
    router.push("/fiscal/filings/review");
  }

  function onDrop(e: DragEvent) {
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
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed px-4 transition ${
          compact ? "py-6" : "py-10"
        } ${
          dragging
            ? "border-accent bg-accent-soft/50"
            : "border-line bg-bg-elevated/40 hover:border-accent/50"
        } ${parsing ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-2 text-center">
          {parsing ? (
            <>
              <Spinner className="h-6 w-6 text-accent" />
              <p className="text-sm font-medium">
                Leyendo {progress?.current}/{progress?.total}…
              </p>
              <p className="text-xs text-ink-muted">{progress?.fileName}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                Sube modelos presentados (PDF o imagen)
              </p>
              <p className="text-xs text-ink-muted">
                303, 130, 390, 347, 349 o 036 · Gemini extrae casillas
              </p>
            </>
          )}
        </div>
      </div>
      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
