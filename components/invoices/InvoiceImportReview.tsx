"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VAT_RATES } from "@/lib/calculations";
import { DateInput } from "@/components/ui/DateInput";
import {
  createHistoricalInvoice,
  type HistoricalInvoiceDraftInput,
} from "@/app/(app)/invoices/actions";
import {
  clearInvoiceDraftQueue,
  peekInvoiceDraftQueue,
  saveInvoiceDraftQueue,
  type InvoiceQueueItem,
} from "@/lib/invoice-draft-storage";
import type { ParsedInvoiceLine } from "@/lib/gemini-invoice";

type SeriesOption = { id: string; prefix: string; name: string; isDefault: boolean };

type RowStatus = "pending" | "saving" | "saved" | "error";

type Row = InvoiceQueueItem & {
  status: RowStatus;
  error?: string;
  duplicateId?: string;
  seriesId: string;
  markAsPaid: boolean;
  savedId?: string;
};

const VAT_OPS = [
  { value: "SUJETA", label: "Sujeta a IVA" },
  { value: "EXENTA", label: "Exenta" },
  { value: "INTRACOMUNITARIA", label: "Intracomunitaria" },
  { value: "CANARIAS", label: "Canarias" },
  { value: "EXPORTACION", label: "Exportación" },
] as const;

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toQueueItem(row: Row): InvoiceQueueItem {
  return {
    localId: row.localId,
    fileName: row.fileName,
    fullNumber: row.fullNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    clientName: row.clientName,
    clientNif: row.clientNif,
    clientCountryCode: row.clientCountryCode,
    clientAddressStreet: row.clientAddressStreet,
    clientAddressCity: row.clientAddressCity,
    clientAddressProvince: row.clientAddressProvince,
    clientAddressZip: row.clientAddressZip,
    clientAddressCountry: row.clientAddressCountry,
    clientEmail: row.clientEmail,
    description: row.description,
    lines: row.lines,
    subtotal: row.subtotal,
    vatAmount: row.vatAmount,
    irpfRate: row.irpfRate,
    irpfAmount: row.irpfAmount,
    total: row.total,
    vatOperationType: row.vatOperationType,
    operationKey347: row.operationKey347 ?? "B",
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    likelyPaid: row.likelyPaid,
    confidence: row.confidence,
    documentId: row.documentId ?? null,
  };
}

function matchSeriesId(
  fullNumber: string | null,
  series: SeriesOption[],
  fallback: string
): string {
  if (!fullNumber || !series.length) return fallback;
  const upper = fullNumber.toUpperCase();
  const match = [...series]
    .filter((s) => upper.startsWith(s.prefix.toUpperCase()))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.id ?? fallback;
}

function persistPending(rows: Row[]) {
  saveInvoiceDraftQueue(
    rows.filter((r) => r.status !== "saved").map(toQueueItem)
  );
}

function ensureLines(row: Row): ParsedInvoiceLine[] {
  if (row.lines?.length) return row.lines;
  return [
    {
      description: row.description?.trim() || "Servicios / productos",
      quantity: 1,
      unitPrice: row.subtotal || row.total,
      vatRate:
        row.subtotal > 0 && row.vatAmount > 0
          ? round2((row.vatAmount / row.subtotal) * 100)
          : 21,
      discountPct: 0,
    },
  ];
}

function toInput(row: Row): HistoricalInvoiceDraftInput {
  return {
    fullNumber: row.fullNumber ?? "",
    seriesId: row.seriesId || null,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    clientName: row.clientName,
    clientNif: row.clientNif,
    clientCountryCode: row.clientCountryCode,
    clientAddressStreet: row.clientAddressStreet,
    clientAddressCity: row.clientAddressCity,
    clientAddressProvince: row.clientAddressProvince,
    clientAddressZip: row.clientAddressZip,
    clientAddressCountry: row.clientAddressCountry,
    clientEmail: row.clientEmail,
    description: row.description,
    lines: ensureLines(row),
    irpfRate: row.irpfRate,
    vatOperationType: row.vatOperationType,
    operationKey347: row.operationKey347 ?? "B",
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    markAsPaid: row.markAsPaid,
    documentId: row.documentId ?? null,
  };
}

