"use client";

import { useRef, useState, useTransition } from "react";
import { importRegisterBookFromUpload } from "@/app/(app)/fiscal/books/actions";

export function BookImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="bookFile">
            Excel libro registro
          </label>
          <input
            ref={inputRef}
            id="bookFile"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="input"
            disabled={pending}
          />
        </div>
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={pending}
          onClick={() => {
            const file = inputRef.current?.files?.[0];
            if (!file) {
              setError("Selecciona un Excel");
              return;
            }
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const fd = new FormData();
              fd.set("file", file);
              const res = await importRegisterBookFromUpload(fd);
              if (res.ok) {
                setMessage(`Importadas ${res.lines} líneas`);
                if (inputRef.current) inputRef.current.value = "";
              } else setError(res.error);
            });
          }}
        >
          {pending ? "Importando…" : "Importar"}
        </button>
      </div>
      {message ? (
        <p className="text-sm text-success">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
