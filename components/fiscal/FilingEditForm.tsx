"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/calculations";
import { DateInput } from "@/components/ui/DateInput";
import {
  upsertFiscalFiling,
  type FilingDraftInput,
} from "@/app/(app)/fiscal/filings/actions";
import type {
  FiscalModelType,
  FilingBox,
} from "@/lib/gemini-fiscal-filing";
import { isAnnualOrCensusModel } from "@/lib/gemini-fiscal-filing";

export type FilingEditInitial = {
  id: string;
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
  filedAt: string | null;
  result: number;
  incomeBase: number | null;
  expensesBase: number | null;
  vatRepercutida: number | null;
  vatDeductible: number | null;
  boxes: FilingBox[];
  notes: string | null;
  sourceFileName: string | null;
  confidence: string;
};

type Props = {
  initial: FilingEditInitial;
};

function numOrEmpty(n: number | null): string {
  return n == null ? "" : String(n);
}

export function FilingEditForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [filedAt, setFiledAt] = useState(initial.filedAt ?? "");
  const [result, setResult] = useState(String(initial.result));
  const [incomeBase, setIncomeBase] = useState(numOrEmpty(initial.incomeBase));
  const [expensesBase, setExpensesBase] = useState(
    numOrEmpty(initial.expensesBase)
  );
  const [vatRepercutida, setVatRepercutida] = useState(
    numOrEmpty(initial.vatRepercutida)
  );
  const [vatDeductible, setVatDeductible] = useState(
    numOrEmpty(initial.vatDeductible)
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [boxes, setBoxes] = useState<FilingBox[]>(initial.boxes);

  const periodLocked = `${initial.modelType} · ${
    isAnnualOrCensusModel(initial.modelType) || initial.quarter == null
      ? `Año ${initial.year}`
      : `${initial.quarter}T ${initial.year}`
  }`;

  function parseOpt(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function updateBox(i: number, patch: Partial<FilingBox>) {
    setBoxes((prev) =>
      prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b))
    );
  }

  function submit() {
    setError(null);
    const resultNum = Number(String(result).replace(",", "."));
    if (!Number.isFinite(resultNum)) {
      setError("Resultado no válido");
      return;
    }

    const input: FilingDraftInput = {
      modelType: initial.modelType,
      year: initial.year,
      quarter: initial.quarter,
      filedAt: filedAt || null,
      result: resultNum,
      incomeBase: parseOpt(incomeBase),
      expensesBase: parseOpt(expensesBase),
      vatRepercutida: parseOpt(vatRepercutida),
      vatDeductible: parseOpt(vatDeductible),
      boxes,
      notes: notes.trim() || null,
      confidence: initial.confidence || "medium",
      sourceFileName: initial.sourceFileName,
      rawExtract: { source: "manual-edit", filingId: initial.id },
    };

    startTransition(async () => {
      const res = await upsertFiscalFiling(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/fiscal/filings");
      router.refresh();
    });
  }

  return (
    <div className="card-panel mx-auto max-w-3xl space-y-4 p-5">
      <p className="text-sm text-ink-muted">
        Periodo bloqueado: <span className="font-mono">{periodLocked}</span>.
        Para cambiar modelo/trimestre, borra y vuelve a registrar.
      </p>

      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor="filedAt">
            Fecha presentación
          </label>
          <DateInput
            id="filedAt"
            value={filedAt}
            onChange={(e) => setFiledAt(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="result">
            Resultado
          </label>
          <input
            id="result"
            type="number"
            step="0.01"
            className="input font-mono"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            {formatCurrency(Number(result) || 0)}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="incomeBase">
            Ingresos (base)
          </label>
          <input
            id="incomeBase"
            type="number"
            step="0.01"
            className="input font-mono"
            value={incomeBase}
            onChange={(e) => setIncomeBase(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="expensesBase">
            Gastos (base)
          </label>
          <input
            id="expensesBase"
            type="number"
            step="0.01"
            className="input font-mono"
            value={expensesBase}
            onChange={(e) => setExpensesBase(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="vatRepercutida">
            IVA repercutido
          </label>
          <input
            id="vatRepercutida"
            type="number"
            step="0.01"
            className="input font-mono"
            value={vatRepercutida}
            onChange={(e) => setVatRepercutida(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="vatDeductible">
            IVA soportado
          </label>
          <input
            id="vatDeductible"
            type="number"
            step="0.01"
            className="input font-mono"
            value={vatDeductible}
            onChange={(e) => setVatDeductible(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="notes">
            Notas
          </label>
          <input
            id="notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-2 py-1 text-left">Casilla</th>
              <th className="px-2 py-1 text-left">Concepto</th>
              <th className="px-2 py-1 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((b, i) => (
              <tr key={`${b.code}-${i}`} className="border-b border-line/40">
                <td className="px-2 py-1">
                  <input
                    className="input font-mono py-1 text-xs"
                    value={b.code}
                    onChange={(e) => updateBox(i, { code: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    className="input py-1 text-xs"
                    value={b.label}
                    onChange={(e) => updateBox(i, { label: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    step="0.01"
                    className="input py-1 text-right font-mono text-xs"
                    value={b.value}
                    onChange={(e) =>
                      updateBox(i, {
                        value: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {boxes.length === 0 ? (
          <p className="px-2 py-4 text-sm text-ink-muted">
            Sin casillas guardadas. El resultado y las bases bastan para el
            histórico.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={submit}
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <Link href="/fiscal/filings" className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </div>
  );
}
