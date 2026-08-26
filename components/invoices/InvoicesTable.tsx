"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/calculations";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SendDocumentModal } from "@/components/documents/SendDocumentModal";
import { deleteInvoices } from "@/app/(app)/invoices/actions";
import {
  BulkDeleteConfirmModal,
  BulkSelectionBar,
} from "@/components/ui/BulkDelete";
import {
  hasVerifactuQr,
  VERIFACTU_STATUS_LABEL,
  VERIFACTU_STATUS_SHORT,
} from "@/lib/verifactu";

export type InvoiceListRow = {
  id: string;
  fullNumber: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  fiscalStatus: string;
  paymentMethod: string | null;
  notes: string | null;
  subtotal: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  total: number;
  pendingAmount: number;
  createdAt: string;
  updatedAt: string;
  primaryVatRate: number | null;
  description: string | null;
  legal: string | null;
  clientName: string;
  clientNif: string;
  /** Estado Veri*Factu para listado / acciones */
  verifactuStatus:
    | "sin_sello"
    | "sellada"
    | "pendiente_remision"
    | "remitida"
    | "rechazada"
    | "anulada";
};

type ColumnId =
  | "cliente"
  | "nif"
  | "fecha"
  | "fCreacion"
  | "ultimaModif"
  | "numero"
  | "vencimiento"
  | "total"
  | "estado"
  | "importePendiente"
  | "descripcion"
  | "baseImponible"
  | "pctIva"
  | "cuotaIva"
  | "cuotaRe"
  | "pctRetencion"
  | "cuotaRetencion"
  | "formaCobro"
  | "observaciones"
  | "legal";

type ColumnDef = {
  id: ColumnId;
  label: string;
  locked?: boolean;
  align?: "left" | "right";
};

const COLUMNS: ColumnDef[] = [
  { id: "cliente", label: "Cliente", locked: true },
  { id: "nif", label: "NIF / CIF" },
  { id: "fecha", label: "Fecha", locked: true },
  { id: "fCreacion", label: "F. creación" },
  { id: "ultimaModif", label: "Última modif." },
  { id: "numero", label: "Número" },
  { id: "vencimiento", label: "Vencimiento" },
  { id: "total", label: "Total (€)", locked: true, align: "right" },
  { id: "estado", label: "Estado" },
  { id: "importePendiente", label: "Importe pendiente (€)", align: "right" },
  { id: "descripcion", label: "Descripción" },
  { id: "baseImponible", label: "Base imponible", align: "right" },
  { id: "pctIva", label: "% IVA", align: "right" },
  { id: "cuotaIva", label: "Cuota IVA", align: "right" },
  { id: "cuotaRe", label: "Cuota R.E.", align: "right" },
  { id: "pctRetencion", label: "% Retención", align: "right" },
  { id: "cuotaRetencion", label: "Cuota retención", align: "right" },
  { id: "formaCobro", label: "Forma de cobro" },
  { id: "observaciones", label: "Observaciones" },
  { id: "legal", label: "Legal" },
];

const DEFAULT_VISIBLE: ColumnId[] = [
  "cliente",
  "fecha",
  "numero",
  "vencimiento",
  "estado",
  "total",
];

const STORAGE_KEY = "invoices-list-columns-v1";

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

function cellValue(inv: InvoiceListRow, id: ColumnId): ReactNode {
  switch (id) {
    case "cliente":
      return inv.clientName;
    case "nif":
      return <span className="font-mono text-xs">{inv.clientNif}</span>;
    case "fecha":
      return formatDate(inv.issueDate);
    case "fCreacion":
      return formatDate(inv.createdAt);
    case "ultimaModif":
      return formatDate(inv.updatedAt);
    case "numero":
      return <span className="font-mono">{inv.fullNumber}</span>;
    case "vencimiento":
      return formatDate(inv.dueDate);
    case "total":
      return formatCurrency(inv.total);
    case "estado":
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge status={inv.status} />
          {inv.fiscalStatus === "DRAFT" ? (
            <span className="badge bg-line/40 text-ink-muted">Borrador</span>
          ) : null}
        </span>
      );
    case "importePendiente":
      return formatCurrency(inv.pendingAmount);
    case "descripcion":
      return (
        <span className="line-clamp-2 max-w-[14rem] text-ink-muted">
          {inv.description || "—"}
        </span>
      );
    case "baseImponible":
      return formatCurrency(inv.subtotal);
    case "pctIva":
      return inv.primaryVatRate != null ? `${inv.primaryVatRate}%` : "—";
    case "cuotaIva":
      return formatCurrency(inv.vatAmount);
    case "cuotaRe":
      return "—";
    case "pctRetencion":
      return inv.irpfRate ? `${inv.irpfRate}%` : "—";
    case "cuotaRetencion":
      return inv.irpfAmount
        ? formatCurrency(inv.irpfAmount)
        : "—";
    case "formaCobro":
      return inv.paymentMethod || "—";
    case "observaciones":
      return (
        <span className="line-clamp-2 max-w-[14rem] text-ink-muted">
          {inv.notes || "—"}
        </span>
      );
    case "legal":
      return inv.legal || "—";
    default:
      return null;
  }
}

