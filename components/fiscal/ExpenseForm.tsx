"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { Expense } from "@prisma/client";
import { VAT_RATES } from "@/lib/calculations";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_VAT_OPERATION_TYPES,
  isExpenseImportGoods,
  isExpenseImportService,
  isExpenseIntracom,
  isExpenseReverseCharge,
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
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import { expectedWithholdingAmount } from "@/lib/fiscal-withholding";

type LeaseOption = {
  id: string;
  label: string;
  landlordName: string;
  landlordNif: string;
  withholdingStatus: string;
  defaultWithholdingRate: number | null;
};

type PracticedWithholdingDraft = {
  baseAmount: number;
  rate: number;
  withholdingAmount: number;
  paymentDate: string | null;
};

type Props = {
  expense?: Expense;
  practicedWithholding?: PracticedWithholdingDraft | null;
  rentWithholding?: PracticedWithholdingDraft | null;
  leases?: LeaseOption[];
  defaultUsefulLifeYears?: number;
};

function toDateInputValue(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function ExpenseForm({
  expense,
  practicedWithholding = null,
  rentWithholding = null,
  leases = [],
  defaultUsefulLifeYears = 4,
}: Props) {
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
  const [vatDeductiblePct, setVatDeductiblePct] = useState(
    expense?.vatDeductiblePct ?? (expense?.deductible === false ? 0 : 100)
  );
  const [irpfDeductiblePct, setIrpfDeductiblePct] = useState(
    expense?.irpfDeductiblePct ?? (expense?.deductible === false ? 0 : 100)
  );
  const [isInvestment, setIsInvestment] = useState(
    expense?.isInvestment ?? false
  );
  const [usefulLifeYears, setUsefulLifeYears] = useState(
    defaultUsefulLifeYears
  );
  const [dateKey, setDateKey] = useState(0);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [activityFit, setActivityFit] = useState<ActivityFit | null>(null);
  const [activityFitReason, setActivityFitReason] = useState<string | null>(
    null
  );
  const [homeOfficeTip, setHomeOfficeTip] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(
    expense?.documentId ?? null
  );
  const [importDuaNumber, setImportDuaNumber] = useState(
    expense?.importDuaNumber ?? ""
  );
  const [importDuaDate, setImportDuaDate] = useState(
    expense?.importDuaDate
      ? toDateInputValue(expense.importDuaDate)
      : ""
  );
  const [importDuaBase, setImportDuaBase] = useState(
    expense?.importDuaBase != null ? Number(expense.importDuaBase) : 0
  );
  const [importDuaVat, setImportDuaVat] = useState(
    expense?.importDuaVat != null ? Number(expense.importDuaVat) : 0
  );
  const [importDuaDocumentId, setImportDuaDocumentId] = useState<string | null>(
    expense?.importDuaDocumentId ?? null
  );
  const [practicedWithholdingStatus, setPracticedWithholdingStatus] = useState(
    expense?.practicedWithholdingStatus ?? "UNKNOWN"
  );
  const initialWh = rentWithholding ?? practicedWithholding;
  const [leaseId, setLeaseId] = useState(expense?.leaseId ?? "");
  const selectedLease = useMemo(
    () => leases.find((l) => l.id === leaseId) ?? null,
    [leases, leaseId]
  );
  const rentWithholdingYes = selectedLease?.withholdingStatus === "YES";
  const [withholdingBase, setWithholdingBase] = useState(
    initialWh?.baseAmount ?? (expense ? Number(expense.subtotal) : 0)
  );
  const [withholdingRate, setWithholdingRate] = useState(
    initialWh?.rate ??
      (selectedLease?.defaultWithholdingRate != null
        ? selectedLease.defaultWithholdingRate
        : 15)
  );
  const [withholdingAmountManual, setWithholdingAmountManual] = useState<
    number | null
  >(initialWh?.withholdingAmount ?? null);
  const [withholdingPaymentDate, setWithholdingPaymentDate] = useState(
    initialWh?.paymentDate ?? ""
  );

  const intracom = isExpenseIntracom(vatOperationType);
  const importGoods = isExpenseImportGoods(vatOperationType);
  const importService = isExpenseImportService(vatOperationType);
  const reverseCharge = isExpenseReverseCharge(vatOperationType);
  const rateOptions = reverseCharge
    ? VAT_RATES.filter((r) => r > 0)
    : VAT_RATES;
  const effectiveVatRate =
    reverseCharge && vatRate <= 0 ? 21 : vatRate;
  const vatAmount = useMemo(
    () => Math.round(subtotal * (effectiveVatRate / 100) * 100) / 100,
    [subtotal, effectiveVatRate]
  );
  const total = useMemo(
    () =>
      Math.round((reverseCharge ? subtotal : subtotal + vatAmount) * 100) / 100,
    [subtotal, vatAmount, reverseCharge]
  );
  const computedWithholding = useMemo(
    () => expectedWithholdingAmount(withholdingBase, withholdingRate),
    [withholdingBase, withholdingRate]
  );
  const withholdingAmount =
    withholdingAmountManual != null
      ? withholdingAmountManual
      : computedWithholding;
  const amountPayable = useMemo(
    () =>
      practicedWithholdingStatus === "YES" || rentWithholdingYes
        ? Math.round((total - withholdingAmount) * 100) / 100
        : total,
    [practicedWithholdingStatus, rentWithholdingYes, total, withholdingAmount]
  );

  function applyLeaseSelection(nextId: string) {
    setLeaseId(nextId);
    const lease = leases.find((l) => l.id === nextId);
    if (!lease) return;
    setSupplierName(lease.landlordName);
    setSupplierNif(lease.landlordNif);
    if (lease.withholdingStatus === "YES") {
      setPracticedWithholdingStatus("NO");
      setWithholdingBase(subtotal);
      setWithholdingRate(lease.defaultWithholdingRate ?? 19);
      setWithholdingAmountManual(null);
    }
  }

  useEffect(() => {
    if (reverseCharge && vatRate <= 0) setVatRate(21);
  }, [reverseCharge, vatRate]);

  function applyDraft(draft: ParsedExpenseDraft) {
    setIssueDate(draft.issueDate);
    setDateKey((k) => k + 1);
    setCategory(draft.category);
    setSupplierName(draft.supplierName);
    setSupplierNif(draft.supplierNif ?? "");
    setInvoiceNumber(draft.invoiceNumber ?? "");
    setDescription(draft.description ?? "");
    setSubtotal(draft.subtotal);
    setWithholdingBase(draft.subtotal);
    setWithholdingAmountManual(null);
    const op = parseExpenseVatOperationType(draft.vatOperationType);
    setVatOperationType(op);
    setVatRate(
      isExpenseReverseCharge(op) ? draft.vatRate || 21 : draft.vatRate
    );
    setNotes(draft.notes ?? "");
    setActivityFit(draft.activityFit ?? "ok");
    setActivityFitReason(draft.activityFitReason ?? null);
    setHomeOfficeTip(draft.homeOfficeTip ?? null);
    setDocumentId(draft.documentId ?? null);
    if (draft.activityFit === "suspicious") {
      setVatDeductiblePct(0);
      setIrpfDeductiblePct(0);
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
    <form
      action={formAction}
      encType="multipart/form-data"
      className="mx-auto max-w-2xl space-y-5"
    >
      {documentId ? (
        <input type="hidden" name="documentId" value={documentId} />
      ) : null}
      {documentId ? (
        <p className="rounded-lg border border-line bg-accent-soft/40 px-3 py-2 text-sm text-ink-muted">
          Factura original guardada en Vexo.{" "}
          <a
            href={fiscalDocumentHref(documentId)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            Ver archivo
          </a>
        </p>
      ) : null}
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
              if (isExpenseReverseCharge(next) && vatRate === 0) setVatRate(21);
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
          ) : importService ? (
            <p className="mt-1 text-xs text-ink-muted">
              La factura EEUU viene <strong>sin IVA</strong> (0 %). En España tú
              autoliquidas el 21 % en el modelo <strong>303</strong> (casillas{" "}
              <strong>16/17</strong>) y lo deduces en la <strong>29</strong> si
              el gasto es deducible: <strong>no pagas ese IVA a Cursor</strong>,
              solo lo declaras (efecto neto ≈ 0). Base en € si venía en USD.
            </p>
          ) : importGoods ? (
            <p className="mt-1 text-xs text-ink-muted">
              La factura del proveedor extranjero <strong>no</strong> es el DUA.
              El IVA deducible de importación (303 cas. 32–35) debe indicarse en
              el bloque de datos aduaneros.
            </p>
          ) : null}
        </div>

        {importGoods ? (
          <div className="space-y-4 rounded-lg border border-line bg-line/20 p-4">
            <h3 className="text-sm font-semibold text-ink">Datos de importación</h3>
            <p className="text-xs text-ink-muted">
              VEXO no calcula IVA de importación desde la factura del proveedor.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="importDuaType">
                  Documento aduanero
                </label>
                <select
                  id="importDuaType"
                  name="importDuaType"
                  className="input"
                  defaultValue={expense?.importDuaType ?? "DUA"}
                >
                  <option value="DUA">DUA</option>
                  <option value="OTHER">Otro documento aduanero</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="importDuaNumber">
                  Número
                </label>
                <input
                  id="importDuaNumber"
                  name="importDuaNumber"
                  className="input font-mono"
                  value={importDuaNumber}
                  onChange={(e) => setImportDuaNumber(e.target.value)}
                  placeholder="Referencia DUA"
                />
              </div>
              <div>
                <label className="label" htmlFor="importDuaDate">
                  Fecha documento
                </label>
                <DateInput
                  id="importDuaDate"
                  name="importDuaDate"
                  value={importDuaDate}
                  onChange={setImportDuaDate}
                />
              </div>
              <div>
                <label className="label" htmlFor="importDuaBase">
                  Base IVA importación
                </label>
                <input
                  id="importDuaBase"
                  name="importDuaBase"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={importDuaBase}
                  onChange={(e) =>
                    setImportDuaBase(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="importDuaVat">
                  IVA importación
                </label>
                <input
                  id="importDuaVat"
                  name="importDuaVat"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={importDuaVat}
                  onChange={(e) =>
                    setImportDuaVat(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div>
              <span className="label">Clasificación en el 303</span>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="importKindUi"
                    checked={!isInvestment}
                    onChange={() => setIsInvestment(false)}
                  />
                  Gasto corriente (32/33)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="importKindUi"
                    checked={isInvestment}
                    onChange={() => setIsInvestment(true)}
                  />
                  Bien de inversión (34/35)
                </label>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="importDuaDocumentFile">
                Adjuntar documento aduanero (PDF/imagen)
              </label>
              <input
                id="importDuaDocumentFile"
                name="importDuaDocumentFile"
                type="file"
                accept="application/pdf,image/*"
                className="input"
              />
              <input
                type="hidden"
                name="importDuaDocumentId"
                value={importDuaDocumentId ?? ""}
              />
              {importDuaDocumentId ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Documento asociado:{" "}
                  <a
                    href={fiscalDocumentHref(importDuaDocumentId)}
                    className="text-accent underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ver DUA
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="subtotal">
              {reverseCharge
                ? importService
                  ? "Importe en € (convertido si venía en USD)"
                  : "Importe factura UE (base)"
                : "Base imponible"}
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
              {reverseCharge ? "Tipo IVA español" : "IVA %"}
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
              {importService
                ? "Cuota a autorrepercutir (no va en la factura)"
                : reverseCharge
                  ? "Cuota a declarar en el 303"
                  : "Cuota IVA"}
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
            {reverseCharge
              ? importService
                ? "Importe bruto documento (USD→€)"
                : "Importe bruto documento (pagas al proveedor)"
              : "Total bruto documento"}
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
          <p className="mt-1 text-xs text-ink-muted">
            Bruto = base + IVA (o solo base en reverse charge). No incluye el
            efecto de la retención practicada.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-line/15 p-4">
          <div>
            <label className="label" htmlFor="leaseId">
              Vincular a local arrendado
            </label>
            <select
              id="leaseId"
              name="leaseId"
              className="input"
              value={leaseId}
              onChange={(e) => applyLeaseSelection(e.target.value)}
            >
              <option value="">— No es alquiler de local —</option>
              {leases.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              No se infiere por categoría. Al seleccionar un local se prellenan
              arrendador / NIF / retención declarada del local (revisables).
            </p>
            {selectedLease?.withholdingStatus === "UNKNOWN" ? (
              <p className="mt-2 text-xs text-amber-800">
                Este local tiene retención «No lo sé». Revisa el local en{" "}
                <Link href="/fiscal/leases" className="underline">
                  Alquileres
                </Link>
                .
              </p>
            ) : null}
            {selectedLease?.withholdingStatus === "NO" ? (
              <p className="mt-2 text-xs text-ink-muted">
                Local declarado sin retención: no se creará FiscalWithholding
                RENT.
              </p>
            ) : null}
          </div>

          {rentWithholdingYes ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="sm:col-span-2 text-xs text-ink-muted">
                Retención de alquiler (PRACTICED / RENT) según el local. Editable
                por documento.
              </p>
              <div>
                <label className="label" htmlFor="withholdingBase">
                  Base sujeta a retención
                </label>
                <input
                  id="withholdingBase"
                  name="withholdingBase"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={withholdingBase}
                  onChange={(e) => {
                    setWithholdingBase(parseFloat(e.target.value) || 0);
                    setWithholdingAmountManual(null);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="withholdingRate">
                  Tipo de retención %
                </label>
                <input
                  id="withholdingRate"
                  name="withholdingRate"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={withholdingRate}
                  onChange={(e) => {
                    setWithholdingRate(parseFloat(e.target.value) || 0);
                    setWithholdingAmountManual(null);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="withholdingAmount">
                  Retención
                </label>
                <input
                  id="withholdingAmount"
                  name="withholdingAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={withholdingAmount}
                  onChange={(e) =>
                    setWithholdingAmountManual(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="amountPayableRent">
                  Importe neto a pagar
                </label>
                <input
                  id="amountPayableRent"
                  type="number"
                  step="0.01"
                  className="input font-mono"
                  value={amountPayable}
                  readOnly
                />
              </div>
              <div>
                <label className="label" htmlFor="withholdingPaymentDate">
                  Fecha de pago (opcional)
                </label>
                <DateInput
                  id="withholdingPaymentDate"
                  name="withholdingPaymentDate"
                  value={withholdingPaymentDate}
                  onChange={(e) => setWithholdingPaymentDate(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        {!leaseId ? (
        <div className="space-y-3 rounded-lg border border-line bg-line/15 p-4">
          <div>
            <span className="label">
              ¿Esta factura está sujeta a retención IRPF practicada?
            </span>
            <p className="mt-1 text-xs text-ink-muted">
              Esta es una retención que tú practicas al proveedor y que
              posteriormente puede formar parte del Modelo 111. No es el
              porcentaje de gasto deducible.
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["NO", "No"],
                  ["YES", "Sí"],
                  ["UNKNOWN", "No lo sé"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="practicedWithholdingStatus"
                    value={value}
                    checked={practicedWithholdingStatus === value}
                    onChange={() => {
                      setPracticedWithholdingStatus(value);
                      if (value === "YES") {
                        setWithholdingBase(subtotal);
                        setWithholdingAmountManual(null);
                      }
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {practicedWithholdingStatus === "UNKNOWN" ? (
              <p className="mt-2 text-xs text-amber-800">
                Sin confirmar: revisa si el profesional está sujeto a retención.
                No se creará obligación 111 automáticamente.
              </p>
            ) : null}
          </div>

          {practicedWithholdingStatus === "YES" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="withholdingBase">
                  Base sujeta a retención
                </label>
                <input
                  id="withholdingBase"
                  name="withholdingBase"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={withholdingBase}
                  onChange={(e) => {
                    setWithholdingBase(parseFloat(e.target.value) || 0);
                    setWithholdingAmountManual(null);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="withholdingRate">
                  Tipo de retención %
                </label>
                <input
                  id="withholdingRate"
                  name="withholdingRate"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={withholdingRate}
                  onChange={(e) => {
                    setWithholdingRate(parseFloat(e.target.value) || 0);
                    setWithholdingAmountManual(null);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="withholdingAmount">
                  Retención
                </label>
                <input
                  id="withholdingAmount"
                  name="withholdingAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input font-mono"
                  value={withholdingAmount}
                  onChange={(e) =>
                    setWithholdingAmountManual(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="amountPayableDisplay">
                  Importe neto a pagar
                </label>
                <input
                  id="amountPayableDisplay"
                  type="number"
                  step="0.01"
                  className="input font-mono"
                  value={amountPayable}
                  readOnly
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="withholdingPaymentDate">
                  Fecha de pago (opcional)
                </label>
                <DateInput
                  id="withholdingPaymentDate"
                  name="withholdingPaymentDate"
                  value={withholdingPaymentDate}
                  onChange={(e) => setWithholdingPaymentDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  La fecha de factura se usa como referencia de periodo; la
                  regla legal del Modelo 111 se fijará más adelante.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        ) : (
          <input type="hidden" name="practicedWithholdingStatus" value="NO" />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="irpfDeductiblePct">
              % gasto computable IRPF (130)
            </label>
            <input
              id="irpfDeductiblePct"
              name="irpfDeductiblePct"
              type="number"
              min={0}
              max={100}
              step={1}
              className="input font-mono"
              value={irpfDeductiblePct}
              onChange={(e) =>
                setIrpfDeductiblePct(
                  Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                )
              }
            />
            <p className="mt-1 text-xs text-ink-muted">
              Incluye IVA no deducible como coste cuando IRPF &gt; 0
            </p>
          </div>
          <div>
            <label className="label" htmlFor="vatDeductiblePct">
              % IVA soportado deducible (303)
            </label>
            <input
              id="vatDeductiblePct"
              name="vatDeductiblePct"
              type="number"
              min={0}
              max={100}
              step={1}
              className="input font-mono"
              value={vatDeductiblePct}
              onChange={(e) =>
                setVatDeductiblePct(
                  Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                )
              }
            />
            <p className="mt-1 text-xs text-ink-muted">
              En AIB: cuota 11 siempre; casilla 37 = este %
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="isInvestment"
            value="1"
            checked={isInvestment}
            onChange={(e) => setIsInvestment(e.target.checked)}
            className="mt-0.5 rounded border-line"
          />
          <span>
            <span className="font-medium text-ink">Bien de inversión</span>
            <span className="block text-ink-muted">
              {importGoods
                ? "Para importaciones usa la clasificación del bloque DUA (32/33 vs 34/35)."
                : "Equipo / máquina con vida útil > 1 año. El 130 no descuenta la compra entera: solo la amortización anual. Interior → casillas 30/31 del 303. Intracom → AIB en el gasto. Se crea en Fiscal → Bienes."}
            </span>
          </span>
        </label>

        {isInvestment && !importGoods ? (
          <div>
            <label className="label" htmlFor="usefulLifeYears">
              Años de vida útil
            </label>
            <input
              id="usefulLifeYears"
              name="usefulLifeYears"
              type="number"
              min={1}
              max={40}
              className="input w-28"
              value={usefulLifeYears}
              onChange={(e) =>
                setUsefulLifeYears(parseInt(e.target.value, 10) || 4)
              }
            />
          </div>
        ) : null}

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
