"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/calculations";
import {
  upsertFiscalFiling,
  type FilingDraftInput,
} from "@/app/(app)/fiscal/filings/actions";
import {
  clearFilingDraftQueue,
  peekFilingDraftQueue,
  saveFilingDraftQueue,
  type FilingQueueItem,
} from "@/lib/filing-draft-storage";
import type {
  FiscalModelType,
  FilingBox,
} from "@/lib/gemini-fiscal-filing";
import {
  fiscalFilingPeriodKey,
  isAnnualOrCensusModel,
  FISCAL_MODEL_TYPES,
} from "@/lib/gemini-fiscal-filing";

type RowStatus = "pending" | "saving" | "saved" | "error";

type Row = FilingQueueItem & {
  status: RowStatus;
  error?: string;
};

function toQueueItem(row: Row): FilingQueueItem {
  const {
    status: _s,
    error: _e,
    ...rest
  } = row;
  void _s;
  void _e;
  return rest;
}

function persistPending(rows: Row[]) {
  saveFilingDraftQueue(
    rows.filter((r) => r.status !== "saved").map(toQueueItem)
  );
}

function toInput(row: Row): FilingDraftInput {
  return {
    modelType: row.modelType,
    year: row.year,
    quarter: isAnnualOrCensusModel(row.modelType) ? null : row.quarter,
    filedAt: row.filedAt,
    result: row.result,
    incomeBase: row.incomeBase,
    expensesBase: row.expensesBase,
    vatRepercutida: row.vatRepercutida,
    vatDeductible: row.vatDeductible,
    boxes: row.boxes,
    notes: row.notes,
    confidence: row.confidence,
    sourceFileName: row.fileName,
    rawExtract: row.rawExtract,
  };
}

