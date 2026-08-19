"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VAT_RATES } from "@/lib/calculations";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_VAT_OPERATION_TYPES,
  isExpenseIntracom,
  isExpenseReverseCharge,
  parseExpenseVatOperationType,
} from "@/lib/fiscal";
import { DateInput } from "@/components/ui/DateInput";
import {
  createExpenseFromDraft,
  type ExpenseDraftInput,
} from "@/app/(app)/fiscal/expenses/actions";
import {
  clearExpenseDraftQueue,
  peekExpenseDraftQueue,
  saveExpenseDraftQueue,
  type ExpenseQueueItem,
} from "@/lib/expense-draft-storage";
import { ActivityFitAlert } from "@/components/fiscal/ActivityFitAlert";
import type { ActivityFit } from "@/lib/gemini-expense";

type RowStatus = "pending" | "saving" | "saved" | "error";

type Row = ExpenseQueueItem & {
  status: RowStatus;
  error?: string;
  duplicateId?: string;
  deductible: boolean;
  isInvestment: boolean;
  usefulLifeYears: number;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toQueueItem(row: Row): ExpenseQueueItem {
  return {
    localId: row.localId,
    fileName: row.fileName,
    issueDate: row.issueDate,
    supplierName: row.supplierName,
    supplierNif: row.supplierNif,
    invoiceNumber: row.invoiceNumber,
    description: row.description,
    category: row.category,
    vatOperationType: row.vatOperationType ?? "INTERIOR",
    subtotal: row.subtotal,
    vatRate: row.vatRate,
    vatAmount: row.vatAmount,
    total: row.total,
    notes: row.notes,
    confidence: row.confidence,
    activityFit: row.activityFit ?? "ok",
    activityFitReason: row.activityFitReason ?? null,
    homeOfficeTip: row.homeOfficeTip ?? null,
    documentId: row.documentId ?? null,
  };
}

function persistPending(rows: Row[]) {
  saveExpenseDraftQueue(
    rows.filter((r) => r.status !== "saved").map(toQueueItem)
  );
}

function toInput(row: Row): ExpenseDraftInput {
  const vatOperationType = parseExpenseVatOperationType(row.vatOperationType);
  const vatAmount = round2(row.subtotal * (row.vatRate / 100));
  return {
    issueDate: row.issueDate,
    supplierName: row.supplierName,
    supplierNif: row.supplierNif,
    invoiceNumber: row.invoiceNumber,
    description: row.description,
    category: row.category,
    vatOperationType,
    subtotal: row.subtotal,
    vatRate: row.vatRate,
    vatAmount,
    total: isExpenseReverseCharge(vatOperationType)
      ? round2(row.subtotal)
      : round2(row.subtotal + vatAmount),
    deductible: row.deductible,
    isInvestment: row.isInvestment,
    usefulLifeYears: row.usefulLifeYears,
    notes: row.notes,
    documentId: row.documentId ?? null,
  };
}

export function ExpenseBatchReview() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const rowsRef = useRef<Row[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const items = peekExpenseDraftQueue();
    const initial = items.map((item) => {
      const fit = (item.activityFit ?? "ok") as ActivityFit;
      return {
        ...item,
        vatOperationType: item.vatOperationType ?? "INTERIOR",
        activityFit: fit,
        activityFitReason: item.activityFitReason ?? null,
        homeOfficeTip: item.homeOfficeTip ?? null,
        deductible: fit !== "suspicious",
        isInvestment: false,
        usefulLifeYears: 4,
        status: "pending" as const,
      };
    });
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
    patchRow(row.localId, {
      status: "saving",
      error: undefined,
      duplicateId: undefined,
    });
    const res = await createExpenseFromDraft(toInput(row));
    if (!res.ok) {
      patchRow(row.localId, {
        status: "error",
        error: res.error,
        duplicateId: res.duplicateId,
      });
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

  if (rows == null) {
    return (
      <p className="text-sm text-ink-muted">Cargando facturas leídas…</p>
    );
  }

  if (!rows.length) {
    return (
      <div className="card-panel space-y-3 p-6 text-sm">
        <p className="text-ink-muted">
          No hay facturas en la cola. Sube varias desde la lista de gastos.
        </p>
        <Link href="/fiscal/expenses" className="text-accent underline">
          Ir a gastos
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
              clearExpenseDraftQueue();
              router.push("/fiscal/expenses");
            }}
          >
            {savedCount > 0 ? "Volver al listado" : "Cancelar"}
          </button>
        </div>
      </div>

      <ul className="space-y-4">
        {rows.map((row, index) => {
          const vatAmount = round2(row.subtotal * (row.vatRate / 100));
          const reverseCharge = isExpenseReverseCharge(row.vatOperationType);
          const intracom = isExpenseIntracom(row.vatOperationType);
          const total = reverseCharge
            ? round2(row.subtotal)
            : round2(row.subtotal + vatAmount);
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
                        href={`/fiscal/expenses/${row.duplicateId}/edit`}
                        className="font-medium underline"
                      >
                        Abrir el existente
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}

              <ActivityFitAlert
                activityFit={row.activityFit ?? "ok"}
                activityFitReason={row.activityFitReason}
                homeOfficeTip={row.homeOfficeTip}
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <div>
                  <label className="label">Categoría</label>
                  <select
                    className="input"
                    value={row.category}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, { category: e.target.value })
                    }
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Nº factura</label>
                  <input
                    className="input font-mono"
                    value={row.invoiceNumber ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        invoiceNumber: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Proveedor</label>
                  <input
                    className="input"
                    value={row.supplierName}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, { supplierName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">
                    NIF{intracom ? " / NIF-IVA *" : ""}
                  </label>
                  <input
                    className="input font-mono"
                    value={row.supplierNif ?? ""}
                    disabled={locked}
                    required={intracom}
                    placeholder={intracom ? "Ej. DE123456789" : undefined}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        supplierNif: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label">Concepto</label>
                  <input
                    className="input"
                    value={row.description ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        description: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label">Tipo operación</label>
                  <select
                    className="input"
                    value={row.vatOperationType ?? "INTERIOR"}
                    disabled={locked}
                    onChange={(e) => {
                      const next = parseExpenseVatOperationType(e.target.value);
                      patchRow(row.localId, {
                        vatOperationType: next,
                        vatRate:
                          isExpenseReverseCharge(next) && row.vatRate === 0
                            ? 21
                            : row.vatRate,
                      });
                    }}
                  >
                    {EXPENSE_VAT_OPERATION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Base</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input font-mono"
                    value={row.subtotal}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        subtotal: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">
                    {reverseCharge ? "Tipo IVA español" : "IVA %"}
                  </label>
                  <select
                    className="input"
                    value={reverseCharge && row.vatRate <= 0 ? 21 : row.vatRate}
                    disabled={locked}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        vatRate: parseFloat(e.target.value) || 0,
                      })
                    }
                  >
                    {(reverseCharge ? VAT_RATES.filter((r) => r > 0) : VAT_RATES).map(
                      (r) => (
                        <option key={r} value={r}>
                          {r}%
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">Total</label>
                  <input
                    className="input font-mono"
                    value={total}
                    readOnly
                    disabled
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.deductible}
                  disabled={locked}
                  onChange={(e) =>
                    patchRow(row.localId, { deductible: e.target.checked })
                  }
                  className="rounded border-line"
                />
                Deducible IRPF e IVA
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.isInvestment}
                  disabled={locked}
                  onChange={(e) =>
                    patchRow(row.localId, { isInvestment: e.target.checked })
                  }
                  className="rounded border-line"
                />
                Bien de inversión
                <span className="block text-xs text-ink-muted">
                  El 130 amortiza; no descuenta la compra entera.
                </span>
              </label>
              {row.isInvestment ? (
                <div className="max-w-[8rem]">
                  <label className="label">Años vida útil</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    className="input"
                    disabled={locked}
                    value={row.usefulLifeYears}
                    onChange={(e) =>
                      patchRow(row.localId, {
                        usefulLifeYears: parseInt(e.target.value, 10) || 4,
                      })
                    }
                  />
                </div>
              ) : null}
              {!row.deductible && !reverseCharge ? (
                <p className="text-xs text-amber-800">
                  Sin marcar: no entra en el 130 ni como IVA soportado del 303.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
