"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/calculations";
import {
  RECTIFICATION_CAUSE_OPTIONS,
  RECTIFICATION_LEGAL_OPTIONS,
  RECTIFICATION_METHOD,
  suggestedLegalTypesForCause,
  type RectificationCause,
} from "@/lib/invoice-rectification";
import { parseInvoiceKind } from "@/lib/invoice-issuance";
import { createRectificationDraft } from "@/app/(app)/invoices/rectification-actions";

type Props = {
  original: {
    id: string;
    fullNumber: string;
    subtotal: number;
    vatAmount: number;
    total: number;
    invoiceKind: string;
  };
};

export function RectifyInvoiceWizard({ original }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<RectificationCause>("PARTIAL_RETURN");
  const kind = parseInvoiceKind(original.invoiceKind);
  const suggested = suggestedLegalTypesForCause(cause, kind);
  const [legalType, setLegalType] = useState(suggested[0] ?? "R1");
  const [method, setMethod] = useState<"DIFFERENCES" | "SUBSTITUTION">(
    "DIFFERENCES"
  );
  const [correctionSubtotal, setCorrectionSubtotal] = useState("");
  const [correctSubtotal, setCorrectSubtotal] = useState(
    String(original.subtotal)
  );
  const [correctVat, setCorrectVat] = useState(String(original.vatAmount));
  const [correctTotal, setCorrectTotal] = useState(String(original.total));

  const causeOpt = RECTIFICATION_CAUSE_OPTIONS.find((c) => c.code === cause);

  function onCauseChange(next: RectificationCause) {
    setCause(next);
    const opt = RECTIFICATION_CAUSE_OPTIONS.find((c) => c.code === next);
    if (opt) setMethod(opt.suggestedMethod);
    const sug = suggestedLegalTypesForCause(next, kind);
    setLegalType(sug[0] ?? "R1");
    if (next === "TOTAL_RETURN") {
      setCorrectionSubtotal(String(original.subtotal));
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const vatRate =
        original.subtotal > 0
          ? Math.round((original.vatAmount / original.subtotal) * 10000) / 100
          : 21;
      const correctionLines =
        method === "DIFFERENCES"
          ? cause === "TOTAL_RETURN"
            ? [
                {
                  description: `Devolución total — ${original.fullNumber}`,
                  quantity: 1,
                  unitPrice: original.subtotal,
                  vatRate,
                  discountPct: 0,
                },
              ]
            : [
                {
                  description: `Corrección — ${original.fullNumber}`,
                  quantity: 1,
                  unitPrice: parseFloat(correctionSubtotal) || 0,
                  vatRate,
                  discountPct: 0,
                },
              ]
          : undefined;

      const res = await createRectificationDraft({
        originalInvoiceId: original.id,
        cause,
        legalType,
        method,
        correctionLines,
        substitutionCorrect:
          method === "SUBSTITUTION"
            ? {
                subtotal: parseFloat(correctSubtotal) || 0,
                vatAmount: parseFloat(correctVat) || 0,
                total: parseFloat(correctTotal) || 0,
              }
            : undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card-panel space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="form-section-title">Rectificar factura</h2>
        <p className="form-section-hint">
          La original {original.fullNumber} permanece intacta. Se creará una
          rectificativa en serie propia (borrador → emitir).
        </p>
      </div>

      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">¿Qué necesitas corregir?</p>
          {RECTIFICATION_CAUSE_OPTIONS.map((opt) => (
            <label
              key={opt.code}
              className="flex cursor-pointer gap-3 rounded-lg border border-line/60 p-3 hover:bg-accent-soft/20"
            >
              <input
                type="radio"
                name="cause"
                checked={cause === opt.code}
                onChange={() => onCauseChange(opt.code)}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
          <button
            type="button"
            className="btn-primary"
            onClick={() => setStep(2)}
          >
            Continuar
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line/60 p-3 text-sm">
            <p className="font-medium">Original</p>
            <p className="font-mono">
              {original.fullNumber} · {formatCurrency(original.total)}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Tipo legal (R1–R5)</p>
            <p className="text-xs text-ink-muted">
              Debes elegir la causa jurídica; VEXO no la deduce automáticamente.
            </p>
            <select
              className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              value={legalType}
              onChange={(e) => setLegalType(e.target.value)}
            >
              {RECTIFICATION_LEGAL_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              {
                RECTIFICATION_LEGAL_OPTIONS.find((o) => o.code === legalType)
                  ?.description
              }
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Método</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={method === RECTIFICATION_METHOD.DIFFERENCES}
                onChange={() => setMethod("DIFFERENCES")}
              />
              Por diferencias (I)
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={method === RECTIFICATION_METHOD.SUBSTITUTION}
                onChange={() => setMethod("SUBSTITUTION")}
              />
              Por sustitución (S)
            </label>
          </div>

          {method === "DIFFERENCES" && cause !== "TOTAL_RETURN" ? (
            <label className="block text-sm">
              Base a corregir (positiva = importe devuelto/descontado)
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                value={correctionSubtotal}
                onChange={(e) => setCorrectionSubtotal(e.target.value)}
              />
            </label>
          ) : null}

          {method === "SUBSTITUTION" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Base correcta
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={correctSubtotal}
                  onChange={(e) => setCorrectSubtotal(e.target.value)}
                />
              </label>
              <label className="text-sm">
                IVA correcto
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={correctVat}
                  onChange={(e) => setCorrectVat(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Total correcto
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={correctTotal}
                  onChange={(e) => setCorrectTotal(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep(1)}
            >
              Atrás
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => setStep(3)}
            >
              Preview
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line/60 p-4 text-sm">
            <p>
              <span className="text-ink-muted">Original</span>{" "}
              <span className="font-mono">{original.fullNumber}</span>{" "}
              {formatCurrency(original.total)}
            </p>
            <p className="mt-2">
              <span className="text-ink-muted">Rectificativa (borrador)</span>{" "}
              {causeOpt?.label} · {legalType} ·{" "}
              {method === "DIFFERENCES" ? "diferencias" : "sustitución"}
            </p>
          </div>
          {error ? (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep(2)}
            >
              Atrás
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => submit()}
            >
              {pending ? "Creando…" : "Guardar borrador rectificativa"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
