"use client";

import { useActionState, useMemo, useState } from "react";
import {
  LineItemsEditor,
  createEmptyLines,
  type EditorLine,
} from "@/components/documents/LineItemsEditor";
import {
  DocumentFormSection,
  DocumentFormShell,
  DocumentFormStickyBar,
} from "@/components/documents/DocumentFormShell";
import { ClientCombobox, type ClientOption } from "@/components/clients/ClientCombobox";
import {
  createInvoice,
  updateInvoice,
  type DocFormState,
} from "@/app/(app)/invoices/actions";
import { DateInput } from "@/components/ui/DateInput";
import { ButtonPending } from "@/components/ui/ButtonPending";
import { calculateDocument, formatCurrency } from "@/lib/calculations";
import {
  isZeroVatOperation,
  VAT_OPERATION_TYPES,
} from "@/lib/recurring";
import {
  OPERATION_KEY_347_OPTIONS,
  invoiceVatCountryWarning,
} from "@/lib/invoice-fiscal";

type SeriesOption = {
  id: string;
  name: string;
  prefix: string;
  isDefault?: boolean;
  nextNumberPreview?: string;
};

type InvoiceData = {
  id: string;
  clientId: string;
  seriesId: string;
  fullNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  paymentMethod: string;
  invoiceKind?: string;
  notes: string;
  irpfRate: number;
  vatOperationType: string;
  operationKey347: string;
  lines: EditorLine[];
};

