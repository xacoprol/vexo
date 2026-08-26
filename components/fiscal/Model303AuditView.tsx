"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { ModeloBoxes } from "@/lib/fiscal";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { FiscalQuarter } from "@/lib/fiscal";
import {
  buildCompensationDisplay,
  buildFiscalSummary,
  comparePresentedVsDraft,
  getOutcomeDisplay,
  getTraceForBox,
  groupBoxesForDisplay,
  humanizeWarnings,
  parseScopeLimitations,
  sourceDocumentHref,
  traceLineAmount,
} from "@/lib/modelo-303/presentation";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  quarter: FiscalQuarter;
  periodLabel: string;
  modelo303: ModeloBoxes;
  presented: PresentedFilingView | null;
  expensesCount: number;
  incomeBase: number;
  expensesBase: number;
  vatRepercutida: number;
  vatDeductible: number;
};

function outcomeBadgeClass(
  outcome: ReturnType<typeof getOutcomeDisplay>["outcome"]
): string {
  switch (outcome) {
    case "TO_PAY":
      return "bg-accent-soft text-accent";
    case "TO_COMPENSATE":
      return "bg-warning/15 text-warning";
    case "ZERO":
      return "bg-line/50 text-ink-muted";
    case "NO_ACTIVITY":
      return "bg-line/40 text-ink-muted";
    default:
      return "bg-line/40 text-ink-muted";
  }
}

function formatBoxAmount(code: string, value: number): string {
  if (code === "02" || code === "05" || code === "08") {
    return `${value} %`;
  }
  return formatCurrency(value);
}

