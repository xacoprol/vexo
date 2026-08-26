"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { Modelo347Draft } from "@/lib/fiscal-347-349";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import {
  build347DraftBoxes,
  build347PresentedSnapshot,
  compare347PresentedVsDraft,
  draft347Total,
  humanize347Warnings,
  operationTypeLabel,
} from "@/lib/modelo-347";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  draft: Modelo347Draft;
  presented: PresentedFilingView | null;
};

function compareStatusLabel(
  status: ReturnType<typeof compare347PresentedVsDraft>["rows"][0]["status"]
): string {
  switch (status) {
    case "match":
      return "Cuadra";
    case "new":
      return "Nuevo en motor";
    case "missing":
      return "Ausente en motor";
    case "amount_diff":
      return "Importe distinto";
    case "quarter_diff":
      return "Trimestre distinto";
    default:
      return status;
  }
}

export function Model347AuditView({ year, draft, presented }: Props) {
  const [openOp, setOpenOp] = useState<string | null>(null);
  const warnings = humanize347Warnings(draft.warnings);
  const compare = compare347PresentedVsDraft(draft, presented);
  const draftBoxes = build347DraftBoxes(draft);
  const draftResult = draft347Total(draft);
  const snapshotRaw = {
    model347Snapshot: build347PresentedSnapshot(draft),
    source: "vexo-model347-engine",
  };

  const excluded349 = draft.excludedOperations.filter(
    (e) => e.reason === "EXCLUDED_MODEL349"
  );

  return (
    <div className="space-y-6">
      <section className="card-panel space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {presented ? "Presentado · histórico inmutable" : "Borrador"}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">
              MODELO 347 · {year}
            </h2>
          </div>
          <div className="text-right text-sm">
            <p className="text-ink-muted">Plazo</p>
            <p className="font-medium">{draft.deadline.dueLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <p>
            Operadores declarables:{" "}
            <span className="font-mono font-medium">{draft.declarableCount}</span>
          </p>
          <p>
            Compras:{" "}
            <span className="font-mono font-medium">
              {formatCurrency(draft.purchasesTotal)}
            </span>
          </p>
          <p>
            Ventas:{" "}
            <span className="font-mono font-medium">{formatCurrency(draft.salesTotal)}</span>
          </p>
        </div>

        <p className="text-xs text-ink-muted">
          Umbral: superior a {formatCurrency(draft.thresholdContext.threshold)} por operador
          y tipo (A/B). {draft.thresholdContext.rule}
        </p>

        {draft.requiresReview ? (
          <div className="rounded-lg border border-warning/40 bg-warning/15 px-4 py-3 text-sm">
            <p className="font-medium text-warning">
              Revisión obligatoria antes de cerrar el 347
            </p>
            <p className="mt-1 text-ink-muted">
              Hay operaciones acogidas al criterio de caja para las que VEXO no
              dispone de información suficiente para cerrar el Modelo 347.
            </p>
          </div>
        ) : null}

        {draft.deadline.requiresOfficialCalendarCheck ? (
          <p className="text-xs text-warning">
            El plazo puede depender de festivo AEAT — contrastar con la sede
            electrónica.
          </p>
        ) : null}

        {draft.deadline.scopeNote ? (
          <p className="text-xs text-ink-muted">{draft.deadline.scopeNote}</p>
        ) : null}
      </section>

      {warnings.length > 0 ? (
        <section className="space-y-2">
          {warnings.map((w) => (
            <div
              key={`${w.code}-${w.sourceId ?? w.title}`}
              className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
            >
              <p className="font-medium text-warning">{w.title}</p>
              <p className="mt-1 text-ink-muted">{w.explanation}</p>
              {w.cta ? (
                <Link href={w.cta.href} className="mt-2 inline-block text-accent underline">
                  {w.cta.label}
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {!presented ? (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Marcar presentado</h3>
          <MarkPresentedForm
            modelType="347"
            year={year}
            quarter={null}
            draftResult={draftResult}
            boxes={draftBoxes}
            rawExtract={snapshotRaw}
          />
        </section>
      ) : (
        <section className="card-panel space-y-4 p-5">
          <h3 className="form-section-title">Presentado vs motor actual</h3>
          {compare.legacyDetailWarning ? (
            <p className="text-sm text-warning">LEGACY_347_FILING_DETAIL — sin snapshot por operador.</p>
          ) : null}
          {compare.presentedHasDetail ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">Operador</th>
                    <th className="px-2 py-2 text-left">Tipo</th>
                    <th className="px-2 py-2 text-right">Presentado</th>
                    <th className="px-2 py-2 text-right">Motor</th>
                    <th className="px-2 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.rows.map((r) => (
                    <tr key={`${r.operationType}|${r.taxId}`} className="border-b border-line/50">
                      <td className="px-2 py-2">
                        {r.operatorName}
                        <span className="ml-2 font-mono text-xs text-ink-muted">{r.taxId}</span>
                      </td>
                      <td className="px-2 py-2">{operationTypeLabel(r.operationType as "A" | "B")}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {r.presentedAmount != null ? formatCurrency(r.presentedAmount) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCurrency(r.draftAmount)}
                      </td>
                      <td className="px-2 py-2 text-xs text-ink-muted">
                        {compareStatusLabel(r.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}

      <section className="card-panel space-y-4 p-5">
        <h3 className="form-section-title">Operadores declarables</h3>
        {draft.declarableOperators.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Ningún operador supera {formatCurrency(draft.thresholdContext.threshold)} en {year}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Operador</th>
                  <th className="px-2 py-2 text-left">NIF</th>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-right">Total anual</th>
                  <th className="px-2 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {draft.declarableOperators.map((op) => {
                  const rowKey = `${op.operationType}|${op.taxId}`;
                  const open = openOp === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-line/50">
                        <td className="px-2 py-2">{op.name}</td>
                        <td className="px-2 py-2 font-mono text-xs">{op.taxId}</td>
                        <td className="px-2 py-2">{operationTypeLabel(op.operationType)}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatCurrency(
                            op.cashAccountingAnnualAmount != null &&
                              op.cashAccountingAnnualAmount > 0
                              ? (op.cashAccountingAnnualAmount ?? 0) + op.annualAmount
                              : op.annualAmount
                          )}
                          {op.cashAccountingAnnualAmount != null &&
                          op.cashAccountingAnnualAmount > 0 ? (
                            <span className="block text-xs font-normal text-ink-muted">
                              Devengo {formatCurrency(op.annualAmount)} · RECC{" "}
                              {formatCurrency(op.cashAccountingAnnualAmount)}
                            </span>
                          ) : null}
                          {op.cashPaymentHintAmount ? (
                            <span className="block text-xs font-normal text-warning">
                              Metálico (info): {formatCurrency(op.cashPaymentHintAmount)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs text-accent hover:underline"
                            onClick={() => setOpenOp(open ? null : rowKey)}
                          >
                            {open ? "Ocultar" : "Desglose"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-accent-soft/20">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                              <p>1T: {formatCurrency(op.quarters.q1)}</p>
                              <p>2T: {formatCurrency(op.quarters.q2)}</p>
                              <p>3T: {formatCurrency(op.quarters.q3)}</p>
                              <p>4T: {formatCurrency(op.quarters.q4)}</p>
                            </div>
                            {op.cashAccountingQuarters ? (
                              <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                                <p className="col-span-full text-xs uppercase text-ink-muted">
                                  RECC (por cobro)
                                </p>
                                <p>1T: {formatCurrency(op.cashAccountingQuarters.q1)}</p>
                                <p>2T: {formatCurrency(op.cashAccountingQuarters.q2)}</p>
                                <p>3T: {formatCurrency(op.cashAccountingQuarters.q3)}</p>
                                <p>4T: {formatCurrency(op.cashAccountingQuarters.q4)}</p>
                              </div>
                            ) : null}
                            <ul className="space-y-2 text-sm">
                              {op.trace.map((t) => (
                                <li
                                  key={t.sourceId}
                                  className="flex flex-wrap items-center justify-between gap-2"
                                >
                                  <span>
                                    {t.href ? (
                                      <Link href={t.href} className="text-accent underline">
                                        {t.label}
                                      </Link>
                                    ) : (
                                      t.label
                                    )}
                                    <span className="ml-2 text-ink-muted">
                                      {t.issueDate} · {t.quarter}T
                                    </span>
                                  </span>
                                  <span className="font-mono">{formatCurrency(t.amount)}</span>
                                </li>
                              ))}
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
        )}
      </section>

      {draft.excludedOperations.length > 0 ? (
        <details className="card-panel px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium">
            Operaciones excluidas ({draft.excludedOperations.length})
            {excluded349.length > 0 ? ` · ${excluded349.length} en Modelo 349` : ""}
          </summary>
          <ul className="mt-4 space-y-2 text-sm">
            {draft.excludedOperations.slice(0, 50).map((e) => (
              <li key={e.sourceId} className="flex flex-wrap justify-between gap-2 border-b border-line/40 pb-2">
                <span>
                  {e.label}
                  {e.operatorName ? ` · ${e.operatorName}` : ""}
                </span>
                <span className="text-ink-muted">
                  {formatCurrency(e.amount)} — {e.reasonLabel}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-xs text-ink-muted">{draft.rentalsScopeNote}</p>
      <p className="text-xs text-ink-muted">{draft.cashPaymentsScopeNote}</p>
    </div>
  );
}