type Props = {
  series: SeriesOption[];
};

export function InvoiceImportReview({ series }: Props) {
  const router = useRouter();
  const defaultSeriesId =
    series.find((s) => s.isDefault)?.id ?? series[0]?.id ?? "";
  const [rows, setRows] = useState<Row[] | null>(null);
  const rowsRef = useRef<Row[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const items = peekInvoiceDraftQueue();
    const initial: Row[] = items.map((item) => ({
      ...item,
      seriesId: matchSeriesId(item.fullNumber, series, defaultSeriesId),
      markAsPaid: item.likelyPaid,
      status: "pending" as const,
    }));
    setRows(initial);
    rowsRef.current = initial;
  }, [defaultSeriesId, series]);

  function replaceRows(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
  }

  function patchRow(localId: string, patch: Partial<Row>) {
    const current = rowsRef.current ?? [];
    replaceRows(
      current.map((r) => (r.localId === localId ? { ...r, ...patch } : r))
    );
  }

  const pendingCount = useMemo(
    () =>
      rows?.filter((r) => r.status === "pending" || r.status === "error")
        .length ?? 0,
    [rows]
  );
  const savedCount = useMemo(
    () => rows?.filter((r) => r.status === "saved").length ?? 0,
    [rows]
  );

  function removeRow(localId: string) {
    const next = (rowsRef.current ?? []).filter((r) => r.localId !== localId);
    replaceRows(next);
    persistPending(next);
  }

  async function saveOne(row: Row) {
    if (!row.fullNumber?.trim()) {
      patchRow(row.localId, {
        status: "error",
        error: "Falta el número de factura",
      });
      return false;
    }
    patchRow(row.localId, {
      status: "saving",
      error: undefined,
      duplicateId: undefined,
    });
    const res = await createHistoricalInvoice(toInput(row));
    if (!res.ok) {
      patchRow(row.localId, {
        status: "error",
        error: res.error,
        duplicateId: res.duplicateId,
      });
      return false;
    }
    patchRow(row.localId, {
      status: "saved",
      error: undefined,
      savedId: res.id,
      fullNumber: res.fullNumber,
    });
    persistPending(rowsRef.current ?? []);
    return true;
  }

  function saveAll() {
    startTransition(async () => {
      const todo = (rowsRef.current ?? []).filter(
        (r) => r.status === "pending" || r.status === "error"
      );
      for (const row of todo) {
        const latest =
          rowsRef.current?.find((r) => r.localId === row.localId) ?? row;
        await saveOne(latest);
      }
    });
  }

  if (rows == null) {
    return (
      <p className="text-sm text-ink-muted">Cargando facturas leídas…</p>
    );
  }

  if (!rows.length) {
    return (
      <div className="card-panel space-y-3 p-6 text-sm">
        <p className="text-ink-muted">
          No hay facturas en la cola. Sube PDFs desde el listado de facturas.
        </p>
        <Link href="/invoices" className="text-accent underline">
          Ir a facturas
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {savedCount} guardadas · {pendingCount} pendientes · {rows.length} en
          total
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={pending || pendingCount === 0}
            onClick={saveAll}
          >
            {pending ? "Guardando…" : `Guardar ${pendingCount} pendientes`}
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={pending}
            onClick={() => {
              clearInvoiceDraftQueue();
              router.push("/invoices");
            }}
          >
            {savedCount > 0 ? "Volver al listado" : "Cancelar"}
          </button>
        </div>
      </div>

      <ul className="space-y-4">
        {rows.map((row, index) => {
          const lines = ensureLines(row);
          const line = lines[0];
          const locked = row.status === "saved" || row.status === "saving";

          return (
            <li
              key={row.localId}
              className={`card-panel space-y-4 p-4 sm:p-5 ${
                row.status === "saved" ? "opacity-70" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {index + 1}. {row.fileName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Confianza{" "}
                    {row.confidence === "high"
                      ? "alta"
                      : row.confidence === "low"
                        ? "baja"
                        : "media"}
                    {row.status === "saved" ? " · guardada" : null}
                    {row.savedId ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={`/invoices/${row.savedId}`}
                          className="text-accent underline"
                        >
                          abrir
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  {row.status !== "saved" ? (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-xs"
                      disabled={locked || pending}
                      onClick={() => void saveOne(row)}
                    >
                      {row.status === "saving" ? "Guardando…" : "Guardar"}
                    </button>
                  ) : null}
                  {row.status !== "saved" ? (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-xs text-danger"
                      disabled={locked || pending}
                      onClick={() => removeRow(row.localId)}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              </div>

              {row.error ? (
                <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                  {row.error}
                  {row.duplicateId ? (
                    <>
                      {" "}
                      <Link
                        href={`/invoices/${row.duplicateId}`}
                        className="font-medium underline"
                      >
                        Abrir la existente
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="label">Nº factura (original)</label>
                  <input
                    className="input font-mono"
                    value={row.fullNumber ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        fullNumber: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Serie</label>
                  <select
                    className="input"
                    value={row.seriesId}
                    disabled={locked || !series.length}
                    onChange={(e) =>
                      patchRow(row.localId, { seriesId: e.target.value })
                    }
                  >
                    {series.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.prefix} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Fecha</label>
                  <DateInput
                    className="input"
                    value={row.issueDate}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, { issueDate: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Cliente</label>
                  <input
                    className="input"
                    value={row.clientName}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, { clientName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">NIF cliente</label>
                  <input
                    className="input font-mono"
                    value={row.clientNif ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        clientNif: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label">Concepto (1ª línea)</label>
                  <input
                    className="input"
                    value={line?.description ?? ""}
                    disabled={locked}
                    onChange={(e) => {
                      const nextLines = [...ensureLines(row)];
                      nextLines[0] = {
                        ...nextLines[0],
                        description: e.target.value,
                      };
                      patchRow(row.localId, {
                        lines: nextLines,
                        description: e.target.value || null,
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="label">Base (1ª línea)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input font-mono"
                    value={line?.unitPrice ?? 0}
                    disabled={locked}
                    onChange={(e) => {
                      const unitPrice = parseFloat(e.target.value) || 0;
                      const nextLines = [...ensureLines(row)];
                      nextLines[0] = {
                        ...nextLines[0],
                        quantity: 1,
                        unitPrice,
                      };
                      patchRow(row.localId, {
                        lines: nextLines,
                        subtotal: unitPrice,
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="label">IVA %</label>
                  <select
                    className="input"
                    value={line?.vatRate ?? 21}
                    disabled={locked}
                    onChange={(e) => {
                      const vatRate = parseFloat(e.target.value) || 0;
                      const nextLines = [...ensureLines(row)];
                      nextLines[0] = { ...nextLines[0], vatRate };
                      patchRow(row.localId, { lines: nextLines });
                    }}
                  >
                    {VAT_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tipo operación</label>
                  <select
                    className="input"
                    value={row.vatOperationType}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        vatOperationType: e.target.value,
                      })
                    }
                  >
                    {VAT_OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Clave 347</label>
                  <select
                    className="input"
                    value={row.operationKey347 ?? "B"}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        operationKey347: e.target.value,
                      })
                    }
                  >
                    <option value="B">B — Ventas</option>
                    <option value="A">A — Compras</option>
                  </select>
                </div>
                <div>
                  <label className="label">IRPF %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input font-mono"
                    value={row.irpfRate}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        irpfRate: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.markAsPaid}
                  disabled={locked}
                  onChange={(e) =>
                    patchRow(row.localId, { markAsPaid: e.target.checked })
                  }
                  className="rounded border-line"
                />
                Marcar como cobrada (histórico)
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
