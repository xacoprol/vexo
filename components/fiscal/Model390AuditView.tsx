"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { Model390Result } from "@/lib/modelo-390";
import {
  build390PresentedSnapshot,
  compare390PresentedVsDraft,
  humanize390Warnings,
  lastPeriodAnnualInfoHeadline,
  obligationHeadline,
  reconciliationHeadline,
} from "@/lib/modelo-390";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  result: Model390Result;
  presented: PresentedFilingView | null;
};

export function Model390AuditView({ year, result, presented }: Props) {
  const [openDiff, setOpenDiff] = useState(false);
  const warnings = humanize390Warnings(result.warnings);
  const compare = compare390PresentedVsDraft(result, presented);
  const snapshotRaw = {
    model390Snapshot: build390PresentedSnapshot(result),
    source: "vexo-model390-engine",
  };

  const obligation = obligationHeadline(result.filingObligation.status);

  return (
    <div className="space-y-6">
      <section className="card-panel space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {presented ? "Presentado · histórico inmutable" : "Control anual IVA"}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">
              MODELO 390 · {year}
            </h2>
            <p className="mt-1 text-sm font-medium text-accent">{obligation}</p>
          </div>
        </div>

        {result.filingObligation.status === "EXEMPT" ? (
          <div className="space-y-2">
            <p className="rounded-lg border border-line bg-accent-soft/30 px-4 py-3 text-sm text-ink-muted">
              No parece necesario presentar el Modelo 390 según la configuración actual.
              El resumen anual se mantiene como control interno de coherencia del IVA.
            </p>
            {result.filingObligation.requiresLastPeriodAnnualInfo ? (
              <div className="space-y-2">
                <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                  No tienes que presentar Modelo 390, pero la información anual
                  correspondiente debe incluirse en la autoliquidación del último
                  período de IVA del ejercicio ({result.lastPeriodAnnualInfo.lastPeriodLabel}).
                </p>
                <div className="rounded-lg border border-line px-4 py-3 text-sm">
                  <p className="font-medium">
                    Información anual del último 303:{" "}
                    <span className="text-accent">
                      {lastPeriodAnnualInfoHeadline(
                        result.lastPeriodAnnualInfo.status
                      )}
                    </span>
                  </p>
                  {result.lastPeriodAnnualInfo.fields.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                      {result.lastPeriodAnnualInfo.fields
                        .filter((f) => f.known && f.value != null)
                        .slice(0, 6)
                        .map((f) => (
                          <li key={f.code}>
                            {f.label}:{" "}
                            <span className="font-mono">
                              {formatCurrency(f.value ?? 0)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {result.lastPeriodAnnualInfo.presented?.divergesFromCurrent ? (
                    <p className="mt-2 text-xs text-warning">
                      El {result.lastPeriodAnnualInfo.lastPeriodLabel} presentado
                      difiere del cálculo anual actual — el histórico presentado no
                      se modifica.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {result.filingObligation.status === "UNKNOWN" ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            {result.filingObligation.reasons.join(" ")}{" "}
            <Link href="/settings" className="font-medium text-accent underline">
              Configurar en Ajustes
            </Link>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-line/30 px-4 py-3">
            <p className="text-xs text-ink-muted">IVA devengado</p>
            <p className="font-mono text-lg font-semibold">
              {formatCurrency(result.annualFromOperations.outputVat)}
            </p>
          </div>
          <div className="rounded-lg bg-line/30 px-4 py-3">
            <p className="text-xs text-ink-muted">IVA deducible</p>
            <p className="font-mono text-lg font-semibold">
              {formatCurrency(result.annualFromOperations.inputVat)}
            </p>
          </div>
          <div className="rounded-lg bg-line/30 px-4 py-3">
            <p className="text-xs text-ink-muted">Diferencia (devengado − deducible)</p>
            <p className="font-mono text-lg font-semibold">
              {formatCurrency(
                result.annualFromOperations.outputVat -
                  result.annualFromOperations.inputVat
              )}
            </p>
          </div>
        </div>

        <p className="text-xs text-ink-muted">
          Resultado liquidación anual (Σ box71 trimestral):{" "}
          <span className="font-mono">
            {formatCurrency(result.annualFromOperations.activityNet)}
          </span>
          {" — "}no confundir con devengado/deducible ni con un pago único del 390.
        </p>
      </section>

      <section
        className={`card-panel space-y-3 p-5 ${
          result.reconciliation.status === "MATCH"
            ? "border-success/30"
            : "border-warning/40"
        }`}
      >
        <h3 className="form-section-title">Conciliación anual</h3>
        <p className="text-sm font-medium">
          {result.reconciliation.status === "MATCH" ? "✓" : "⚠"}{" "}
          {reconciliationHeadline(result.reconciliation.status)}
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span>IVA devengado</span>
            <span>
              Operaciones: {formatCurrency(result.annualFromOperations.outputVat)} · 303:{" "}
              {formatCurrency(result.annualFrom303.outputVat)}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span>IVA deducible</span>
            <span>
              Operaciones: {formatCurrency(result.annualFromOperations.inputVat)} · 303:{" "}
              {formatCurrency(result.annualFrom303.inputVat)}
            </span>
          </div>
        </div>
        {result.reconciliation.differences.length > 0 ? (
          <>
            <button
              type="button"
              className="text-sm text-accent hover:underline"
              onClick={() => setOpenDiff(!openDiff)}
            >
              {openDiff ? "Ocultar" : "Ver"} {result.reconciliation.differences.length}{" "}
              diferencias
            </button>
            {openDiff ? (
              <ul className="space-y-2 text-sm">
                {result.reconciliation.differences.map((d) => (
                  <li
                    key={d.field}
                    className="flex flex-wrap justify-between gap-2 border-b border-line/40 pb-2"
                  >
                    <span>{d.label}</span>
                    <span className="font-mono text-warning">
                      Δ {formatCurrency(d.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="card-panel space-y-3 p-5">
        <h3 className="form-section-title">Trimestres 303</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {(result.annualFrom303.quarters ?? []).map((q) => (
            <Link
              key={q.quarter}
              href={`/fiscal/303?year=${year}&q=${q.quarter}`}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:border-accent"
            >
              <span>{q.quarter}T</span>
              <span className="text-ink-muted">
                {q.source === "PRESENTED" ? "PRESENTADO" : "BORRADOR"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {warnings.length > 0 ? (
        <section className="space-y-2">
          {warnings.map((w) => (
            <div
              key={`${w.code}-${w.sourceId ?? w.title}`}
              className={`rounded-lg border px-4 py-3 text-sm ${
                w.severity === "blocking"
                  ? "border-warning/40 bg-warning/15"
                  : "border-line bg-line/20"
              }`}
            >
              <p className="font-medium">{w.title}</p>
              <p className="mt-1 text-ink-muted">{w.explanation}</p>
            </div>
          ))}
        </section>
      ) : null}

      {!presented ? (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Marcar presentado</h3>
          <MarkPresentedForm
            modelType="390"
            year={year}
            quarter={null}
            draftResult={result.annualFromOperations.activityNet}
            boxes={[
              {
                code: "devengado",
                label: "IVA devengado anual",
                value: result.annualFromOperations.outputVat,
              },
              {
                code: "deducible",
                label: "IVA deducible anual",
                value: result.annualFromOperations.inputVat,
              },
            ]}
            rawExtract={snapshotRaw}
          />
        </section>
      ) : (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Presentado vs motor actual</h3>
          <p className="text-sm text-ink-muted">
            Devengado presentado:{" "}
            {compare.presentedOutput != null
              ? formatCurrency(compare.presentedOutput)
              : "—"}{" "}
            · Motor: {formatCurrency(compare.draftOutput)}
          </p>
          <p className="text-sm text-ink-muted">
            Deducible presentado:{" "}
            {compare.presentedInput != null
              ? formatCurrency(compare.presentedInput)
              : "—"}{" "}
            · Motor: {formatCurrency(compare.draftInput)}
          </p>
        </section>
      )}
    </div>
  );
}
