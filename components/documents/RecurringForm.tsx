"use client";

import { useActionState, useState } from "react";
import {
  LineItemsEditor,
  createEmptyLines,
  type EditorLine,
} from "@/components/documents/LineItemsEditor";
import {
  createRecurring,
  updateRecurring,
  type RecurringFormState,
} from "@/app/(app)/recurring/actions";
import { ClientCombobox, type ClientOption } from "@/components/clients/ClientCombobox";
import { VAT_OPERATION_TYPES } from "@/lib/recurring";
import { DateInput } from "@/components/ui/DateInput";
import { ButtonPending } from "@/components/ui/ButtonPending";

type Props = {
  series: { id: string; name: string; prefix: string; isDefault?: boolean }[];
  defaultClient?: ClientOption | null;
  defaultVatRate?: number;
  defaultIrpfRate?: number;
  template?: {
    id: string;
    name: string;
    clientId: string;
    seriesId: string;
    frequency: string;
    intervalCount: number;
    dayOfMonth: number;
    startDate: string;
    endDate: string;
    notes: string;
    paymentMethod: string;
    bankIban: string;
    irpfRate: number;
    vatOperationType: string;
    cashAccounting: boolean;
    operationKey: string;
    operationKey347: string;
    lines: EditorLine[];
  };
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RecurringForm({
  series,
  defaultClient = null,
  defaultVatRate = 21,
  defaultIrpfRate = 15,
  template,
}: Props) {
  const action = template
    ? updateRecurring.bind(null, template.id)
    : createRecurring;
  const [state, formAction, pending] = useActionState<
    RecurringFormState,
    FormData
  >(action, {});
  const [lines, setLines] = useState<EditorLine[]>(
    template?.lines ?? createEmptyLines(defaultVatRate)
  );
  const [irpfRate, setIrpfRate] = useState(
    template?.irpfRate ?? defaultIrpfRate
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Nombre
          </label>
          <input
            id="name"
            name="name"
            className="input"
            required
            defaultValue={template?.name ?? ""}
            placeholder="Ej. Hosting anual"
          />
        </div>
        <div>
          <ClientCombobox defaultClient={defaultClient} />
        </div>
        <div>
          <label className="label" htmlFor="seriesId">
            Serie de factura
          </label>
          <select
            id="seriesId"
            name="seriesId"
            className="input"
            required
            defaultValue={
              template?.seriesId ??
              series.find((s) => s.isDefault)?.id ??
              series[0]?.id
            }
          >
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.prefix})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="frequency">
            Frecuencia
          </label>
          <select
            id="frequency"
            name="frequency"
            className="input"
            defaultValue={template?.frequency ?? "ANUAL"}
          >
            {["MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"].map((f) => (
              <option key={f} value={f}>
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="intervalCount">
            Repetir cada
          </label>
          <input
            type="number"
            id="intervalCount"
            name="intervalCount"
            min={1}
            className="input"
            defaultValue={template?.intervalCount ?? 1}
          />
        </div>
        <div>
          <label className="label" htmlFor="dayOfMonth">
            Día de generación
          </label>
          <input
            type="number"
            id="dayOfMonth"
            name="dayOfMonth"
            min={1}
            max={28}
            className="input"
            defaultValue={template?.dayOfMonth ?? 1}
          />
        </div>
        <div>
          <label className="label" htmlFor="startDate">
            Fecha desde
          </label>
          <DateInput
            id="startDate"
            name="startDate"
            className="input"
            required
            defaultValue={template?.startDate ?? todayISO()}
          />
        </div>
        <div>
          <label className="label" htmlFor="endDate">
            Fecha hasta (opcional)
          </label>
          <DateInput
            id="endDate"
            name="endDate"
            className="input"
            defaultValue={template?.endDate ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="paymentMethod">
            Forma de cobro
          </label>
          <input
            id="paymentMethod"
            name="paymentMethod"
            className="input"
            defaultValue={template?.paymentMethod ?? ""}
            placeholder="Transferencia"
          />
        </div>
        <div>
          <label className="label" htmlFor="bankIban">
            IBAN
          </label>
          <input
            id="bankIban"
            name="bankIban"
            className="input font-mono"
            defaultValue={template?.bankIban ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="vatOperationType">
            Tipo operación IVA
          </label>
          <select
            id="vatOperationType"
            name="vatOperationType"
            className="input"
            defaultValue={template?.vatOperationType ?? "SUJETA"}
          >
            {VAT_OPERATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                name="cashAccounting"
                defaultChecked={template?.cashAccounting ?? false}
              />
              Criterio de caja (dato guardado)
            </span>
            <span className="text-xs text-ink-muted">
              El fiscal de Vexo usa fecha de factura, no de cobro. No actives
              esto hasta que el 303 por cobros esté implementado.
            </span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="operationKey">
            Clave operación
          </label>
          <input
            id="operationKey"
            name="operationKey"
            className="input"
            defaultValue={template?.operationKey ?? ""}
            placeholder="0 - Operación habitual"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="operationKey347">
            Clave operación modelo 347
          </label>
          <select
            id="operationKey347"
            name="operationKey347"
            className="input"
            defaultValue={template?.operationKey347 || "B"}
          >
            <option value="B">B — Ventas / entregas</option>
            <option value="A">A — Compras / adquisiciones</option>
          </select>
        </div>
      </div>

      <LineItemsEditor
        lines={lines}
        onChange={setLines}
        irpfRate={irpfRate}
        onIrpfChange={setIrpfRate}
        showIrpf
        defaultVatRate={defaultVatRate}
      />

      <div>
        <label className="label" htmlFor="notes">
          Notas en factura
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="input"
          defaultValue={template?.notes ?? ""}
        />
      </div>

      <button type="submit" disabled={pending} className="btn-primary">
        <ButtonPending
          pending={pending}
          idle={template ? "Guardar" : "Crear"}
          busy="Guardando…"
        />
      </button>
    </form>
  );
}
