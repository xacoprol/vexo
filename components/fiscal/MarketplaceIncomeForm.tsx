"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { MarketplaceIncome } from "@prisma/client";
import { DateInput } from "@/components/ui/DateInput";
import { ButtonPending } from "@/components/ui/ButtonPending";
import {
  createMarketplaceIncome,
  updateMarketplaceIncome,
  type MarketplaceIncomeFormState,
} from "@/app/(app)/fiscal/income/actions";

const CHANNELS = [
  { value: "SHOPIFY", label: "Shopify" },
  { value: "AMAZON", label: "Amazon" },
] as const;

const VAT_STATUSES = [
  { value: "TAXABLE", label: "Con IVA" },
  { value: "EXEMPT", label: "Sin IVA / exento" },
  { value: "MARKETPLACE_COLLECTED", label: "OSS marketplace" },
] as const;

const TX_TYPES = ["SHIPMENT", "RETURN", "REFUND", "OTHER"] as const;

function toDateInputValue(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

type Props = {
  income?: MarketplaceIncome;
};

export function MarketplaceIncomeForm({ income }: Props) {
  const action = income
    ? updateMarketplaceIncome.bind(null, income.id)
    : createMarketplaceIncome;
  const [state, formAction, pending] = useActionState<
    MarketplaceIncomeFormState,
    FormData
  >(action, {});

  const [vatStatus, setVatStatus] = useState(
    income?.vatStatus ?? "TAXABLE"
  );
  const [subtotal, setSubtotal] = useState(
    income ? Number(income.subtotal) : 0
  );
  const [vatRate, setVatRate] = useState(income?.vatRate ?? 21);
  const [vatAmount, setVatAmount] = useState(
    income ? Number(income.vatAmount) : 0
  );

  const suggestedVat = useMemo(() => {
    if (vatStatus !== "TAXABLE") return 0;
    return Math.round((subtotal * vatRate) / 100 * 100) / 100;
  }, [subtotal, vatRate, vatStatus]);

  return (
    <form action={formAction} className="card-panel mx-auto max-w-2xl space-y-4 p-5">
      {state.error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="issueDate">
            Fecha
          </label>
          <DateInput
            id="issueDate"
            name="issueDate"
            required
            defaultValue={
              income
                ? toDateInputValue(income.issueDate)
                : toDateInputValue(new Date())
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="channel">
            Canal
          </label>
          <select
            id="channel"
            name="channel"
            className="input"
            defaultValue={income?.channel ?? "SHOPIFY"}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="transactionType">
            Tipo
          </label>
          <select
            id="transactionType"
            name="transactionType"
            className="input"
            defaultValue={income?.transactionType ?? "SHIPMENT"}
          >
            {TX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vatStatus">
            Tratamiento IVA
          </label>
          <select
            id="vatStatus"
            name="vatStatus"
            className="input"
            value={vatStatus}
            onChange={(e) => {
              const next = e.target.value;
              setVatStatus(next);
              if (next !== "TAXABLE") setVatAmount(0);
            }}
          >
            {VAT_STATUSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="externalRef">
            Ref. / factura
          </label>
          <input
            id="externalRef"
            name="externalRef"
            className="input"
            defaultValue={income?.externalRef ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="orderId">
            Pedido
          </label>
          <input
            id="orderId"
            name="orderId"
            className="input"
            defaultValue={income?.orderId ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="sku">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            className="input"
            defaultValue={income?.sku ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="shipToCountry">
            País destino
          </label>
          <input
            id="shipToCountry"
            name="shipToCountry"
            className="input"
            placeholder="ES"
            defaultValue={income?.shipToCountry ?? ""}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            Descripción
          </label>
          <input
            id="description"
            name="description"
            className="input"
            defaultValue={income?.description ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="subtotal">
            Base (€)
          </label>
          <input
            id="subtotal"
            name="subtotal"
            type="number"
            step="0.01"
            required
            className="input font-mono"
            value={subtotal}
            onChange={(e) => setSubtotal(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="label" htmlFor="vatRate">
            Tipo IVA %
          </label>
          <input
            id="vatRate"
            name="vatRate"
            type="number"
            step="0.01"
            className="input font-mono"
            value={vatRate}
            disabled={vatStatus !== "TAXABLE"}
            onChange={(e) => setVatRate(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="label" htmlFor="vatAmount">
            Cuota IVA (€)
          </label>
          <input
            id="vatAmount"
            name="vatAmount"
            type="number"
            step="0.01"
            className="input font-mono"
            value={vatAmount}
            disabled={vatStatus !== "TAXABLE"}
            onChange={(e) => setVatAmount(Number(e.target.value) || 0)}
          />
          {vatStatus === "TAXABLE" ? (
            <button
              type="button"
              className="mt-1 text-xs text-accent hover:underline"
              onClick={() => setVatAmount(suggestedVat)}
            >
              Calcular {suggestedVat.toFixed(2)} €
            </button>
          ) : (
            <input type="hidden" name="vatAmount" value="0" />
          )}
        </div>
        <div>
          <label className="label" htmlFor="total">
            Total (€)
          </label>
          <input
            id="total"
            name="total"
            type="number"
            step="0.01"
            className="input font-mono"
            defaultValue={
              income
                ? Number(income.total)
                : undefined
            }
            placeholder="Base + IVA"
          />
        </div>
        {income ? (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="externalKey">
              Clave externa (dedupe)
            </label>
            <input
              id="externalKey"
              name="externalKey"
              className="input font-mono text-xs"
              defaultValue={income.externalKey}
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notas
          </label>
          <input
            id="notes"
            name="notes"
            className="input"
            defaultValue={income?.notes ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          <ButtonPending
            pending={pending}
            idle={income ? "Guardar cambios" : "Crear ingreso"}
            busy="Guardando…"
          />
        </button>
        <Link href="/fiscal/income" className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
