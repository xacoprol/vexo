"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { FiscalQuarter } from "@/lib/fiscal";
import type { Model111Result } from "@/lib/modelo-111";
import {
  build111PresentedSnapshot,
  compare111PresentedVsDraft,
  draft111BoxesList,
  draft111ResultAmount,
  outcome111Label,
} from "@/lib/modelo-111";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  quarter: FiscalQuarter;
  draft: Model111Result;
  presented: PresentedFilingView | null;
};

export function Model111AuditView({ year, quarter, draft, presented }: Props) {
  const [openPayee, setOpenPayee] = useState<string | null>(null);
  const compare = compare111PresentedVsDraft(draft, presented);
  const draftBoxes = draft111BoxesList(draft);
  const draftResult = draft111ResultAmount(draft);
  const snapshotRaw = {
    model111Snapshot: build111PresentedSnapshot(draft),
    source: "vexo-model111-engine",
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
              MODELO 111 · {draft.label}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">{draft.scopeNote}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {outcome111Label(draft.outcome)}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(draft.boxes.box30)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Plazo: {draft.deadline.dueLabel}
            </p>
          </div>
        </div>
        {draft.deadline.scopeNote ? (
          <p className="text-xs text-ink-muted">{draft.deadline.scopeNote}</p>
        ) : null}
      </section>

      {draft.warnings.length > 0 ? (
        <section className="space-y-2">
          {draft.warnings.map((w) => (
            <div
              key={`${w.code}-${w.withholdingId ?? w.sourceId ?? w.message}`}
              className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
            >
              <p className="font-medium text-warning">{w.code}</p>
              <p className="mt-1 text-ink-muted">{w.message}</p>
              {w.sourceId ? (
                <Link
                  href={`/fiscal/expenses/${w.sourceId}/edit`}
                  className="mt-2 inline-block text-accent underline"
                >
                  Ver gasto
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="card-panel grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-ink-muted">Profesionales</p>
          <p className="text-xl font-semibold tabular-nums">{draft.boxes.box07}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Percepciones (08)</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.boxes.box08)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Retenciones (09)</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.boxes.box09)}
          </p>
        </div>
      </section>

      <section className="card-panel space-y-3 p-5">
        <h3 className="form-section-title">Perceptores</h3>
        {draft.payees.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Sin rentas profesionales satisfechas en el período (paymentDate).
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {draft.payees.map((p) => (
              <li key={p.counterpartyId} className="py-3">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                  onClick={() =>
                    setOpenPayee((id) =>
                      id === p.counterpartyId ? null : p.counterpartyId
                    )
                  }
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-ink-muted">NIF {p.taxId}</p>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <p>Base {formatCurrency(p.baseAmount)}</p>
                    <p>Retención {formatCurrency(p.withholdingAmount)}</p>
                  </div>
                </button>
                {openPayee === p.counterpartyId ? (
                  <div className="mt-3 space-y-2 pl-2 text-sm">
                    {p.lines.map((line) => (
                      <Fragment key={line.withholdingId}>
                        <div className="rounded-md border border-line px-3 py-2">
                          <p>
                            Pagado {line.paymentDate} · Base{" "}
                            {formatCurrency(line.baseAmount)} · Retención{" "}
                            {formatCurrency(line.withholdingAmount)}
                          </p>
                          {line.href ? (
                            <Link
                              href={line.href}
                              className="text-accent underline"
                            >
                              Ver gasto
                            </Link>
                          ) : null}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-panel space-y-2 p-5">
        <h3 className="form-section-title">Casillas</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-left">Casilla</th>
                <th className="px-2 py-2 text-left">Concepto</th>
                <th className="px-2 py-2 text-right">Importe</th>
                <th className="px-2 py-2 text-left">Soporte</th>
              </tr>
            </thead>
            <tbody>
              {draft.boxList
                .filter((b) => b.supported || b.value !== 0 || ["01", "29"].includes(b.code))
                .map((b) => (
                  <tr key={b.code} className="border-b border-line/60">
                    <td className="px-2 py-1.5 font-mono">{b.code}</td>
                    <td className="px-2 py-1.5">{b.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrency(b.value)}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-ink-muted">
                      {b.supported ? "Sí" : "No soportado"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {!presented ? (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Marcar presentado</h3>
          <p className="text-sm text-ink-muted">
            Guarda snapshot inmutable (boxes + perceptores + outcome). No
            sobrescribe si el motor cambia después.
          </p>
          {draft.requiresReview ? (
            <p className="text-sm text-warning">
              Hay avisos que requieren revisión; el gate puede bloquear el
              marcado.
            </p>
          ) : null}
          <MarkPresentedForm
            modelType="111"
            year={year}
            quarter={quarter}
            draftResult={draftResult}
            boxes={draftBoxes}
            rawExtract={snapshotRaw}
          />
        </section>
      ) : (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Presentado vs motor actual</h3>
          {compare.legacyDetailWarning ? (
            <p className="text-sm text-warning">
              El filing no incluye model111Snapshot — comparación limitada.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Casilla</th>
                  <th className="px-2 py-2 text-right">Presentado</th>
                  <th className="px-2 py-2 text-right">Motor</th>
                  <th className="px-2 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {compare.rows
                  .filter((r) => ["07", "08", "09", "28", "29", "30"].includes(r.code))
                  .map((r) => (
                    <tr key={r.code} className="border-b border-line/60">
                      <td className="px-2 py-1.5 font-mono">{r.code}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {r.presented == null
                          ? "—"
                          : formatCurrency(r.presented)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatCurrency(r.draft)}
                      </td>
                      <td className="px-2 py-1.5">{r.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
