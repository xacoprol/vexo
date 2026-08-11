import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
import type { FilingBox } from "@/lib/gemini-fiscal-filing";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  modelLabel: string;
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
  draftResult: number;
  draftBoxes: FilingBox[];
  incomeBase?: number | null;
  expensesBase?: number | null;
  vatRepercutida?: number | null;
  vatDeductible?: number | null;
  presented: {
    result: number;
    boxes: FilingBox[];
    sourceFileName: string | null;
    notes: string | null;
  } | null;
  filingsHref?: string;
};

export function FilingCompare({
  modelLabel,
  modelType,
  year,
  quarter,
  draftResult,
  draftBoxes,
  incomeBase = null,
  expensesBase = null,
  vatRepercutida = null,
  vatDeductible = null,
  presented,
  filingsHref = "/fiscal/filings",
}: Props) {
  if (!presented) {
    return (
      <section className="card-panel space-y-3 p-5">
        <h2 className="form-section-title">Presentado en Vexo</h2>
        <p className="text-sm text-ink-muted">
          Aún no hay un {modelLabel} presentado para este periodo. Tras
          enviarlo en la sede AEAT, márcalo aquí o{" "}
          <Link href={filingsHref} className="text-accent underline">
            sube el PDF
          </Link>
          .
        </p>
        <MarkPresentedForm
          modelType={modelType}
          year={year}
          quarter={quarter}
          draftResult={draftResult}
          boxes={draftBoxes}
          incomeBase={incomeBase}
          expensesBase={expensesBase}
          vatRepercutida={vatRepercutida}
          vatDeductible={vatDeductible}
        />
      </section>
    );
  }

  const diff = Math.round((presented.result - draftResult + Number.EPSILON) * 100) / 100;
  const absDiff = Math.abs(diff);

  return (
    <section className="card-panel space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="form-section-title">Presentado vs borrador</h2>
          <p className="form-section-hint">
            Registrado en Vexo
            {presented.sourceFileName
              ? ` · ${presented.sourceFileName}`
              : ""}
          </p>
        </div>
        <Link href={filingsHref} className="text-xs text-accent hover:underline">
          Ver presentados
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line/60 p-3">
          <p className="text-xs text-ink-muted">Borrador panel</p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {formatCurrency(draftResult)}
          </p>
        </div>
        <div className="rounded-lg border border-line/60 p-3">
          <p className="text-xs text-ink-muted">Presentado</p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {formatCurrency(presented.result)}
          </p>
        </div>
        <div className="rounded-lg border border-line/60 p-3">
          <p className="text-xs text-ink-muted">Diferencia</p>
          <p
            className={`mt-1 font-mono text-lg font-semibold ${
              absDiff < 0.05
                ? "text-success"
                : "text-warning"
            }`}
          >
            {absDiff < 0.05
              ? "Cuadra"
              : `${diff > 0 ? "+" : "−"}${formatCurrency(absDiff)}`}
          </p>
        </div>
      </div>

      {presented.boxes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Casilla</th>
                <th className="px-2 py-2 text-left font-medium">Concepto</th>
                <th className="px-2 py-2 text-right font-medium">Presentado</th>
              </tr>
            </thead>
            <tbody>
              {presented.boxes.map((b, i) => (
                <tr
                  key={`${b.code}-${i}`}
                  className="border-b border-line/50"
                >
                  <td className="px-2 py-2 font-mono text-ink-muted">
                    {b.code}
                  </td>
                  <td className="px-2 py-2">{b.label}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {formatCurrency(b.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {presented.notes ? (
        <p className="text-xs text-ink-muted">{presented.notes}</p>
      ) : null}
    </section>
  );
}
