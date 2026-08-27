"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { Model180Result } from "@/lib/modelo-180";
import {
  build180PresentedSnapshot,
  compare180PresentedVsDraft,
  outcome180Label,
} from "@/lib/modelo-180";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  draft: Model180Result;
  presented: PresentedFilingView | null;
};

export function Model180AuditView({ year, draft, presented }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const compare = compare180PresentedVsDraft(draft, presented);
  const snapshotRaw = {
    model180Snapshot: build180PresentedSnapshot(draft),
    source: "vexo-model180-engine",
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
              MODELO 180 · {draft.label}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">{draft.scopeNote}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {outcome180Label(draft.outcome)}
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
              key={`${w.code}-${w.withholdingId ?? w.leaseId ?? w.message}`}
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
          <p className="text-xs uppercase text-ink-muted">Arrendadores</p>
          <p className="text-xl font-semibold tabular-nums">
            {draft.summary.uniqueLandlordCount}
          </p>
          <p className="text-xs text-ink-muted">
            {draft.summary.totalPayeeRecords} registros inmueble
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-muted">Base anual</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.summary.totalBaseAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-muted">Retenciones</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.summary.totalWithholdingAmount)}
          </p>
        </div>
      </section>

      <section className="card-panel space-y-3 p-5">
        {draft.records.map((r) => (
          <Fragment key={r.recordKey}>
            <button
              type="button"
              className="w-full rounded-lg border border-line px-4 py-3 text-left hover:bg-bg-elevated/50"
              onClick={() =>
                setOpen(open === r.recordKey ? null : r.recordKey)
              }
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-ink-muted">
                    NIF {r.taxId} · {r.propertyAddress}
                  </p>
                  <p className="text-xs text-ink-muted">
                    RC: {r.cadastralReference ?? "— (situación 4)"}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p>Base {formatCurrency(r.annualBaseAmount)}</p>
                  <p>Ret. {formatCurrency(r.annualWithholdingAmount)}</p>
                </div>
              </div>
            </button>
            {open === r.recordKey
              ? r.trace.map((t) => (
                  <div
                    key={t.withholdingId}
                    className="ml-4 border-l border-line pl-4 text-xs text-ink-muted"
                  >
                    {t.paymentDate} · {formatCurrency(t.baseAmount)} /{" "}
                    {formatCurrency(t.withholdingAmount)}
                    {t.href ? (
                      <>
                        {" · "}
                        <Link href={t.href} className="text-accent underline">
                          Ver gasto
                        </Link>
                      </>
                    ) : null}
                  </div>
                ))
              : null}
          </Fragment>
        ))}
      </section>

      <section className="card-panel space-y-2 p-5">
        <h3 className="text-sm font-semibold">Conciliación 115 ↔ 180</h3>
        <p className="text-sm">
          {draft.reconciliation.status === "MATCH"
            ? "✓ Coincide"
            : draft.reconciliation.status}
        </p>
        <p className="text-xs text-ink-muted">
          Σ115 base {formatCurrency(draft.reconciliation.sum115Bases)} vs 180{" "}
          {formatCurrency(draft.reconciliation.annual180Bases)} · Σ115 ret.{" "}
          {formatCurrency(draft.reconciliation.sum115Withholdings)} vs 180{" "}
          {formatCurrency(draft.reconciliation.annual180Withholdings)}
        </p>
      </section>

      {presented ? (
        <section className="card-panel space-y-2 p-5">
          <h3 className="text-sm font-semibold">Presentado vs motor</h3>
          {compare.legacyDetailWarning ? (
            <p className="text-sm text-warning">LEGACY_180_FILING_DETAIL</p>
          ) : (
            <p className="text-xs text-ink-muted">
              Diferencias:{" "}
              {compare.recordDiffs.filter((d) => d.kind !== "match").length}
            </p>
          )}
        </section>
      ) : (
        <MarkPresentedForm
          modelType="180"
          year={year}
          quarter={null}
          draftResult={draft.summary.totalWithholdingAmount}
          boxes={[
            {
              code: "records",
              label: "Nº total perceptores",
              value: draft.summary.totalPayeeRecords,
            },
            {
              code: "base",
              label: "Base retenciones",
              value: draft.summary.totalBaseAmount,
            },
            {
              code: "withholdings",
              label: "Retenciones e ingresos a cuenta",
              value: draft.summary.totalWithholdingAmount,
            },
          ]}
          rawExtract={snapshotRaw}
        />
      )}
    </div>
  );
}