export function Model303AuditView({
  year,
  quarter,
  periodLabel,
  modelo303,
  presented,
  expensesCount,
  incomeBase,
  expensesBase,
  vatRepercutida,
  vatDeductible,
}: Props) {
  const [showAllBoxes, setShowAllBoxes] = useState(false);
  const [openBox, setOpenBox] = useState<string | null>(null);

  const boxes = modelo303.boxes;
  const trace = modelo303.trace303;
  const warnings = modelo303.warnings ?? [];
  const outcome = getOutcomeDisplay(modelo303.outcome303, modelo303.result);
  const fiscalSummary = buildFiscalSummary(boxes);
  const compensation = buildCompensationDisplay(
    boxes,
    modelo303.currentPeriodNegative
  );
  const warningItems = humanizeWarnings(warnings);
  const sections = groupBoxesForDisplay(boxes, trace, showAllBoxes);
  const scopeItems = parseScopeLimitations(modelo303.scopeNote, warnings);
  const compare = presented
    ? comparePresentedVsDraft(presented.result, modelo303.result)
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Modelo 303
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{periodLabel}</h2>
        </div>
        <span
          className={`badge ${presented ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
        >
          {presented ? "PRESENTADO" : "BORRADOR"}
        </span>
      </header>

      <section className="card-panel p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Resultado
        </p>
        {outcome.amount != null ? (
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
            {formatCurrency(outcome.amount)}
          </p>
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {outcome.headline}
          </p>
        )}
        <p
          className={`mt-3 inline-flex badge text-sm ${outcomeBadgeClass(outcome.outcome)}`}
        >
          {outcome.headline}
        </p>
        <p className="mt-2 text-sm text-ink-muted">{outcome.sublabel}</p>
        <p className="mt-3 text-xs text-ink-muted">
          Casilla 71 · fuente del motor (sin reinterpretar signos en pantalla)
        </p>
      </section>

      {warningItems.length > 0 ? (
        <section className="card-panel space-y-3 border-warning/30 p-5">
          <p className="text-sm font-medium text-warning">
            ⚠ {warningItems.length}{" "}
            {warningItems.length === 1
              ? "elemento necesita revisión"
              : "elementos necesitan revisión"}
          </p>
          <ul className="space-y-3">
            {warningItems.map((w) => (
              <li
                key={`${w.code}-${w.sourceId ?? w.title}`}
                className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2.5"
              >
                <p className="text-sm font-medium text-ink">{w.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{w.explanation}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {w.sourceId ? (
                    <span className="text-xs text-ink-muted">
                      Documento: {w.sourceId.slice(0, 8)}…
                    </span>
                  ) : null}
                  {w.cta ? (
                    <Link
                      href={w.cta.href}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {w.cta.label}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {presented && compare ? (
        <section className="card-panel space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="form-section-title">Presentado vs motor actual</h3>
            <Link
              href="/fiscal/filings"
              className="text-xs text-accent hover:underline"
            >
              Ver presentados
            </Link>
          </div>
          {presented.sourceFileName ? (
            <p className="form-section-hint">{presented.sourceFileName}</p>
          ) : null}
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line/60 p-3">
              <dt className="text-xs text-ink-muted">Resultado presentado</dt>
              <dd className="mt-1 font-mono text-lg font-semibold">
                {formatCurrency(compare.presentedResult)}
              </dd>
            </div>
            <div className="rounded-lg border border-line/60 p-3">
              <dt className="text-xs text-ink-muted">Motor actual</dt>
              <dd className="mt-1 font-mono text-lg font-semibold">
                {formatCurrency(compare.draftResult)}
              </dd>
            </div>
            <div className="rounded-lg border border-line/60 p-3">
              <dt className="text-xs text-ink-muted">Diferencia</dt>
              <dd
                className={`mt-1 font-mono text-lg font-semibold ${
                  compare.matches ? "text-success" : "text-warning"
                }`}
              >
                {compare.matches
                  ? "Coincide con el cálculo actual ✅"
                  : formatCurrency(compare.difference)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-ink-muted">
            El Modelo 303 presentado en Vexo es la verdad histórica; el motor
            actual no lo sobrescribe.
          </p>
        </section>
      ) : (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Registrar presentación</h3>
          <p className="text-sm text-ink-muted">
            Tras enviarlo en la sede AEAT, márcalo aquí o{" "}
            <Link href="/fiscal/filings" className="text-accent underline">
              sube el PDF
            </Link>
            .
          </p>
          {expensesCount === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
              Aún no hay gastos en este trimestre. Sin ellos el IVA a pagar
              puede salir más alto.{" "}
              <Link href="/fiscal/expenses" className="font-medium underline">
                Registrar gastos
              </Link>
            </p>
          ) : null}
          <MarkPresentedForm
            modelType="303"
            year={year}
            quarter={quarter}
            draftResult={modelo303.result}
            boxes={boxes}
            incomeBase={incomeBase}
            expensesBase={expensesBase}
            vatRepercutida={vatRepercutida}
            vatDeductible={vatDeductible}
          />
        </section>
      )}

      <section className="card-panel p-5">
        <h3 className="form-section-title">Resumen fiscal</h3>
        <p className="form-section-hint">
          Importes leídos de las casillas oficiales del motor
        </p>
        <dl className="mt-4 space-y-2">
          {fiscalSummary.map((row) => (
            <div
              key={row.boxCode}
              className="flex items-baseline justify-between gap-4 border-b border-line/40 py-2 text-sm last:border-0"
            >
              <dt className="text-ink-muted">
                {row.label}{" "}
                <span className="font-mono text-xs">({row.boxCode})</span>
              </dt>
              <dd className="font-mono font-medium">
                {formatCurrency(row.value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {(compensation.priorPending > 0 ||
        compensation.appliedThisPeriod > 0 ||
        compensation.pendingForFuture > 0 ||
        compensation.newNegativeThisPeriod != null) && (
        <section className="card-panel p-5">
          <h3 className="form-section-title">Compensaciones</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-ink-muted">
                Saldo pendiente anterior{" "}
                <span className="font-mono text-xs">(110)</span>
              </dt>
              <dd className="font-mono font-medium">
                {formatCurrency(compensation.priorPending)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-ink-muted">
                Aplicado este trimestre{" "}
                <span className="font-mono text-xs">(78)</span>
              </dt>
              <dd className="font-mono font-medium">
                {formatCurrency(compensation.appliedThisPeriod)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-ink-muted">
                Pendiente para futuro{" "}
                <span className="font-mono text-xs">(87)</span>
              </dt>
              <dd className="font-mono font-medium">
                {formatCurrency(compensation.pendingForFuture)}
              </dd>
            </div>
            {compensation.newNegativeThisPeriod != null ? (
              <div className="flex justify-between gap-4 border-t border-line/40 py-2">
                <dt className="text-ink-muted">
                  Nuevo saldo generado este trimestre
                </dt>
                <dd className="font-mono font-medium">
                  {formatCurrency(compensation.newNegativeThisPeriod)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            La casilla 87 solo refleja saldo de periodos anteriores. El saldo
            nuevo del trimestre no se etiqueta como casilla 70.
          </p>
        </section>
      )}

      <section className="card-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="form-section-title">Casillas del modelo</h3>
            <p className="form-section-hint">
              Solo casillas con importe o trazabilidad. Pulsa una casilla para
              ver operaciones.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setShowAllBoxes((v) => !v)}
          >
            {showAllBoxes ? "Ocultar vacías" : "Ver todas las casillas"}
          </button>
        </div>

        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {section.title}
            </h4>
            <div className="overflow-x-auto rounded-lg border border-line/60">
              <table className="w-full min-w-[320px] text-sm">
                <tbody>
                  {section.boxes.map((box, idx) => {
                    const traceLines = getTraceForBox(trace, box.code);
                    const hasTrace = traceLines.length > 0;
                    const rowKey = `${section.title}-${box.code}-${box.label}-${idx}`;
                    const isOpen = openBox === rowKey;
                    return (
                      <Fragment key={rowKey}>
                        <tr
                          className={`border-b border-line/40 ${hasTrace ? "cursor-pointer hover:bg-accent-soft/30" : ""}`}
                          onClick={() =>
                            hasTrace
                              ? setOpenBox(isOpen ? null : rowKey)
                              : undefined
                          }
                        >
                          <td className="w-12 px-3 py-2.5 font-mono text-xs text-ink-muted">
                            {box.code}
                          </td>
                          <td className="px-3 py-2.5">
                            <span>{box.label}</span>
                            {hasTrace ? (
                              <span className="ml-2 text-xs text-accent">
                                {isOpen ? "▲" : "▼"} {traceLines.length}{" "}
                                {traceLines.length === 1 ? "op." : "ops."}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                            {formatBoxAmount(box.code, box.value)}
                          </td>
                        </tr>
                        {isOpen && hasTrace ? (
                          <tr className="bg-bg/60">
                            <td colSpan={3} className="px-3 py-3">
                              <ul className="space-y-2">
                                {traceLines.map((line, lineIdx) => {
                                  const amount = traceLineAmount(
                                    line,
                                    box.code
                                  );
                                  const docLink = sourceDocumentHref(
                                    line.sourceType,
                                    line.sourceId
                                  );
                                  return (
                                    <li
                                      key={`${line.sourceId ?? line.description}-${lineIdx}`}
                                      className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line/50 px-3 py-2"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                          {line.description}
                                        </p>
                                        <p className="mt-0.5 text-xs text-ink-muted">
                                          {line.vatKind}
                                          {line.vatRate != null
                                            ? ` · ${line.vatRate} %`
                                            : ""}
                                          {line.vatNonDeductible != null &&
                                          line.vatNonDeductible > 0
                                            ? ` · no deducible ${formatCurrency(line.vatNonDeductible)}`
                                            : ""}
                                        </p>
                                        {docLink ? (
                                          <Link
                                            href={docLink.href}
                                            className="mt-1 inline-block text-xs text-accent hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {docLink.label}
                                          </Link>
                                        ) : null}
                                      </div>
                                      <p className="font-mono text-sm font-medium whitespace-nowrap">
                                        {formatBoxAmount(box.code, amount)}
                                      </p>
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      {scopeItems.length > 0 ? (
        <section className="rounded-xl border border-line/60 bg-bg px-4 py-3">
          <h3 className="text-sm font-medium text-ink-muted">
            Revisión necesaria
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {scopeItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
