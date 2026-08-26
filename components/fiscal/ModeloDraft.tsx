import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
import type { FiscalPeriodSummary } from "@/lib/fiscal";
import { CopyableBoxes } from "@/components/fiscal/CopyableBoxes";

type Props = {
  title: string;
  model: "303" | "130";
  summary: FiscalPeriodSummary;
};

export function ModeloDraft({ title, model, summary }: Props) {
  const draft = model === "303" ? summary.modelo303 : summary.modelo130;
  const expensesYtd =
    model === "130"
      ? (draft.boxes.find((b) => b.code === "02")?.value ?? 0) === 0
      : false;
  const missingExpenses =
    model === "303" ? summary.expenses.count === 0 : expensesYtd;
  const resultPositive = draft.result >= 0;

  const resultTitle = resultPositive
    ? "Resultado estimado a ingresar"
    : "Resultado estimado a compensar / devolver";

  const how =
    model === "303"
      ? "Se calcula solo con facturas + marketplace + gastos del trimestre (IVA/AIB siempre)."
      : "Acumulado desde el 1 de enero: casillas 01–19 según instrucciones AEAT (20 %, minoraciones, pagos previos, retenciones).";

  return (
    <section className="card-panel space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="form-section-title">{title}</h2>
        <p className="form-section-hint">
          Periodo {summary.label}. {how} Usa{" "}
          <Link href="/fiscal/guide" className="text-accent underline">
            Guía de presentación
          </Link>{" "}
          para el paso a paso.
        </p>
      </div>

      {missingExpenses ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          {model === "130"
            ? "Aún no hay gastos deducibles en el acumulado del año. Sin ellos el 130 sale más alto."
            : "Aún no hay gastos en este trimestre. Sin ellos el IVA a pagar sale más alto."}{" "}
          <Link href="/fiscal/expenses" className="font-medium underline">
            Registrar gastos
          </Link>
        </p>
      ) : null}

      <CopyableBoxes
        boxes={draft.boxes}
        result={draft.result}
        resultLabel={resultTitle}
      />

      <p className="text-xs text-ink-muted">
        Orientativo: {formatCurrency(Math.abs(draft.result))}
        {missingExpenses ? " (incompleto)" : ""} · no sustituye el modelo AEAT
      </p>
    </section>
  );
}