export function InvoicesTable({ invoices }: { invoices: InvoiceListRow[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState<ColumnId[]>(DEFAULT_VISIBLE);
  const [colsOpen, setColsOpen] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setVisible(loadVisible());
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function onDocPointer(e: Event) {
      const t = e.target as Node;
      if (colsRef.current && !colsRef.current.contains(t)) setColsOpen(false);
      if (
        menuRef.current &&
        !menuRef.current.contains(t) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(t)
      ) {
        setMenuId(null);
        setMenuPos(null);
      }
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, []);

  useEffect(() => {
    if (!menuId || isMobile) return;
    function close() {
      setMenuId(null);
      setMenuPos(null);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuId, isMobile]);

  useEffect(() => {
    if (!menuId || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuId, isMobile]);

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
    invoices.length > 0 && invoices.every((i) => selectedIds.has(i.id));

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
      if (invoices.every((i) => prev.has(i.id))) return new Set();
      return new Set(invoices.map((i) => i.id));
    });
  }

  const menuInv = menuId
    ? invoices.find((i) => i.id === menuId) ?? null
    : null;

  function closeMenu() {
    setMenuId(null);
    setMenuPos(null);
    menuBtnRef.current = null;
  }

  function openRowMenu(id: string, btn: HTMLButtonElement) {
    if (menuId === id) {
      closeMenu();
      return;
    }
    menuBtnRef.current = btn;
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMenuPos({ top: 0, left: 0 });
      setMenuId(id);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const menuWidth = 176;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8
    );
    setMenuPos({ top: rect.bottom + 4, left });
    setMenuId(id);
  }

  function MenuItems({
    inv,
    itemClass,
  }: {
    inv: InvoiceListRow;
    itemClass: string;
  }) {
    return (
      <>
        {inv.status !== "ANULADA" ? (
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              closeMenu();
              setSendId(inv.id);
            }}
          >
            Enviar
          </button>
        ) : null}
        <Link
          href={`/invoices/${inv.id}`}
          className={itemClass}
          onClick={closeMenu}
        >
          Ver
        </Link>
        {inv.status !== "ANULADA" ? (
          <Link
            href={`/invoices/${inv.id}/edit`}
            className={itemClass}
            onClick={closeMenu}
          >
            Editar
          </Link>
        ) : null}
        <a
          href={`/api/invoices/${inv.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className={itemClass}
          onClick={closeMenu}
        >
          PDF
        </a>
        <a
          href={`/api/invoices/${inv.id}/pdf?download=1`}
          className={itemClass}
          onClick={closeMenu}
        >
          Descargar
        </a>
        {hasVerifactuQr(inv.verifactuStatus) ? (
          <a
            href={`/api/invoices/${inv.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={`${itemClass} text-accent`}
            onClick={closeMenu}
          >
            Veri*Factu · PDF con QR
          </a>
        ) : inv.verifactuStatus !== "anulada" ? (
          <Link
            href={`/invoices/${inv.id}`}
            className={`${itemClass} text-ink-muted`}
            onClick={closeMenu}
          >
            Veri*Factu · sin QR
          </Link>
        ) : (
          <span className={`${itemClass} cursor-default text-ink-muted`}>
            Veri*Factu · anulada
          </span>
        )}
      </>
    );
  }

  return (
    <div className="card-panel overflow-visible">
      <SendDocumentModal
        kind="invoice"
        id={sendId ?? ""}
        open={Boolean(sendId)}
        onClose={() => setSendId(null)}
        onSent={() => router.refresh()}
      />
      <BulkDeleteConfirmModal
        count={selectedIds.size}
        entityLabel={selectedIds.size === 1 ? "factura" : "facturas"}
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        description="Solo se pueden eliminar borradores. Si alguna factura está emitida, la operación se cancela entera."
        onConfirm={async () => {
          try {
            await deleteInvoices([...selectedIds]);
            setSelectedIds(new Set());
            router.refresh();
          } catch (err) {
            alert(
              err instanceof Error
                ? err.message
                : "No se pudieron eliminar las facturas"
            );
            throw err;
          }
        }}
      />
      <BulkSelectionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDelete={() => setBulkDeleteOpen(true)}
      />
      {mounted &&
        menuInv &&
        menuPos &&
        createPortal(
          isMobile ? (
            <div className="fixed inset-0 z-[100] flex flex-col justify-end">
              <button
                type="button"
                className="absolute inset-0 bg-ink/40"
                aria-label="Cerrar"
                onClick={closeMenu}
              />
              <div
                ref={menuRef}
                className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl border border-line bg-bg-elevated pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-xl"
                role="menu"
              >
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
                <p className="px-4 pb-2 font-mono text-xs text-ink-muted">
                  {menuInv.fullNumber}
                </p>
                <MenuItems
                  inv={menuInv}
                  itemClass="block w-full px-4 py-3.5 text-left text-base hover:bg-accent-soft"
                />
              </div>
            </div>
          ) : (
            <div
              ref={menuRef}
              className="fixed z-[100] w-44 rounded-md border border-line bg-bg-elevated py-1 text-left shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left }}
              role="menu"
            >
              <MenuItems
                inv={menuInv}
                itemClass="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
              />
            </div>
          ),
          document.body
        )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="align-middle"
                  checked={allSelected}
                  disabled={invoices.length === 0}
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
              <th className="sticky right-0 z-10 w-16 bg-line/20 px-2 py-3 text-right font-medium sm:w-44 sm:px-4 sm:bg-transparent">
                <span className="sr-only sm:not-sr-only">Acciones</span>
                <div className="relative ml-2 hidden sm:inline-block" ref={colsRef}>
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
                    <div className="absolute right-0 z-30 mt-1 w-80 rounded-md border border-line bg-bg-elevated p-3 text-left shadow-lg normal-case tracking-normal">
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
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={activeCols.length + 2}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  No hay facturas.{" "}
                  <Link href="/invoices/new" className="text-accent underline">
                    Emitir una
                  </Link>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={`group cursor-pointer border-b border-line/60 hover:bg-accent-soft/40 ${
                    selectedIds.has(inv.id) ? "bg-accent-soft/30" : ""
                  }`}
                  onClick={() => router.push(`/invoices/${inv.id}`)}
                >
                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="align-middle"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleSelected(inv.id)}
                      aria-label={`Seleccionar ${inv.fullNumber}`}
                    />
                  </td>
                  {activeCols.map((c) => (
                    <td
                      key={c.id}
                      className={`px-4 py-3 ${
                        c.align === "right" ? "text-right font-mono" : ""
                      } ${
                        c.id === "fecha" ||
                        c.id === "fCreacion" ||
                        c.id === "ultimaModif" ||
                        c.id === "vencimiento"
                          ? "text-ink-muted"
                          : ""
                      }`}
                    >
                      {cellValue(inv, c.id)}
                    </td>
                  ))}
                  <td
                    className="sticky right-0 z-10 bg-bg-elevated px-2 py-3 text-right group-hover:bg-accent-soft/40 sm:static sm:bg-transparent sm:px-4 sm:group-hover:bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      {hasVerifactuQr(inv.verifactuStatus) ? (
                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost hidden px-2 py-1 text-xs text-accent sm:inline-flex"
                          title={VERIFACTU_STATUS_LABEL[inv.verifactuStatus]}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {VERIFACTU_STATUS_SHORT[inv.verifactuStatus]}
                        </a>
                      ) : inv.verifactuStatus !== "anulada" ? (
                        <span
                          className="hidden px-2 py-1 text-xs text-ink-muted sm:inline-flex"
                          title="Sin sello Veri*Factu / sin QR en PDF"
                        >
                          Sin QR
                        </span>
                      ) : null}
                      {inv.status !== "ANULADA" ? (
                        <button
                          type="button"
                          className="btn-secondary hidden px-2 py-1 text-xs sm:inline-flex"
                          onClick={() => setSendId(inv.id)}
                        >
                          Enviar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-10 w-10 items-center justify-center px-0 text-base leading-none sm:h-auto sm:w-auto sm:px-2 sm:py-1"
                        aria-label="Más acciones"
                        aria-expanded={menuId === inv.id}
                        onClick={(e) => openRowMenu(inv.id, e.currentTarget)}
                      >
                        ···
                      </button>
                    </div>
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