export function FilingBatchReview() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const rowsRef = useRef<Row[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const items = peekFilingDraftQueue();
    const initial = items.map((item) => ({
      ...item,
      incomeBase: item.incomeBase ?? null,
      expensesBase: item.expensesBase ?? null,
      vatRepercutida: item.vatRepercutida ?? null,
      vatDeductible: item.vatDeductible ?? null,
      status: "pending" as const,
    }));
    setRows(initial);
    rowsRef.current = initial;
  }, []);

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
    patchRow(row.localId, { status: "saving", error: undefined });
    const res = await upsertFiscalFiling(toInput(row));
    if (!res.ok) {
      patchRow(row.localId, { status: "error", error: res.error });
      return false;
    }
    patchRow(row.localId, { status: "saved", error: undefined });
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

  function updateBox(localId: string, index: number, patch: Partial<FilingBox>) {
    const row = rowsRef.current?.find((r) => r.localId === localId);
    if (!row) return;
    const boxes = row.boxes.map((b, i) =>
      i === index ? { ...b, ...patch } : b
    );
    patchRow(localId, { boxes });
  }

  if (rows == null) {
    return <p className="text-sm text-ink-muted">Cargando modelos leídos…</p>;
  }

  if (!rows.length) {
    return (
      <div className="card-panel space-y-3 p-6 text-sm">
        <p className="text-ink-muted">
          No hay modelos en la cola. Sube PDF o imágenes desde Presentados.
        </p>
        <Link href="/fiscal/filings" className="text-accent underline">
          Ir a presentados
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {savedCount} guardados · {pendingCount} pendientes · {rows.length} en
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
              clearFilingDraftQueue();
              router.push("/fiscal/filings");
            }}
          >
            {savedCount > 0 ? "Volver al listado" : "Cancelar"}
          </button>
        </div>
      </div>

      <ul className="space-y-4">
        {rows.map((row, index) => {
          const locked = row.status === "saved" || row.status === "saving";
          const key = fiscalFilingPeriodKey(
            row.modelType,
            row.year,
            row.modelType === "390" ? null : row.quarter
          );

          return (
            <li
              key={row.localId}
              className={`card-panel space-y-4 p-4 sm:p-5 ${
                row.status === "saved" ? "opacity-70" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {index + 1}. {row.fileName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Clave {key} · confianza{" "}
                    {row.confidence === "high"
                      ? "alta"
                      : row.confidence === "low"
                        ? "baja"
                        : "media"}
                    {row.status === "saved" ? " · guardado" : null}
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
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="label">Modelo</label>
                  <select
                    className="input"
                    value={row.modelType}
                    disabled={locked}
                    onChange={(e) => {
                      const modelType = e.target.value as FiscalModelType;
                      patchRow(row.localId, {
                        modelType,
                        quarter: isAnnualOrCensusModel(modelType)
                          ? null
                          : row.quarter ?? 1,
                      });
                    }}
                  >
                    {FISCAL_MODEL_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Año (ejercicio)</label>
                  <input
                    type="number"
                    className="input font-mono"
                    value={row.year}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        year: parseInt(e.target.value, 10) || row.year,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Trimestre</label>
                  <select
                    className="input"
                    value={row.quarter ?? ""}
                    disabled={locked || isAnnualOrCensusModel(row.modelType)}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      patchRow(row.localId, {
                        quarter:
                          v === 1 || v === 2 || v === 3 || v === 4 ? v : null,
                      });
                    }}
                  >
                    {isAnnualOrCensusModel(row.modelType) ? (
                      <option value="">— (anual/censo)</option>
                    ) : (
                      <>
                        <option value="1">1T</option>
                        <option value="2">2T</option>
                        <option value="3">3T</option>
                        <option value="4">4T</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">Fecha presentación</label>
                  <input
                    type="date"
                    className="input"
                    value={row.filedAt ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        filedAt: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="label">Resultado (a ingresar)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input font-mono"
                    value={row.result}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        result: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatCurrency(row.result)}
                  </p>
                </div>
                <div>
                  <label className="label">Ingresos (base)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input font-mono"
                    value={row.incomeBase ?? ""}
                    disabled={locked}
                    placeholder="—"
                    onChange={(e) =>
                      patchRow(row.localId, {
                        incomeBase:
                          e.target.value === ""
                            ? null
                            : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Gastos (base)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input font-mono"
                    value={row.expensesBase ?? ""}
                    disabled={locked}
                    placeholder="—"
                    onChange={(e) =>
                      patchRow(row.localId, {
                        expensesBase:
                          e.target.value === ""
                            ? null
                            : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">IVA repercutido</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input font-mono"
                    value={row.vatRepercutida ?? ""}
                    disabled={locked}
                    placeholder="—"
                    onChange={(e) =>
                      patchRow(row.localId, {
                        vatRepercutida:
                          e.target.value === ""
                            ? null
                            : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">IVA soportado</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input font-mono"
                    value={row.vatDeductible ?? ""}
                    disabled={locked}
                    placeholder="—"
                    onChange={(e) =>
                      patchRow(row.localId, {
                        vatDeductible:
                          e.target.value === ""
                            ? null
                            : parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Casilla</th>
                      <th className="px-2 py-1 text-left">Concepto</th>
                      <th className="px-2 py-1 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.boxes.map((b, i) => (
                      <tr key={`${b.code}-${i}`} className="border-b border-line/40">
                        <td className="px-2 py-1">
                          <input
                            className="input font-mono py-1 text-xs"
                            value={b.code}
                            disabled={locked}
                            onChange={(e) =>
                              updateBox(row.localId, i, {
                                code: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className="input py-1 text-xs"
                            value={b.label}
                            disabled={locked}
                            onChange={(e) =>
                              updateBox(row.localId, i, {
                                label: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            step="0.01"
                            className="input font-mono py-1 text-right text-xs"
                            value={b.value}
                            disabled={locked}
                            onChange={(e) =>
                              updateBox(row.localId, i, {
                                value: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="label">Notas</label>
                <textarea
                  className="input min-h-16"
                  value={row.notes ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    patchRow(row.localId, {
                      notes: e.target.value || null,
                    })
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
