"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/calculations";
import {
  deleteMarketplaceIncome,
  deleteMarketplaceIncomes,
  convertMarketplaceIncomeToInvoice,
} from "@/app/(app)/fiscal/income/actions";
import { canConvertMarketplaceIncome } from "@/lib/marketplace-invoice";
import {
  BulkDeleteConfirmModal,
  BulkSelectionBar,
} from "@/components/ui/BulkDelete";

const VAT_LABEL: Record<string, string> = {
  TAXABLE: "Con IVA",
  EXEMPT: "Sin IVA",
  MARKETPLACE_COLLECTED: "OSS marketplace",
};

const CHANNEL_LABEL: Record<string, string> = {
  AMAZON: "Amazon",
  SHOPIFY: "Shopify",
};

export type MarketplaceIncomeListRow = {
  id: string;
  issueDate: string;
  channel: string;
  transactionType: string;
  externalRef: string | null;
  sku: string | null;
  vatStatus: string;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  invoiceId: string | null;
  invoiceFullNumber: string | null;
};

type Props = {
  rows: MarketplaceIncomeListRow[];
  emptyHint?: string;
};

export function MarketplaceIncomeTable({ rows, emptyHint }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
        entityLabel={
          selectedIds.size === 1 ? "ingreso marketplace" : "ingresos marketplace"
        }
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          await deleteMarketplaceIncomes([...selectedIds]);
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
        <table className="w-full min-w-[44rem] text-left text-sm">
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
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Canal</th>
              <th className="px-4 py-3 font-medium">Ref.</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                IVA
              </th>
              <th className="px-4 py-3 text-right font-medium">Base</th>
              <th className="px-4 py-3 text-right font-medium">Cuota</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                Factura
              </th>
              <th className="sticky right-0 z-10 bg-line/20 px-2 py-3 text-right font-medium sm:static sm:bg-transparent sm:px-4">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  {emptyHint ?? "No hay ingresos con estos filtros."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const convertCheck = canConvertMarketplaceIncome({
                  invoiceId: r.invoiceId,
                  subtotal: r.subtotal,
                  transactionType: r.transactionType,
                });
                return (
                <tr
                  key={r.id}
                  className={`group border-b border-line/50 ${
                    selectedIds.has(r.id) ? "bg-accent-soft/30" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="align-middle"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      aria-label={`Seleccionar ${r.externalRef ?? r.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatDate(r.issueDate)}
                  </td>
                  <td className="px-4 py-3">
                    {CHANNEL_LABEL[r.channel] ?? r.channel}
                    <p className="text-xs text-ink-muted">
                      {r.transactionType}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">
                      {r.externalRef ?? "—"}
                    </span>
                    {r.sku ? (
                      <p className="text-xs text-ink-muted">{r.sku}</p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
                    {VAT_LABEL[r.vatStatus] ?? r.vatStatus}
                    {r.vatStatus === "TAXABLE" ? ` ${r.vatRate}%` : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCurrency(r.subtotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCurrency(r.vatAmount)}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {r.invoiceId && r.invoiceFullNumber ? (
                      <Link
                        href={`/invoices/${r.invoiceId}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {r.invoiceFullNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="sticky right-0 z-10 bg-bg-elevated px-2 py-3 group-hover:bg-accent-soft/20 sm:static sm:bg-transparent sm:px-4">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {convertCheck.ok ? (
                        <form
                          action={convertMarketplaceIncomeToInvoice.bind(null, r.id)}
                        >
                          <button
                            type="submit"
                            className="btn-ghost px-2 py-1 text-xs text-accent"
                          >
                            → Factura
                          </button>
                        </form>
                      ) : null}
                      <Link
                        href={`/fiscal/income/${r.id}/edit`}
                        className="btn-ghost px-2 py-1 text-xs"
                      >
                        Editar
                      </Link>
                      {!r.invoiceId ? (
                      <form action={deleteMarketplaceIncome.bind(null, r.id)}>
                        <button
                          type="submit"
                          className="btn-ghost px-2 py-1 text-xs text-danger"
                        >
                          Borrar
                        </button>
                      </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
