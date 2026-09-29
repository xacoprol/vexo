"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  attachExpenseDocuments,
  type AttachExpenseDocumentsResult,
} from "@/app/(app)/fiscal/expenses/attach-actions";
import {
  matchExpenseFiles,
  type ExpenseAttachCandidate,
} from "@/lib/expense-document-match";
import { formatCurrency } from "@/lib/calculations";
import { Spinner } from "@/components/ui/Spinner";

type Props = {
  candidates: ExpenseAttachCandidate[];
};

type RowState = {
  file: File;
  expenseId: string;
  confidence: "high" | "low" | "none";
  reason: string;
};

const ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp";

export function ExpenseAttachDocuments({ candidates }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AttachExpenseDocumentsResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map(candidates.map((c) => [c.id, c]));
    return m;
  }, [candidates]);

  function applyFiles(fileList: FileList | File[]) {
    const files = [...fileList].filter((f) => f.size > 0);
    if (!files.length) return;
    setResult(null);
    setError(null);
    const matches = matchExpenseFiles(
      files.map((f) => f.name),
      candidates
    );
    setRows(
      files.map((file, i) => ({
        file,
        expenseId: matches[i]?.expenseId ?? "",
        confidence: matches[i]?.confidence ?? "none",
        reason: matches[i]?.reason ?? "",
      }))
    );
  }

  const assigned = rows.filter((r) => r.expenseId).length;

  function submit() {
    const toSend = rows.filter((r) => r.expenseId);
    if (!toSend.length) {
      setError("Asigna al menos un archivo a un gasto");
      return;
    }
    const fd = new FormData();
    const assignments = toSend.map((r) => ({
      fileName: r.file.name,
      expenseId: r.expenseId,
    }));
    fd.set("assignments", JSON.stringify(assignments));
    for (const r of toSend) {
      fd.append("files", r.file, r.file.name);
    }
    setError(null);
    startTransition(() => {
      void attachExpenseDocuments(fd).then((res) => {
        setResult(res);
        if (res.ok && res.attached > 0) {
          router.refresh();
          setRows((prev) =>
            prev.filter((r) => {
              if (!r.expenseId) return true;
              const failed = res.errors.some((e) => e.fileName === r.file.name);
              return failed;
            })
          );
        }
      });
    });
  }

  return (
    <div className="space-y-5">
      <div
        className="card-panel flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed border-line px-4 py-10 text-center"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files?.length) applyFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-sm font-medium text-ink">
          Suelta PDFs o imágenes de facturas
        </p>
        <p className="max-w-md text-xs text-ink-muted">
          Se emparejan por el nº de factura en el nombre del archivo (p. ej.{" "}
          <span className="font-mono">ES-AEU-2026-653486.pdf</span>). Puedes
          corregir la asignación a mano.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) applyFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <p className="text-sm text-ink-muted">
        {candidates.length} gasto(s) sin PDF.{" "}
        {rows.length ? (
          <>
            {assigned}/{rows.length} archivo(s) asignados.
          </>
        ) : null}
      </p>

      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {result?.ok ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          Adjuntados: {result.attached}. Omitidos: {result.skipped}.
          {result.errors.length ? (
            <span className="mt-1 block text-danger">
              {result.errors
                .slice(0, 5)
                .map((e) => `${e.fileName}: ${e.error}`)
                .join(" · ")}
            </span>
          ) : null}
        </p>
      ) : null}
      {result && !result.ok ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {result.error}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="card-panel overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Archivo</th>
                <th className="px-3 py-2 font-medium">Match</th>
                <th className="px-3 py-2 font-medium">Gasto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.file.name}-${idx}`} className="border-b border-line/50">
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.file.name}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {row.confidence === "high" ? (
                      <span className="text-success">Alto</span>
                    ) : row.confidence === "low" ? (
                      <span className="text-warning">Bajo</span>
                    ) : (
                      <span className="text-danger">Sin match</span>
                    )}
                    <span className="mt-0.5 block">{row.reason}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input text-xs"
                      value={row.expenseId}
                      disabled={pending}
                      onChange={(e) => {
                        const expenseId = e.target.value;
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? {
                                  ...r,
                                  expenseId,
                                  confidence: expenseId
                                    ? "high"
                                    : "none",
                                  reason: expenseId
                                    ? "Asignación manual"
                                    : "Sin asignar",
                                }
                              : r
                          )
                        );
                      }}
                    >
                      <option value="">— Elegir gasto —</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.issueDate} · {c.invoiceNumber ?? "(sin nº)"} ·{" "}
                          {c.supplierName.slice(0, 28)} ·{" "}
                          {formatCurrency(c.total)}
                        </option>
                      ))}
                    </select>
                    {row.expenseId && byId.get(row.expenseId) ? (
                      <Link
                        href={`/fiscal/expenses/${row.expenseId}/edit`}
                        className="mt-1 inline-block text-xs text-accent underline"
                        target="_blank"
                      >
                        Abrir gasto
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || assigned === 0}
          onClick={submit}
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              Subiendo…
            </span>
          ) : (
            `Adjuntar ${assigned || ""}`.trim()
          )}
        </button>
        {rows.length ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() => {
              setRows([]);
              setResult(null);
            }}
          >
            Limpiar
          </button>
        ) : null}
      </div>
    </div>
  );
}
