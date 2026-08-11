"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/calculations";
import { DateInput } from "@/components/ui/DateInput";
import {
  checkMarketplaceIncomeDuplicates,
  importMarketplaceIncomeRows,
} from "@/app/(app)/fiscal/income/actions";
import { shopifyExternalKey } from "@/lib/shopify-sales-report";
import {
  clearMarketplaceIncomeQueue,
  peekMarketplaceIncomeQueue,
  saveMarketplaceIncomeQueue,
  type MarketplaceIncomeQueueItem,
} from "@/lib/marketplace-income-storage";

const VAT_LABEL: Record<string, string> = {
  TAXABLE: "Con IVA",
  EXEMPT: "Sin IVA",
  MARKETPLACE_COLLECTED: "IVA marketplace (OSS)",
};

type DupInfo = {
  id: string;
  externalRef: string | null;
  issueDate: string;
};

function rebuildShopifyKey(row: MarketplaceIncomeQueueItem, issueDate: string) {
  const parts = row.externalKey.split("|");
  const net = parts[3] != null ? Number(parts[3]) : row.subtotal;
  const taxes = parts[4] != null ? Number(parts[4]) : row.vatAmount;
  const orders = parts[5] != null ? Number(parts[5]) : 0;
  return shopifyExternalKey({
    country: row.shipToCountry || parts[1] || "UNKNOWN",
    issueDate,
    netSales: Number.isFinite(net) ? net : row.subtotal,
    taxes: Number.isFinite(taxes) ? taxes : row.vatAmount,
    orders: Number.isFinite(orders) ? orders : 0,
    sourceFile: row.sourceFile,
  });
}

function withinFileDupKeys(items: MarketplaceIncomeQueueItem[]): Set<string> {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const r of items) {
    const k = `${r.channel}|${r.externalKey}`;
    if (seen.has(k)) dups.add(k);
    else seen.add(k);
  }
  return dups;
}

