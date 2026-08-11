"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { deleteRecurrings } from "@/app/(app)/recurring/actions";
import {
  BulkDeleteConfirmModal,
  BulkSelectionBar,
} from "@/components/ui/BulkDelete";

export type RecurringListRow = {
  id: string;
  name: string;
  clientName: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  status: string;
  total: number;
};

type ColumnId =
  | "nombre"
  | "cliente"
  | "inicio"
  | "fin"
  | "frecuencia"
  | "proxima"
  | "estado"
  | "total";

type ColumnDef = {
  id: ColumnId;
  label: string;
  locked?: boolean;
  align?: "left" | "right";
};

const COLUMNS: ColumnDef[] = [
  { id: "nombre", label: "Nombre", locked: true },
  { id: "cliente", label: "Cliente" },
  { id: "inicio", label: "Inicio" },
  { id: "fin", label: "Fin" },
  { id: "frecuencia", label: "Frecuencia" },
  { id: "proxima", label: "Próxima" },
  { id: "estado", label: "Estado" },
  { id: "total", label: "Total (€)", align: "right" },
];

const DEFAULT_VISIBLE: ColumnId[] = [
  "nombre",
  "cliente",
  "frecuencia",
  "proxima",
  "estado",
  "total",
];

const STORAGE_KEY = "recurring-list-columns-v1";

function loadVisible(): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw) as ColumnId[];
    const locked = COLUMNS.filter((c) => c.locked).map((c) => c.id);
    const allowed = new Set(COLUMNS.map((c) => c.id));
    const next = [
      ...locked,
      ...parsed.filter((id) => allowed.has(id) && !locked.includes(id)),
    ];
    return next.length ? next : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

function cellValue(row: RecurringListRow, id: ColumnId): ReactNode {
  switch (id) {
    case "nombre":
      return row.name;
    case "cliente":
      return row.clientName;
    case "inicio":
      return formatDate(row.startDate);
    case "fin":
      return formatDate(row.endDate);
    case "frecuencia":
      return <StatusBadge status={row.frequency} />;
    case "proxima":
      return formatDate(row.nextRunDate);
    case "estado":
      return <StatusBadge status={row.status} />;
    case "total":
      return formatCurrency(row.total);
    default:
      return null;
  }
}

export function RecurringTable({ rows }: { rows: RecurringListRow[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState<ColumnId[]>(DEFAULT_VISIBLE);
  const [colsOpen, setColsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(loadVisible());
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (colsRef.current && !colsRef.current.contains(t)) setColsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function toggleColumn(id: ColumnId) {
    const def = COLUMNS.find((c) => c.id === id);
    if (!def || def.locked) return;
    setVisible((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const activeCols = useMemo(
    () => COLUMNS.filter((c) => visible.includes(c.id)),
    [visible]
  );

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  return (
    <div className="card-panel overflow-visible">
      <BulkDeleteConfirmModal
        count={selectedIds.size}
        entityLabel={selectedIds.size === 1 ? "periódica" : "periódicas"}
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        description="Las facturas ya generadas se conservan."
        onConfirm={async () => {
          await deleteRecurrings([...selectedIds]);
          setSelectedIds(new Set());
          router.refresh();
        }}
      />
      <BulkSelectionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={() => setBulkDeleteOpen(true)}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="align-middle"
                  checked={allSelected}
                  disabled={rows.length === 0}
                  onChange={toggleSelectAll}
                  aria-label="Seleccionar todas"
                />
              </th>
              {activeCols.map((c) => (
                <th
                  key={c.id}
                  className={`px-4 py-3 font-medium ${
                    c.align === "right" ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
              <th className="sticky right-0 z-10 w-14 bg-line/20 px-2 py-3 text-right font-medium sm:static sm:w-24 sm:bg-transparent sm:px-4">
                <span className="sr-only sm:not-sr-only"> </span>
                <div className="relative inline-block" ref={colsRef}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-line bg-bg-elevated px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-ink-muted hover:bg-line/40"
                    onClick={() => setColsOpen((o) => !o)}
                    aria-label="Columnas visibles"
                    title="Columnas"
                  >
                    ⚙
                    <span aria-hidden>▾</span>
                  </button>
                  {colsOpen ? (
                    <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-line bg-bg-elevated p-3 text-left shadow-lg normal-case tracking-normal">
                      <p className="mb-2 text-xs font-medium text-ink">
                        Selecciona las columnas que deseas ver en el listado:
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-ink">
                        {COLUMNS.map((c) => (
                          <label
                            key={c.id}
                            className={`flex items-center gap-2 ${
                              c.locked ? "opacity-60" : "cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={visible.includes(c.id)}
                              disabled={c.locked}
                              onChange={() => toggleColumn(c.id)}
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={activeCols.length + 2}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  Sin periódicas.{" "}
                  <Link href="/recurring/new" className="text-accent underline">
                    Crear una
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`group cursor-pointer border-b border-line/60 hover:bg-accent-soft/40 ${
                    selectedIds.has(row.id) ? "bg-accent-soft/30" : ""
                  }`}
                  onClick={() => router.push(`/recurring/${row.id}`)}
                >
                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="align-middle"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      aria-label={`Seleccionar ${row.name}`}
                    />
                  </td>
                  {activeCols.map((c) => (
                    <td
                      key={c.id}
                      className={`px-4 py-3 ${
                        c.align === "right" ? "text-right font-mono" : ""
                      } ${
                        c.id === "inicio" ||
                        c.id === "fin" ||
                        c.id === "proxima"
                          ? "text-ink-muted"
                          : ""
                      }`}
                    >
                      {cellValue(row, c.id)}
                    </td>
                  ))}
                  <td
                    className="sticky right-0 z-10 bg-bg-elevated px-2 py-3 text-right group-hover:bg-accent-soft/40 sm:static sm:bg-transparent sm:px-4 sm:group-hover:bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link
                      href={`/recurring/${row.id}`}
                      className="btn-ghost inline-flex h-10 items-center px-2 text-xs sm:h-auto sm:py-1"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
