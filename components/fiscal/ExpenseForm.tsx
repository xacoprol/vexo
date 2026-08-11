"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { Expense } from "@prisma/client";
import { VAT_RATES } from "@/lib/calculations";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_VAT_OPERATION_TYPES,
  isExpenseIntracom,
  parseExpenseVatOperationType,
  type ExpenseVatOperationType,
} from "@/lib/fiscal";
import { DateInput } from "@/components/ui/DateInput";
import { ExpenseDropZone } from "@/components/fiscal/ExpenseDropZone";
import {
  createExpense,
  updateExpense,
  type ExpenseFormState,
} from "@/app/(app)/fiscal/expenses/actions";
import type { ParsedExpenseDraft, ActivityFit } from "@/lib/gemini-expense";
import { consumeExpenseDraft } from "@/lib/expense-draft-storage";
import { ButtonPending } from "@/components/ui/ButtonPending";
import { ActivityFitAlert } from "@/components/fiscal/ActivityFitAlert";

type Props = {
  expense?: Expense;
};

function toDateInputValue(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function ExpenseForm({ expense }: Props) {
  const action = expense
    ? updateExpense.bind(null, expense.id)
    : createExpense;
  const [state, formAction, pending] = useActionState<
    ExpenseFormState,
    FormData
  >(action, {});

  const [issueDate, setIssueDate] = useState(
    expense
      ? toDateInputValue(expense.issueDate)
      : toDateInputValue(new Date())
  );
  const [category, setCategory] = useState(expense?.category ?? "OTROS");
  const [supplierName, setSupplierName] = useState(
    expense?.supplierName ?? ""
  );
  const [supplierNif, setSupplierNif] = useState(expense?.supplierNif ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(
    expense?.invoiceNumber ?? ""
  );
  const [description, setDescription] = useState(expense?.description ?? "");
  const [subtotal, setSubtotal] = useState(
    expense ? Number(expense.subtotal) : 0
  );
  const [vatOperationType, setVatOperationType] =
    useState<ExpenseVatOperationType>(
      parseExpenseVatOperationType(expense?.vatOperationType)
    );
  const [vatRate, setVatRate] = useState(expense?.vatRate ?? 21);
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [deductible, setDeductible] = useState(expense?.deductible ?? true);
  const [dateKey, setDateKey] = useState(0);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [activityFit, setActivityFit] = useState<ActivityFit | null>(null);
  const [activityFitReason, setActivityFitReason] = useState<string | null>(
    null
  );
  const [homeOfficeTip, setHomeOfficeTip] = useState<string | null>(null);

  const intracom = isExpenseIntracom(vatOperationType);
  const rateOptions = intracom
    ? VAT_RATES.filter((r) => r > 0)
    : VAT_RATES;
  const effectiveVatRate =
    intracom && vatRate <= 0 ? 21 : vatRate;
  const vatAmount = useMemo(
    () => Math.round(subtotal * (effectiveVatRate / 100) * 100) / 100,
    [subtotal, effectiveVatRate]
  );
  const total = useMemo(
    () =>
      Math.round((intracom ? subtotal : subtotal + vatAmount) * 100) / 100,
    [subtotal, vatAmount, intracom]
  );

  useEffect(() => {
    if (intracom && vatRate <= 0) setVatRate(21);
  }, [intracom, vatRate]);

  function applyDraft(draft: ParsedExpenseDraft) {
    setIssueDate(draft.issueDate);
    setDateKey((k) => k + 1);
    setCategory(draft.category);
    setSupplierName(draft.supplierName);
    setSupplierNif(draft.supplierNif ?? "");
    setInvoiceNumber(draft.invoiceNumber ?? "");
    setDescription(draft.description ?? "");
    setSubtotal(draft.subtotal);
    const op = parseExpenseVatOperationType(draft.vatOperationType);
    setVatOperationType(op);
    setVatRate(
      isExpenseIntracom(op) ? draft.vatRate || 21 : draft.vatRate
    );
    setNotes(draft.notes ?? "");
    setActivityFit(draft.activityFit ?? "ok");
    setActivityFitReason(draft.activityFitReason ?? null);
    setHomeOfficeTip(draft.homeOfficeTip ?? null);
    if (draft.activityFit === "suspicious") {
      setDeductible(false);
    }
    const conf =
      draft.confidence === "high"
        ? "alta"
        : draft.confidence === "low"
          ? "baja"
          : "media";
    setParseInfo(
      `Datos rellenados (confianza ${conf}). Revísalos antes de guardar.`
    );
  }

  useEffect(() => {
    if (expense) return;
    const draft = consumeExpenseDraft();
    if (draft) applyDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [expense]);

  return (
    <form action={formAction} className="mx-auto max-w-2xl space-y-5">
      {state.error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
          {state.duplicateId ? (
            <>
              {" "}
              <Link
                href={`/fiscal/expenses/${state.duplicateId}/edit`}
                className="font-medium underline"
              >
                Abrir el existente
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {!expense ? (
        <section className="space-y-3">
          <ExpenseDropZone compact onParsed={applyDraft} />
          {parseInfo ? (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              {parseInfo}
            </p>
          ) : null}
          {activityFit ? (
            <ActivityFitAlert
              activityFit={activityFit}
              activityFitReason={activityFitReason}
              homeOfficeTip={homeOfficeTip}
            />
          ) : null}
        </section>
      ) : null}

      <section className="card-panel space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="form-section-title">
            {expense ? "Editar gasto" : "Datos del gasto"}
          </h2>
          <p className="form-section-hint">
            Factura recibida o ticket. Entra en el IVA soportado (303) y en el
            130 si es deducible. Bambu Lab y similares UE → Intracomunitaria.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="issueDate">
              Fecha
            </label>
            <DateInput
              key={dateKey}
              id="issueDate"
              name="issueDate"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="category">
              Categoría
            </label>
            <select
              id="category"
              name="category"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="supplierName">
              Proveedor
            </label>
            <input
              id="supplierName"
              name="supplierName"
              className="input"
              required
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Nombre o razón social"
            />
          </div>
          <div>
            <label className="label" htmlFor="supplierNif">
              NIF / VAT proveedor
              {intracom ? " (obligatorio)" : ""}
            </label>
            <input
              id="supplierNif"
              name="supplierNif"
              className="input font-mono"
              value={supplierNif}
              onChange={(e) => setSupplierNif(e.target.value)}
              required={intracom}
              placeholder={
                intracom ? "Ej. NL123456789B01" : "Recomendado (347)"
              }
            />
            {!intracom ? (
              <p className="mt-1 text-xs text-ink-muted">
                Sin NIF el gasto no entra en el borrador 347.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="invoiceNumber">
            Nº factura proveedor
          </label>
          <input
            id="invoiceNumber"
            name="invoiceNumber"
            className="input font-mono"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Ej. F-2026-0042"
          />
          <p className="mt-1 text-xs text-ink-muted">
            Si se registra dos veces la misma factura del mismo proveedor, se
            bloquea el alta.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="description">
            Concepto
          </label>
          <input
            id="description"
            name="description"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Hosting Vercel julio"
          />
        </div>

        <div>
          <label className="label" htmlFor="vatOperationType">
            Tipo de operación
          </label>
          <select
            id="vatOperationType"
            name="vatOperationType"
            className="input"
            value={vatOperationType}
            onChange={(e) => {
              const next = parseExpenseVatOperationType(e.target.value);
              setVatOperationType(next);
              if (isExpenseIntracom(next) && vatRate === 0) setVatRate(21);
            }}
          >
            {EXPENSE_VAT_OPERATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {intracom ? (
            <p className="mt-1 text-xs text-ink-muted">
              Bambu y similares: en la factura UE no viene IVA español (pagas
              solo la base). Aquí pones esa base y eliges <strong>21 %</strong>{" "}
              para que el 303 declare la misma cuota en 10/11 (devengo) y 36/37
              (deducción): neto IVA = 0. No es un cobro extra al proveedor.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="subtotal">
              {intracom ? "Importe factura UE (base)" : "Base imponible"}
            </label>
            <input
              id="subtotal"
              name="subtotal"
              type="number"
              step="0.01"
              min="0"
              required
              className="input font-mono"
              value={subtotal}
              onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label" htmlFor="vatRate">
              {intracom ? "Tipo IVA español" : "IVA %"}
            </label>
            <select
              id="vatRate"
              name="vatRate"
              className="input"
              value={effectiveVatRate}
              onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
            >
              {rateOptions.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="vatAmount">
              {intracom ? "Cuota a declarar en el 303" : "Cuota IVA"}
            </label>
            <input
              id="vatAmount"
              name="vatAmount"
              type="number"
              step="0.01"
              min="0"
              className="input font-mono"
              value={vatAmount}
              readOnly
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="total">
            {intracom ? "Lo que pagas a Bambu / proveedor" : "Total"}
          </label>
          <input
            id="total"
            name="total"
            type="number"
            step="0.01"
            className="input font-mono"
            value={total}
            readOnly
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="deductible"
            value="1"
            checked={deductible}
            onChange={(e) => setDeductible(e.target.checked)}
            className="rounded border-line"
          />
          Deducible IRPF e IVA (130 casilla 02 + 303 soportado). Si lo
          desmarcas (gasto privado), no entra en IRPF ni como IVA deducible.
          Las adquisiciones intracomunitarias siguen declarándose en el 303.
        </label>

        <div>
          <label className="label" htmlFor="notes">
            Notas
          </label>
          <textarea
            id="notes"
            name="notes"
            className="input min-h-20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </section>

      <button type="submit" className="btn-primary" disabled={pending}>
        <ButtonPending
          pending={pending}
          idle={expense ? "Guardar cambios" : "Registrar gasto"}
          busy="Guardando…"
        />
      </button>
    </form>
  );
}
