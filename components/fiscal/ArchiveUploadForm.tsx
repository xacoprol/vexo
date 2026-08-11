"use client";

import { useRef, useState, useTransition } from "react";
import { uploadFiscalArchiveDocument } from "@/app/(app)/fiscal/archive/actions";

export function ArchiveUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const failures: string[] = [];
      let ok = 0;
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await uploadFiscalArchiveDocument(fd);
        if (res.ok) ok += 1;
        else failures.push(`${file.name}: ${res.error}`);
      }
      if (ok) setMessage(`Subidos ${ok} archivo(s)`);
      if (failures.length) setError(failures.join(" · "));
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !pending && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-line bg-bg-elevated px-4 py-8 text-center hover:border-accent/50"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          disabled={pending}
          onChange={(e) => onFiles(e.target.files)}
        />
        <p className="text-sm font-medium text-ink">
          {pending ? "Subiendo…" : "Arrastra o elige documentos fiscales"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          PDF, Excel u otros · Blob privado · solo con sesión
        </p>
      </div>
      {message ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