export function MarketplaceIncomeImportReview() {
  const router = useRouter();
  const [rows, setRows] = useState<MarketplaceIncomeQueueItem[] | null>(null);
  const [channel, setChannel] = useState<"AMAZON" | "SHOPIFY">("AMAZON");
  const [needsPeriodDate, setNeedsPeriodDate] = useState(false);
  const [periodDate, setPeriodDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [checkingDup, setCheckingDup] = useState(false);
  const [dbDups, setDbDups] = useState<Map<string, DupInfo>>(new Map());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshDuplicates = useCallback(async (items: MarketplaceIncomeQueueItem[]) => {
    if (!items.length) {
      setDbDups(new Map());
      return;
    }
    setCheckingDup(true);
    try {
      const res = await checkMarketplaceIncomeDuplicates(
        items.map((r) => ({
          channel: r.channel,
          externalKey: r.externalKey,
        }))
      );
      const map = new Map<string, DupInfo>();
      for (const d of res.duplicates) {
        map.set(`${d.channel}|${d.externalKey}`, {
          id: d.id,
          externalRef: d.externalRef,
          issueDate: d.issueDate,
        });
      }
      setDbDups(map);
    } finally {
      setCheckingDup(false);
    }
  }, []);

  useEffect(() => {
    const payload = peekMarketplaceIncomeQueue();
    if (!payload) {
      setRows([]);
      return;
    }
    setChannel(payload.channel);
    setNeedsPeriodDate(payload.needsPeriodDate);
    setRows(payload.items);
    if (payload.items[0]?.issueDate) {
      setPeriodDate(payload.items[0].issueDate);
    }
    void refreshDuplicates(payload.items);
  }, [refreshDuplicates]);

  const fileDups = useMemo(
    () => (rows ? withinFileDupKeys(rows) : new Set<string>()),
    [rows]
  );

  const rowFlags = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const key = `${r.channel}|${r.externalKey}`;
      const db = dbDups.get(key);
      const inFile = fileDups.has(key);
      return {
        isDbDup: Boolean(db),
        isFileDup: inFile,
        isDup: Boolean(db) || inFile,
        db,
      };
    });
  }, [rows, dbDups, fileDups]);

  const dupCount = useMemo(
    () => rowFlags.filter((f) => f.isDup).length,
    [rowFlags]
  );
  const newCount = useMemo(
    () => (rows ? rows.length - dupCount : 0),
    [rows, dupCount]
  );

  const summary = useMemo(() => {
    if (!rows) return null;
    let taxableBase = 0;
    let taxableVat = 0;
    let exemptBase = 0;
    let marketplaceBase = 0;
    let refundsBase = 0;
    for (const r of rows) {
      if (r.subtotal < 0) refundsBase += r.subtotal;
      if (r.vatStatus === "TAXABLE") {
        taxableBase += r.subtotal;
        taxableVat += r.vatAmount;
      } else if (r.vatStatus === "EXEMPT") {
        exemptBase += r.subtotal;
      } else {
        marketplaceBase += r.subtotal;
      }
    }
    const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return {
      count: rows.length,
      taxableBase: round(taxableBase),
      taxableVat: round(taxableVat),
      exemptBase: round(exemptBase),
      marketplaceBase: round(marketplaceBase),
      refundsBase: round(refundsBase),
    };
  }, [rows]);

  function applyPeriodDate(next: string) {
    setPeriodDate(next);
    if (!next || !rows) return;
    const updated = rows.map((r) => {
      if (r.channel !== "SHOPIFY") return { ...r, issueDate: next };
      const countryLabel =
        r.description?.replace(/^Ventas Shopify · /, "").split(" · ")[0] ||
        r.shipToCountry ||
        "Sin país";
      return {
        ...r,
        issueDate: next,
        externalKey: rebuildShopifyKey(r, next),
        externalRef: `Shopify · ${countryLabel} · ${next}`,
      };
    });
    setRows(updated);
    saveMarketplaceIncomeQueue({
      channel,
      needsPeriodDate,
      items: updated,
    });
    void refreshDuplicates(updated);
  }

  function removeRow(localId: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.localId !== localId);
      saveMarketplaceIncomeQueue({
        channel,
        needsPeriodDate,
        items: next,
      });
      void refreshDuplicates(next);
      return next;
    });
  }

  function removeDuplicates() {
    if (!rows) return;
    const next = rows.filter((_, i) => !rowFlags[i]?.isDup);
    setRows(next);
    saveMarketplaceIncomeQueue({
      channel,
      needsPeriodDate,
      items: next,
    });
    void refreshDuplicates(next);
  }

  function confirmImport() {
    if (!rows?.length) return;
    if (needsPeriodDate && !periodDate) {
      setError("Indica la fecha del periodo del informe Shopify");
      return;
    }
    const toImport = rows.filter((_, i) => !rowFlags[i]?.isDup);
    if (!toImport.length) {
      setError(
        "Todas las líneas son duplicadas. Quítalas o cambia la fecha del periodo (Shopify)."
      );
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importMarketplaceIncomeRows(
        toImport.map((r) => ({
          channel: r.channel,
          issueDate: r.issueDate,
          externalKey: r.externalKey,
          externalRef: r.externalRef,
          orderId: r.orderId,
          sku: r.sku,
          description: r.description,
          transactionType: r.transactionType,
          vatStatus: r.vatStatus,
          vatRate: r.vatRate,
          subtotal: r.subtotal,
          vatAmount: r.vatAmount,
          total: r.total,
          shipToCountry: r.shipToCountry,
          sourceFile: r.sourceFile,
          documentId: r.documentId ?? null,
          notes: r.notes,
        }))
      );
      if (!res.ok) {
        setError(res.error);
        void refreshDuplicates(rows);
        return;
      }
      clearMarketplaceIncomeQueue();
      setResult(
        `Importadas ${res.imported}` +
          (res.skipped ? ` · ${res.skipped} duplicadas omitidas` : "")
      );
      setTimeout(() => router.push("/fiscal/income"), 800);
    });
  }

  if (rows == null) {
    return <p className="text-sm text-ink-muted">Cargando revisión…</p>;
  }

  if (!rows.length) {
    return (
      <div className="card-panel space-y-3 p-6 text-sm">
        <p className="text-ink-muted">
          No hay líneas en la cola. Sube un CSV o captura desde ingresos
          marketplace.
        </p>
        <Link href="/fiscal/income" className="text-accent underline">
          Volver
        </Link>
      </div>
    );
  }

  const refLabel =
    channel === "SHOPIFY" ? "País / ref." : "Factura Amazon";

  return (
    <div className="space-y-5">
      {needsPeriodDate ? (
        <div className="card-panel space-y-2 p-4 sm:max-w-sm">
          <label className="label" htmlFor="periodDate">
            Fecha del periodo (Shopify)
          </label>
          <DateInput
            id="periodDate"
            className="input"
            value={periodDate}
            onChange={(e) => applyPeriodDate(e.target.value)}
          />
          <p className="text-xs text-ink-muted">
            El export no trae fechas. Usa p. ej. el último día del mes del
            informe; aplica a todas las líneas.
          </p>
        </div>
      ) : null}

      {dupCount > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p className="font-medium">
            {dupCount} línea{dupCount === 1 ? "" : "s"} duplicada
            {dupCount === 1 ? "" : "s"}
            {checkingDup ? " (comprobando…)" : ""}
          </p>
          <p className="mt-1 text-warning/90">
            Ya están en Fiscal o se repiten en este CSV. No se volverán a
            importar.
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium underline"
            disabled={pending}
            onClick={removeDuplicates}
          >
            Quitar duplicadas de la lista
          </button>
        </div>
      ) : checkingDup ? (
        <p className="text-sm text-ink-muted">Comprobando duplicados…</p>
      ) : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card-panel p-4">
            <p className="text-xs text-ink-muted">
              {channel === "SHOPIFY" ? "Shopify" : "Amazon"} · líneas
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {summary.count}
            </p>
            {dupCount > 0 ? (
              <p className="mt-0.5 text-xs text-warning">
                {newCount} nuevas · {dupCount} duplicadas
              </p>
            ) : null}
          </div>
          <div className="card-panel p-4">
            <p className="text-xs text-ink-muted">Base con IVA</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {formatCurrency(summary.taxableBase)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              IVA {formatCurrency(summary.taxableVat)}
            </p>
          </div>
          <div className="card-panel p-4">
            <p className="text-xs text-ink-muted">Base sin IVA</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {formatCurrency(summary.exemptBase)}
            </p>
          </div>
          <div className="card-panel p-4">
            <p className="text-xs text-ink-muted">Devoluciones (base)</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {formatCurrency(summary.refundsBase)}
            </p>
            {summary.marketplaceBase !== 0 ? (
              <p className="mt-0.5 text-xs text-ink-muted">
                OSS marketplace {formatCurrency(summary.marketplaceBase)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Revisa el desglose. Las duplicadas se detectan y se omiten.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={pending || newCount === 0 || checkingDup}
            onClick={confirmImport}
          >
            {pending
              ? "Importando…"
              : newCount === 0
                ? "Nada nuevo que importar"
                : `Importar ${newCount} nueva${newCount === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={pending}
            onClick={() => {
              clearMarketplaceIncomeQueue();
              router.push("/fiscal/income");
            }}
          >
            Cancelar
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {result}
        </p>
      ) : null}

      <div className="card-panel overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-line bg-line/20 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">IVA</th>
              <th className="px-3 py-2 font-medium">{refLabel}</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">Cuota</th>
              <th className="px-3 py-2 text-right font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const flag = rowFlags[i];
              return (
                <tr
                  key={r.localId}
                  className={`border-b border-line/50 ${
                    flag?.isDup ? "bg-warning/5" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-ink-muted">{r.issueDate}</td>
                  <td className="px-3 py-2">{r.transactionType}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs">
                      {VAT_LABEL[r.vatStatus] ?? r.vatStatus}
                      {r.vatStatus === "TAXABLE" ? ` ${r.vatRate}%` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.externalRef ?? "—"}
                    {flag?.isDup ? (
                      <p className="mt-0.5 font-sans text-xs text-warning">
                        {flag.isDbDup
                          ? "Ya registrada"
                          : "Duplicada en este CSV"}
                        {flag.db ? (
                          <>
                            {" · "}
                            <Link
                              href="/fiscal/income"
                              className="underline"
                            >
                              ver listado
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs">{r.orderId ?? r.description ?? "—"}</p>
                    {r.sku ? (
                      <p className="text-xs text-ink-muted">{r.sku}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatCurrency(r.subtotal)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatCurrency(r.vatAmount)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-xs text-danger"
                      disabled={pending}
                      onClick={() => removeRow(r.localId)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
