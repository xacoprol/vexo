"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { formatCurrency } from "@/lib/calculations";
import type { PresentedFilingView } from "@/lib/fiscal-filings";
import type { FiscalQuarter } from "@/lib/fiscal";
import type { Model115Result } from "@/lib/modelo-115";
import {
  build115PresentedSnapshot,
  compare115PresentedVsDraft,
  draft115BoxesList,
  draft115ResultAmount,
  outcome115Label,
} from "@/lib/modelo-115";
import { MarkPresentedForm } from "@/components/fiscal/MarkPresentedForm";

type Props = {
  year: number;
  quarter: FiscalQuarter;
  draft: Model115Result;
  presented: PresentedFilingView | null;
};

export function Model115AuditView({ year, quarter, draft, presented }: Props) {
  const [openLandlord, setOpenLandlord] = useState<string | null>(null);
  const compare = compare115PresentedVsDraft(draft, presented);
  const draftBoxes = draft115BoxesList(draft);
  const draftResult = draft115ResultAmount(draft);
  const snapshotRaw = {
    model115Snapshot: build115PresentedSnapshot(draft),
    source: "vexo-model115-engine",
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
              MODELO 115 · {draft.label}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">{draft.scopeNote}</p>
            <p className="mt-1 text-xs text-ink-muted">{draft.periodRuleNote}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {outcome115Label(draft.outcome)}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(draft.boxes.box05)}
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
              key={`${w.code}-${w.withholdingId ?? w.leaseId ?? w.message}`}
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
          <p className="text-xs text-ink-muted">Arrendadores (01)</p>
          <p className="text-xl font-semibold tabular-nums">{draft.boxes.box01}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Base alquileres (02)</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.boxes.box02)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Retenciones (03)</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatCurrency(draft.boxes.box03)}
          </p>
        </div>
      </section>

      <section className="card-panel space-y-3 p-5">
        <h3 className="form-section-title">Arrendadores</h3>
        {draft.landlords.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Sin rentas de alquiler con retención satisfechas en el período
            (paymentDate).
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {draft.landlords.map((l) => (
              <li key={l.counterpartyId} className="py-3">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
                  onClick={() =>
                    setOpenLandlord((id) =>
                      id === l.counterpartyId ? null : l.counterpartyId
                    )
                  }
                >
                  <div>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-ink-muted">NIF {l.taxId}</p>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <p>Base {formatCurrency(l.baseAmount)}</p>
                    <p>Retención {formatCurrency(l.withholdingAmount)}</p>
                  </div>
                </button>
                {openLandlord === l.counterpartyId ? (
                  <div className="mt-3 space-y-2 pl-2 text-sm">
                    {l.trace.map((line) => (
                      <Fragment key={line.withholdingId}>
                        <div className="rounded-md border border-line px-3 py-2">
                          {line.propertyAddress ? (
                            <p className="text-ink-muted">
                              Local: {line.propertyAddress}
                            </p>
                          ) : null}
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
        <h3 className="form-section-title">Casillas oficiales</h3>
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-2 py-2 text-left">Casilla</th>
              <th className="px-2 py-2 text-left">Concepto</th>
              <th className="px-2 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {draft.boxList.map((b) => (
              <tr key={b.code} className="border-b border-line/60">
                <td className="px-2 py-1.5 font-mono">{b.code}</td>
                <td className="px-2 py-1.5">
                  {b.label}
                  {!b.supported ? (
                    <span className="ml-2 text-xs text-ink-muted">
                      (no auto)
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatCurrency(b.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!presented ? (
        <section className="card-panel space-y-3 p-5">
          <h3 className="form-section-title">Marcar presentado</h3>
          <MarkPresentedForm
            modelType="115"
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
              El filing no incluye model115Snapshot.
            </p>
          ) : null}
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
              {compare.rows.map((r) => (
                <tr key={r.code} className="border-b border-line/60">
                  <td className="px-2 py-1.5 font-mono">{r.code}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.presented == null ? "—" : formatCurrency(r.presented)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatCurrency(r.draft)}
                  </td>
                  <td className="px-2 py-1.5">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
