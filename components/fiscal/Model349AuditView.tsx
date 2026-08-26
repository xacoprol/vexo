"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { Modelo349Draft } from "@/lib/fiscal-347-349";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { FiscalQuarter } from "@/lib/fiscal";
import {
  MODEL349_KEY_LABELS,
  build349DraftBoxes,
  compare349PresentedVsDraft,
  draft349Total,
  humanize349Warnings,
  periodicityLabel,
} from "@/lib/modelo-349";
import { build349PresentedSnapshot } from "@/lib/modelo-349/rectifications";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  quarter: FiscalQuarter;
  draft: Modelo349Draft;
  presented: PresentedFilingView | null;
};

function compareStatusLabel(
  status: ReturnType<typeof compare349PresentedVsDraft>["rows"][0]["status"]
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
    default:
      return status;
  }
}

export function Model349AuditView({ year, quarter, draft, presented }: Props) {
  const [openOp, setOpenOp] = useState<string | null>(null);
  const warnings = humanize349Warnings(draft.warnings);
  const compare = compare349PresentedVsDraft(draft, presented);
  const draftBoxes = build349DraftBoxes(draft);
  const draftResult = draft349Total(draft);
  const snapshotRaw = {
    model349Snapshot: build349PresentedSnapshot(draft),
    source: "vexo-model349-engine",
  };

  return (
    <div className="space-y-6">
      <section className="card-panel space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {presented ? "Presentado · histórico inmutable" : "Borrador"}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">
              MODELO 349 · {draft.label}
            </h2>
          </div>
          <div className="text-right text-sm">
            <p className="text-ink-muted">Periodicidad</p>
            <p className="font-medium">{periodicityLabel(draft.periodicity)}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Plazo: {draft.deadline.dueLabel}
            </p>
          </div>
        </div>

        {draft.periodicity === "MONTHLY" ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Umbral E+S ({formatCurrency(draft.thresholdContext.threshold)}) superado — régimen
            mensual. Salidas E+S en {draft.label}:{" "}
            {formatCurrency(draft.thresholdContext.referenceQuarterAmount)} (A/I no computan).
          </p>
        ) : null}

        {draft.filingPeriods.length > 1 ? (
          <div className="text-sm">
            <p className="font-medium">Periodos de presentación</p>
            <ul className="mt-1 space-y-1 text-ink-muted">
              {draft.filingPeriods.map((p) => (
                <li key={`${p.kind}-${p.startMonth}-${p.endMonth}`}>
                  {p.label} · plazo {p.deadline.dueLabel}
                </li>
              ))}
            </ul>
          </div>
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
          <p className="text-sm text-ink-muted">
            Al marcar presentado se guarda un snapshot inmutable por operador y clave.
          </p>
          <MarkPresentedForm
            modelType="349"
            year={year}
            quarter={quarter}
            draftResult={draftResult}
            boxes={draftBoxes}
            rawExtract={snapshotRaw}
          />
        </section>
      ) : (
        <section className="card-panel space-y-4 p-5">
          <h3 className="form-section-title">Presentado vs motor actual</h3>
          {compare.legacyDetailWarning ? (
            <p className="text-sm text-warning">
              El filing guardado no incluye snapshot por operador — la comparación es limitada.
            </p>
          ) : null}
          {compare.presentedHasDetail ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">Operador</th>
                    <th className="px-2 py-2 text-left">Clave</th>
                    <th className="px-2 py-2 text-right">Presentado</th>
                    <th className="px-2 py-2 text-right">Motor</th>
                    <th className="px-2 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.rows.map((r) => (
                    <tr key={`${r.key}|${r.vatId}`} className="border-b border-line/50">
                      <td className="px-2 py-2">
                        <span className="font-medium">{r.operatorName}</span>
                        <span className="ml-2 font-mono text-xs text-ink-muted">
                          {r.vatId}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono">{r.key}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {r.presentedAmount != null
                          ? formatCurrency(r.presentedAmount)
                          : "—"}
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
          ) : (
            <p className="text-sm text-ink-muted">
              Presentado registrado ({formatCurrency(presented.result)}). Sin snapshot
              detallado — el motor actual puede diferir sin poder comparar operador a operador.
            </p>
          )}
        </section>
      )}

      <section className="card-panel space-y-4 p-5">
        <div>
          <h3 className="form-section-title">Operaciones</h3>
          <p className="form-section-hint">
            Agrupadas por operador intracomunitario + clave (E/A/S/I). Base imponible fiscal.
          </p>
        </div>

        {draft.operations.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Sin operaciones declarables en {draft.label}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Operador</th>
                  <th className="px-2 py-2 text-left">NIF-IVA</th>
                  <th className="px-2 py-2 text-left">Clave</th>
                  <th className="px-2 py-2 text-right">Base</th>
                  <th className="px-2 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {draft.operations.map((op) => {
                  const rowKey = `${op.key}|${op.vatId}`;
                  const open = openOp === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-line/50">
                        <td className="px-2 py-2">{op.operatorName}</td>
                        <td className="px-2 py-2 font-mono text-xs">
                          {op.country ? `${op.country} · ` : ""}
                          {op.vatId}
                        </td>
                        <td className="px-2 py-2 font-mono" title={MODEL349_KEY_LABELS[op.key]}>
                          {op.key}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatCurrency(op.amount)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className="text-xs text-accent hover:underline"
                            onClick={() => setOpenOp(open ? null : rowKey)}
                          >
                            {open ? "Ocultar" : `${op.trace.length} doc.`}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-accent-soft/20">
                          <td colSpan={5} className="px-4 py-3">
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
                                    <span className="ml-2 text-ink-muted">{t.issueDate}</span>
                                  </span>
                                  <span className="font-mono">{formatCurrency(t.base)}</span>
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

      {draft.rectifications.length > 0 ? (
        <section className="card-panel space-y-4 p-5">
          <h3 className="form-section-title">Rectificaciones 349</h3>
          <p className="form-section-hint">
            Distintas de las facturas rectificativas — registran la corrección declarada por
            operador, clave y periodo original.
          </p>
          <div className="space-y-3">
            {draft.rectifications.map((r, idx) => (
              <div
                key={`${r.operatorVatId}-${r.operationKey}-${idx}`}
                className="rounded-lg border border-line px-4 py-3 text-sm"
              >
                <p className="font-medium">
                  {r.operatorName} · {r.operationKey} · periodo {r.originalPeriod}
                </p>
                <p className="mt-1 text-ink-muted">
                  Corrige {r.originalPeriod} · se declara en {r.filingPeriod}: declarado{" "}
                  {formatCurrency(r.previousAmount)} → correcto{" "}
                  {formatCurrency(r.correctedAmount)} (Δ {formatCurrency(r.delta)})
                </p>
                {r.needsReview ? (
                  <p className="mt-1 text-warning">{r.reviewCode}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
