"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { Model190Result } from "@/lib/modelo-190";
import {
  build190PresentedSnapshot,
  compare190PresentedVsDraft,
  outcome190Label,
} from "@/lib/modelo-190";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  draft: Model190Result;
  presented: PresentedFilingView | null;
};

export function Model190AuditView({ year, draft, presented }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const compare = compare190PresentedVsDraft(draft, presented);
  const snapshotRaw = {
    model190Snapshot: build190PresentedSnapshot(draft),
    source: "vexo-model190-engine",
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
              MODELO 190 · {draft.label}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">{draft.scopeNote}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {outcome190Label(draft.outcome)}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(draft.summary.totalWithholdingAmount)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Plazo: {draft.deadline.dueLabel}
            </p>
          </div>
        </div>
      </section>

      {draft.warnings.length > 0 ? (
        <section className="space-y-2">
          {draft.warnings.map((w) => (
            <div
              key={`${w.code}-${w.withholdingId ?? w.message}`}
              className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
            >
              <p className="font-medium text-warning">{w.code}</p>
              <p className="mt-1 text-ink-muted">{w.message}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card-panel grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-ink-muted">
            Perceptores / registros
          </p>
          <p className="text-xl font-semibold tabular-nums">
            {draft.summary.totalPerceptionRecords}
          </p>
          <p className="text-xs text-ink-muted">
            {draft.summary.uniquePayeeCount} NIF únicos
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-muted">Percepciones</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.summary.totalCashPerceptionAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-muted">Retenciones</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.summary.totalWithholdingAmount)}
          </p>
        </div>
      </section>

      <section className="card-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-bg-elevated text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Profesional</th>
              <th className="px-4 py-3">NIF</th>
              <th className="px-4 py-3">Clave/Sub</th>
              <th className="px-4 py-3 text-right">Percepciones</th>
              <th className="px-4 py-3 text-right">Retenciones</th>
            </tr>
          </thead>
          <tbody>
            {draft.records.map((r) => (
              <Fragment key={r.recordKey}>
                <tr
                  className="cursor-pointer border-b border-line/60 hover:bg-bg-elevated/50"
                  onClick={() =>
                    setOpen(open === r.recordKey ? null : r.recordKey)
                  }
                >
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 tabular-nums">{r.taxId}</td>
                  <td className="px-4 py-3">
                    {r.key ?? "?"}/{r.subKey ?? "??"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(r.cashPerceptionAmount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(r.withholdingAmount)}
                  </td>
                </tr>
                {open === r.recordKey
                  ? r.trace.map((t) => (
                      <tr
                        key={t.withholdingId}
                        className="border-b border-line/40 bg-bg-elevated/30 text-xs"
                      >
                        <td className="px-4 py-2 pl-8" colSpan={3}>
                          {t.paymentDate} · {t.withholdingId}
                          {t.href ? (
                            <>
                              {" · "}
                              <Link href={t.href} className="text-accent underline">
                                Ver gasto
                              </Link>
                            </>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(t.baseAmount)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(t.withholdingAmount)}
                        </td>
                      </tr>
                    ))
                  : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card-panel space-y-2 p-5">
        <h3 className="text-sm font-semibold">Conciliación 111 ↔ 190</h3>
        <p className="text-sm">
          {draft.reconciliation.status === "MATCH"
            ? "✓ Coincide"
            : draft.reconciliation.status}
        </p>
        <p className="text-xs text-ink-muted">
          Σ111 percepciones {formatCurrency(draft.reconciliation.sum111Perceptions)}{" "}
          vs 190 {formatCurrency(draft.reconciliation.annual190Perceptions)} · Σ111
          retenciones {formatCurrency(draft.reconciliation.sum111Withholdings)} vs
          190 {formatCurrency(draft.reconciliation.annual190Withholdings)}
        </p>
      </section>

      {presented ? (
        <section className="card-panel space-y-2 p-5">
          <h3 className="text-sm font-semibold">Presentado vs motor</h3>
          {compare.legacyDetailWarning ? (
            <p className="text-sm text-warning">LEGACY_190_FILING_DETAIL</p>
          ) : (
            <p className="text-xs text-ink-muted">
              Diferencias de registro:{" "}
              {
                compare.recordDiffs.filter((d) => d.kind !== "match").length
              }
            </p>
          )}
        </section>
      ) : (
        <MarkPresentedForm
          modelType="190"
          year={year}
          quarter={null}
          draftResult={draft.summary.totalWithholdingAmount}
          boxes={[
            {
              code: "records",
              label: "Nº total percepciones",
              value: draft.summary.totalPerceptionRecords,
            },
            {
              code: "perceptions",
              label: "Importe total percepciones",
              value: draft.summary.totalCashPerceptionAmount,
            },
            {
              code: "withholdings",
              label: "Total retenciones",
              value: draft.summary.totalWithholdingAmount,
            },
          ]}
          rawExtract={snapshotRaw}
        />
      )}
    </div>
  );
}