type Props = {
  series: SeriesOption[];
  defaultClient?: ClientOption | null;
  defaultVatRate?: number;
  defaultIrpfRate?: number;
  invoice?: InvoiceData;
  nextNumberPreview?: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm({
  series,
  defaultClient = null,
  defaultVatRate = 21,
  defaultIrpfRate = 15,
  invoice,
  nextNumberPreview,
}: Props) {
  const action = invoice
    ? updateInvoice.bind(null, invoice.id)
    : createInvoice;

  const [state, formAction, pending] = useActionState<DocFormState, FormData>(
    action,
    {}
  );
  const [lines, setLines] = useState<EditorLine[]>(
    invoice?.lines ?? createEmptyLines(defaultVatRate)
  );
  const [irpfRate, setIrpfRate] = useState(
    invoice?.irpfRate ?? defaultIrpfRate
  );
  const [vatOperationType, setVatOperationType] = useState(
    invoice?.vatOperationType ?? "SUJETA"
  );
  const [operationKey347, setOperationKey347] = useState(
    invoice?.operationKey347 || "B"
  );
  const [invoiceKind, setInvoiceKind] = useState(
    invoice?.invoiceKind === "SIMPLIFIED" ? "SIMPLIFIED" : "FULL"
  );
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(
    defaultClient ?? null
  );
  const defaultSeriesId =
    series.find((s) => s.isDefault)?.id ?? series[0]?.id ?? "";
  const [selectedSeriesId, setSelectedSeriesId] = useState(
    invoice?.seriesId ?? defaultSeriesId
  );
  const selectedSeries = series.find((s) => s.id === selectedSeriesId);
  const preview =
    selectedSeries?.nextNumberPreview ?? nextNumberPreview;

  const totals = useMemo(
    () => calculateDocument(lines, irpfRate),
    [lines, irpfRate]
  );

  function onVatOperationChange(next: string) {
    setVatOperationType(next);
    if (isZeroVatOperation(next)) {
      setLines((prev) => prev.map((l) => ({ ...l, vatRate: 0 })));
    } else {
      setLines((prev) =>
        prev.map((l) =>
          l.vatRate === 0 ? { ...l, vatRate: defaultVatRate } : l
        )
      );
    }
  }

  const vatCountryWarn = invoiceVatCountryWarning({
    vatOperationType,
    clientCountryCode: selectedClient?.countryCode,
  });

  const numberLabel = invoice?.fullNumber ?? preview ?? undefined;

  return (
    <form action={formAction}>
      <DocumentFormShell
        docKind="Factura"
        numberLabel={numberLabel}
        subtitle={
          invoice
            ? "Modifica los datos y guarda los cambios"
            : "El número se reserva al guardar (correlativo sin huecos)"
        }
      >
        {state.error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <DocumentFormSection
          title="Datos"
          hint="Serie, cliente, fechas y cobro"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {!invoice && (
              <div>
                <label className="label" htmlFor="seriesId">
                  Serie
                </label>
                <select
                  id="seriesId"
                  name="seriesId"
                  className="input"
                  value={selectedSeriesId}
                  onChange={(e) => setSelectedSeriesId(e.target.value)}
                >
                  {series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.prefix})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={invoice ? "sm:col-span-2" : undefined}>
              <ClientCombobox
                defaultClient={defaultClient}
                onClientChange={setSelectedClient}
              />
            </div>
            <div>
              <label className="label" htmlFor="issueDate">
                Fecha emisión
              </label>
              <DateInput
                id="issueDate"
                name="issueDate"
                className="input"
                required
                defaultValue={invoice?.issueDate ?? todayISO()}
              />
            </div>
            <div>
              <label className="label" htmlFor="dueDate">
                Vencimiento
              </label>
              <DateInput
                id="dueDate"
                name="dueDate"
                className="input"
                defaultValue={invoice?.dueDate ?? plusDaysISO(30)}
              />
            </div>
            {invoice && (
              <div>
                <label className="label" htmlFor="status">
                  Estado
                </label>
                <select
                  id="status"
                  name="status"
                  className="input"
                  defaultValue={invoice.status}
                >
                  {["PENDIENTE", "PAGADA", "VENCIDA", "ANULADA"].map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="label">Tipo de factura</p>
              <div className="mt-1 flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="invoiceKind"
                    value="FULL"
                    checked={invoiceKind === "FULL"}
                    onChange={() => setInvoiceKind("FULL")}
                    className="accent-[var(--accent)]"
                  />
                  Factura completa
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="invoiceKind"
                    value="SIMPLIFIED"
                    checked={invoiceKind === "SIMPLIFIED"}
                    onChange={() => setInvoiceKind("SIMPLIFIED")}
                    className="accent-[var(--accent)]"
                  />
                  Factura simplificada
                </label>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Completa (F1): requiere NIF del cliente. Simplificada (F2):
                límite de importe según Ajustes; el tipo queda fijado al emitir.
              </p>
            </div>
            <div className={invoice ? undefined : "sm:col-span-2"}>
              <label className="label" htmlFor="paymentMethod">
                Método de pago
              </label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                className="input"
                defaultValue={
                  invoice?.paymentMethod?.toLowerCase().includes("bizum")
                    ? "Bizum"
                    : "Transferencia"
                }
              >
                <option value="Transferencia">Transferencia</option>
                <option value="Bizum">Bizum</option>
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Transferencia: IBAN de Ajustes · Bizum: teléfono configurado en
                Ajustes
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="vatOperationType">
                Tipo de operación IVA
              </label>
              <select
                id="vatOperationType"
                name="vatOperationType"
                className="input"
                value={vatOperationType}
                onChange={(e) => onVatOperationChange(e.target.value)}
              >
                {VAT_OPERATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Intracomunitaria y Canarias no llevan IVA peninsular (0 %). Así
                Fiscal las separa del IVA repercutido del 303.
              </p>
              {vatCountryWarn ? (
                <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {vatCountryWarn}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="operationKey347">
                Clave modelo 347
              </label>
              <select
                id="operationKey347"
                name="operationKey347"
                className="input"
                value={operationKey347}
                onChange={(e) => setOperationKey347(e.target.value)}
              >
                {OPERATION_KEY_347_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Ventas a clientes ES → normalmente B. Solo afecta al borrador
                347 anual.
              </p>
            </div>
          </div>
        </DocumentFormSection>

        <DocumentFormSection
          title="Conceptos"
          hint="Líneas de la factura e IRPF"
        >
          <LineItemsEditor
            lines={lines}
            onChange={setLines}
            irpfRate={irpfRate}
            onIrpfChange={setIrpfRate}
            showIrpf
            defaultVatRate={defaultVatRate}
          />
        </DocumentFormSection>

        <DocumentFormSection title="Notas">
          <label className="label" htmlFor="notes">
            Observaciones
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            className="input"
            placeholder="Notas visibles en la factura…"
            defaultValue={invoice?.notes ?? ""}
          />
        </DocumentFormSection>
      </DocumentFormShell>

      <DocumentFormStickyBar
        totalLabel="Total factura"
        totalValue={formatCurrency(totals.total)}
      >
        <a href="/invoices" className="btn-secondary">
          Cancelar
        </a>
        <button type="submit" disabled={pending} className="btn-primary">
          <ButtonPending
            pending={pending}
            idle={invoice ? "Guardar cambios" : "Emitir factura"}
            busy="Guardando…"
          />
        </button>
      </DocumentFormStickyBar>
    </form>
  );
}
