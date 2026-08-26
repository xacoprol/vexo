"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/calculations";
import { DateInput } from "@/components/ui/DateInput";
import {
  upsertFiscalFiling,
  type FilingDraftInput,
} from "@/app/(app)/fiscal/filings/actions";
import { checkFiscalFilingGate } from "@/app/(app)/fiscal/health/actions";
import type {
  FiscalModelType,
  FilingBox,
} from "@/lib/gemini-fiscal-filing";
import { paymentHrefForFiling } from "@/lib/fiscal-payments";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
  draftResult: number;
  boxes: FilingBox[];
  incomeBase?: number | null;
  expensesBase?: number | null;
  vatRepercutida?: number | null;
  vatDeductible?: number | null;
  rawExtract?: Record<string, unknown> | null;
};

export function MarkPresentedForm({
  modelType,
  year,
  quarter,
  draftResult,
  boxes,
  incomeBase = null,
  expensesBase = null,
  vatRepercutida = null,
  vatDeductible = null,
  rawExtract = null,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filedAt, setFiledAt] = useState(todayInput());
  const [result, setResult] = useState(String(draftResult));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="btn-secondary text-sm"
        onClick={() => setOpen(true)}
      >
        Marcar como presentado
      </button>
    );
  }

  function submit() {
    setError(null);
    const resultNum = Number(String(result).replace(",", "."));
    if (!Number.isFinite(resultNum)) {
      setError("Resultado no válido");
      return;
    }

    startTransition(async () => {
      const gate = await checkFiscalFilingGate({
        modelType,
        year,
        quarter,
      });
      if (!gate.allowed) {
        const titles = gate.blockers.map((b) => b.title).join(" · ");
        setError(
          titles
            ? `No se puede marcar como presentado: ${titles}`
            : "La salud fiscal del período no está lista. Revisa /fiscal/health."
        );
        return;
      }

      const input: FilingDraftInput = {
      modelType,
      year,
      quarter,
      filedAt: filedAt || todayInput(),
      result: resultNum,
      incomeBase,
      expensesBase,
      vatRepercutida,
      vatDeductible,
      boxes,
      notes: notes.trim() || "Registrado manualmente desde borrador Vexo",
      confidence: "high",
      sourceFileName: null,
      rawExtract: rawExtract ?? { source: "manual-mark-presented" },
    };

      const res = await upsertFiscalFiling(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (
        (modelType === "303" || modelType === "130") &&
        resultNum > 0
      ) {
        router.push(
          paymentHrefForFiling({
            filingId: res.id,
            modelType,
            year,
            quarter,
            amount: resultNum,
          })
        );
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-line/60 p-3">
      <p className="text-sm text-ink-muted">
        Tras presentar en la sede AEAT, registra aquí el resultado. Se guardan
        las casillas del borrador Vexo (puedes ajustar el resultado si AEAT
        difiere unos céntimos).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="mark-filedAt">
            Fecha presentación
          </label>
          <DateInput
            id="mark-filedAt"
            value={filedAt}
            onChange={(e) => setFiledAt(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="mark-result">
            Resultado (a ingresar / compensar)
          </label>
          <input
            id="mark-result"
            type="number"
            step="0.01"
            className="input"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            Borrador: {formatCurrency(draftResult)}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="mark-notes">
            Notas (opcional)
          </label>
          <input
            id="mark-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="NRC, CSV, etc."
          />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={pending}
          onClick={submit}
        >
          {pending ? "Guardando…" : "Confirmar presentado"}
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
