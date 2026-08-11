"use client";

import { useActionState, useState } from "react";
import { DateInput } from "@/components/ui/DateInput";
import { ButtonPending } from "@/components/ui/ButtonPending";
import {
  EXPENSE_VAT_OPERATION_TYPES,
  type ExpenseVatOperationType,
} from "@/lib/fiscal";
import {
  createInvestmentAsset,
  type AssetFormState,
} from "@/app/(app)/fiscal/assets/actions";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  defaultUsefulLifeYears?: number;
};

export function InvestmentAssetForm({
  defaultUsefulLifeYears = 4,
}: Props) {
  const [state, formAction, pending] = useActionState<
    AssetFormState,
    FormData
  >(createInvestmentAsset, {});
  const [vatOp, setVatOp] = useState<ExpenseVatOperationType>("INTERIOR");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn-primary text-sm"
        onClick={() => setOpen(true)}
      >
        Nuevo bien
      </button>
    );
  }

  return (
    <section className="card-panel space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="form-section-title">Alta de bien de inversión</h2>
          <p className="form-section-hint">
            Para compras nuevas preferible registrar el gasto y marcar «Bien de
            inversión». Usa este alta para bienes históricos o sin factura en
            Vexo.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-ink-muted hover:underline"
          onClick={() => setOpen(false)}
        >
          Cerrar
        </button>
      </div>

      {state.error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            Descripción
          </label>
          <input
            id="description"
            name="description"
            required
            className="input"
            placeholder="p. ej. Módulo láser xTool S1"
          />
        </div>
        <div>
          <label className="label" htmlFor="purchaseDate">
            Fecha de alta
          </label>
          <DateInput
            id="purchaseDate"
            name="purchaseDate"
            required
            defaultValue={todayInput()}
          />
        </div>
        <div>
          <label className="label" htmlFor="usefulLifeYears">
            Años vida útil
          </label>
          <input
            id="usefulLifeYears"
            name="usefulLifeYears"
            type="number"
            min={1}
            max={40}
            defaultValue={defaultUsefulLifeYears}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="supplierName">
            Proveedor
          </label>
          <input id="supplierName" name="supplierName" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="supplierNif">
            NIF / VAT
          </label>
          <input id="supplierNif" name="supplierNif" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="invoiceNumber">
            Nº factura
          </label>
          <input id="invoiceNumber" name="invoiceNumber" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="vatOperationType">
            Tipo IVA
          </label>
          <select
            id="vatOperationType"
            name="vatOperationType"
            className="input"
            value={vatOp}
            onChange={(e) =>
              setVatOp(e.target.value as ExpenseVatOperationType)
            }
          >
            {EXPENSE_VAT_OPERATION_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="base">
            Base (€)
          </label>
          <input
            id="base"
            name="base"
            type="number"
            step="0.01"
            min={0}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="vatAmount">
            IVA (€)
          </label>
          <input
            id="vatAmount"
            name="vatAmount"
            type="number"
            step="0.01"
            min={0}
            defaultValue={0}
            className="input"
            disabled={vatOp === "INTRACOMUNITARIA"}
          />
          {vatOp === "INTRACOMUNITARIA" ? (
            <input type="hidden" name="vatAmount" value="0" />
          ) : null}
          {vatOp === "INTRACOMUNITARIA" ? (
            <p className="mt-1 text-xs text-ink-muted">
              Intracom: el IVA autorrepercutido va en el gasto (AIB), no aquí.
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notas
          </label>
          <input id="notes" name="notes" className="input" />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            <ButtonPending
              pending={pending}
              idle="Guardar bien"
              busy="Guardando…"
            />
          </button>
        </div>
      </form>
    </section>
  );
}
