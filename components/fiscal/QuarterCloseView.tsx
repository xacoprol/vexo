"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/calculations";
import type { FiscalPeriodValidation } from "@/lib/fiscal-validation";
import {
  readinessLabel,
  lifecycleLabel,
  obligationStatusLabel,
  filingStatusLabel,
  reconciliationLabel,
  visibleQuarterModels,
} from "@/lib/fiscal-validation";
import {
  confirmFiscalPeriodReview,
  updateExpenseVatOperationType,
} from "@/app/(app)/fiscal/close/actions";
import { exportVexoDeclarationAction } from "@/app/(app)/fiscal/close/declaration-actions";
import { AssistedSubmissionPanel } from "@/components/fiscal/AssistedSubmissionPanel";
import type { FiscalCloseActionGroup } from "@/lib/fiscal-close";
import type { DeclarationModelCode } from "@/lib/fiscal-declaration";
import type { FiscalQuarter } from "@/lib/fiscal";

type Props = {
  validation: FiscalPeriodValidation;
};

const GROUP_LABEL: Record<FiscalCloseActionGroup, string> = {
  census: "Configuración fiscal",
  invoices: "Ingresos / facturas",
  expenses: "Gastos",
  eu: "Operaciones UE",
  documentation: "Documentación",
  verifactu: "VeriFactu",
  other: "Otros",
};

export function QuarterCloseView({ validation }: Props) {
  const models = visibleQuarterModels(validation);
  const { readiness, lifecycle, health, reconciliation } = validation;
  const actions = validation.closeActions ?? [];
  const euReviews = validation.euReviews ?? [];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    model: string;
    result: string | null;
    hash: string;
    frozenAt?: string;
    boxes: Record<string, string | null>;
  } | null>(null);

  const grouped = actions.reduce(
    (acc, a) => {
      (acc[a.group] ??= []).push(a);
      return acc;
    },
    {} as Partial<Record<FiscalCloseActionGroup, typeof actions>>
  );

  function confirmReview() {
    setMsg(null);
    startTransition(async () => {
      const r = await confirmFiscalPeriodReview({
        year: validation.period.year,
        quarter: validation.period.quarter,
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg("Revisión congelada · READY_FOR_SUBMISSION");
      router.refresh();
    });
  }

  function confirmEu(expenseId: string, suggested: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await updateExpenseVatOperationType({
        expenseId,
        vatOperationType: suggested,
        confirm: true,
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg("Naturaleza UE actualizada. Recalculando…");
      router.refresh();
    });
  }

  function previewDeclaration(model: DeclarationModelCode) {
    const reviewId = lifecycle.preFiling?.reviewId;
    if (!reviewId) {
      setMsg("Sin revisión congelada.");
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await exportVexoDeclarationAction({
        preFilingReviewId: reviewId,
        model,
      });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      setPreview({
        model: r.draft.model,
        result: r.draft.result,
        hash: r.draft.declarationHash.slice(0, 12),
        frozenAt: r.draft.metadata.frozenAt,
        boxes: r.draft.boxes,
      });
      setMsg(`Declaración VEXO ${model} generada (no AEAT).`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="card-panel space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              Salud fiscal
            </p>
            <h2 className="text-xl font-semibold tracking-tight">
              {validation.period.label}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{lifecycle.reason}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">
              {readinessLabel(readiness.status)}
            </p>
            <p className="mt-1 text-xs uppercase text-ink-muted">
              {lifecycleLabel(lifecycle.status)}
            </p>
            {lifecycle.readyForSubmission ? (
              <p className="mt-1 text-xs font-medium text-success">
                READY_FOR_SUBMISSION
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href={`/fiscal/health?year=${validation.period.year}&q=${validation.period.quarter}`}
            className="rounded-md bg-line/40 px-2.5 py-1 hover:bg-line"
          >
            Fiscal Health
          </Link>
          <Link
            href="/settings#census-pending"
            className="rounded-md bg-line/40 px-2.5 py-1 hover:bg-line"
          >
            Perfil censal
          </Link>
        </div>
        {lifecycle.readyToFile && !lifecycle.readyForSubmission ? (
          <div className="rounded-lg border border-line px-4 py-3 text-sm">
            <p className="font-medium">Confirmar revisión fiscal</p>
            <p className="mt-1 text-xs text-ink-muted">
              Congela el cálculo actual (pre-filing snapshot). No presenta a
              AEAT.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={confirmReview}
              className="btn-primary mt-3"
            >
              {pending ? "Congelando…" : "Revisado y listo"}
            </button>
          </div>
        ) : null}
        {lifecycle.readyForSubmission ? (
          <div className="rounded-lg border border-line px-4 py-3 text-sm">
            <p className="font-medium">Declaración VEXO (desde freeze)</p>
            <p className="mt-1 text-xs text-ink-muted">
              Genera el artefacto canónico desde el snapshot congelado. No es
              formato oficial AEAT ni presentación telemática.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["130", "303", "349", "111", "115"] as DeclarationModelCode[]).map(
                (m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={pending}
                    className="btn-secondary text-xs"
                    onClick={() => previewDeclaration(m)}
                  >
                    Preview {m}
                  </button>
                )
              )}
            </div>
            {preview ? (
              <div className="mt-3 rounded-md bg-canvas px-3 py-2 text-xs">
                <p>
                  Modelo {preview.model} · resultado {preview.result ?? "—"} ·
                  hash {preview.hash}…
                </p>
                {preview.frozenAt ? (
                  <p className="text-ink-muted">Freeze: {preview.frozenAt}</p>
                ) : null}
                <p className="mt-1 text-ink-muted">
                  Casillas: {Object.keys(preview.boxes).slice(0, 8).join(", ")}
                  {Object.keys(preview.boxes).length > 8 ? "…" : ""}
                </p>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Presentación asistida AEAT
              </p>
              {(
                ["130", "303", "349", "111", "115"] as DeclarationModelCode[]
              ).map((m) => (
                <AssistedSubmissionPanel
                  key={`assist-${m}`}
                  model={m}
                  year={validation.period.year}
                  quarter={validation.period.quarter as FiscalQuarter}
                  reviewId={lifecycle.preFiling!.reviewId}
                />
              ))}
            </div>
          </div>
        ) : null}
        {msg ? <p className="text-sm text-ink-muted">{msg}</p> : null}
      </section>

      {actions.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Pendiente antes de cerrar
          </h3>
          {(
            [
              "census",
              "eu",
              "documentation",
              "verifactu",
              "invoices",
              "expenses",
              "other",
            ] as FiscalCloseActionGroup[]
          ).map((g) => {
            const list = grouped[g];
            if (!list?.length) return null;
            return (
              <div key={g} className="card-panel space-y-2 p-4">
                <p className="text-xs font-semibold uppercase text-ink-muted">
                  {GROUP_LABEL[g]}
                </p>
                {list.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-line/60 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {a.severity === "BLOCKER" ? "✕ " : ""}
                      {a.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">{a.description}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Impacto: {a.impact}
                    </p>
                    {a.href ? (
                      <Link
                        href={a.href}
                        className="mt-2 inline-block text-accent underline"
                      >
                        {a.actionType === "OPEN_FISCAL_SETTINGS"
                          ? "Configurar"
                          : "Revisar"}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      ) : null}

      {euReviews.length > 0 ? (
        <section className="card-panel space-y-3 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Revisión operaciones UE
          </h3>
          {euReviews.map((r) => (
            <div
              key={r.expenseId}
              className="rounded-md border border-line/60 px-3 py-3 text-sm"
            >
              <p className="font-medium">
                {r.classification === "CONFIRMED_SERVICE"
                  ? "Servicio UE sugerido"
                  : r.classification === "INSUFFICIENT_DATA"
                    ? "Datos insuficientes"
                    : "Revisión UE"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Actual: {r.currentType} / clave A · Sugerido:{" "}
                {r.suggestedType ?? "—"} / clave I
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-ink-muted">
                {r.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {r.impact ? (
                <p className="mt-2 text-xs tabular-nums">
                  Preview 303 resultado Δ {formatCurrency(r.impact.delta303Result)}{" "}
                  · 349 A {formatCurrency(r.impact.delta349A)} · I{" "}
                  {formatCurrency(r.impact.delta349I)}
                </p>
              ) : null}
              {r.classification === "CONFIRMED_SERVICE" && r.suggestedType ? (
                <button
                  type="button"
                  disabled={pending}
                  className="btn-secondary mt-2"
                  onClick={() => confirmEu(r.expenseId, r.suggestedType!)}
                >
                  Confirmar reclasificación
                </button>
              ) : (
                <Link
                  href={`/fiscal/expenses/${r.expenseId}/edit`}
                  className="mt-2 inline-block text-accent underline"
                >
                  Revisar / adjuntar factura
                </Link>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {readiness.blockers.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Blockers
          </h3>
          {readiness.blockers.map((b) => (
            <div
              key={`${b.code}-${b.title}`}
              className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm"
            >
              <p className="font-medium">✕ {b.title}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {b.code}
                {b.model ? ` · modelo ${b.model}` : ""}
              </p>
              {b.href ? (
                <Link href={b.href} className="mt-2 inline-block text-accent underline">
                  Revisar
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="card-panel space-y-3 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Comprobaciones
        </h3>
        <ul className="space-y-1 text-sm">
          {health.checks.slice(0, 12).map((c) => (
            <li key={c.id} className="flex gap-2">
              <span>{c.passed ? "✓" : "✕"}</span>
              <span>
                {c.label}
                {c.model ? (
                  <span className="text-ink-muted"> · {c.model}</span>
                ) : null}
              </span>
            </li>
          ))}
          {health.checks.length === 0 ? (
            <li className="text-ink-muted">Sin checks detallados en contexto.</li>
          ) : null}
        </ul>
        <p className="text-xs text-ink-muted">
          Issues: {health.summary.totalIssues} · blockers health:{" "}
          {health.blockers.length} · queryCount≈{" "}
          {validation.performance.queryCountApprox}
        </p>
      </section>

      <section className="card-panel space-y-4 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Obligaciones del trimestre
        </h3>
        {models.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Sin obligaciones relevantes detectadas este período.
          </p>
        ) : (
          models.map((m) => (
            <div
              key={m.model}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium">Modelo {m.model}</p>
                <p className="text-xs text-ink-muted">
                  {obligationStatusLabel(m.obligationStatus)} ·{" "}
                  {filingStatusLabel(m.filingStatus)} · ops{" "}
                  {m.operationsSignal}
                </p>
                {m.notes.map((n) => (
                  <p key={n} className="mt-1 text-xs text-ink-muted">
                    {n}
                  </p>
                ))}
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums">
                  {m.engineResult != null
                    ? formatCurrency(m.engineResult)
                    : "—"}
                </p>
                <Link href={m.href} className="text-sm text-accent underline">
                  Ver modelo
                </Link>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="card-panel space-y-4 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Presentado vs cálculo actual
        </h3>
        <p className="text-xs text-ink-muted">
          Conciliación global: {reconciliationLabel(reconciliation.status)}
        </p>
        {models
          .filter((m) => m.presentedResult != null)
          .map((m) => (
            <div key={`cmp-${m.model}`} className="text-sm">
              <p className="font-medium">{m.model}</p>
              <p className="tabular-nums text-ink-muted">
                Presentado:{" "}
                {m.presentedResult != null
                  ? formatCurrency(m.presentedResult)
                  : "—"}
              </p>
              <p className="tabular-nums text-ink-muted">
                Actual:{" "}
                {m.engineResult != null ? formatCurrency(m.engineResult) : "—"}
              </p>
              {m.difference != null && m.difference !== 0 ? (
                <p className="tabular-nums">
                  Diferencia: {formatCurrency(m.difference)}
                </p>
              ) : null}
              <p className="mt-1 text-xs">
                {m.reconciliationStatus === "MATCH"
                  ? "✓ Coincide"
                  : reconciliationLabel(m.reconciliationStatus)}
              </p>
              {!m.snapshotAvailable && m.presentedResult != null ? (
                <p className="mt-1 text-xs text-ink-muted">
                  La comparación es limitada porque este filing no contiene
                  snapshot estructurado.
                </p>
              ) : null}
              {m.bookDrift && m.bookDrift.addedCount > 0 ? (
                <div className="mt-2 rounded-md border border-line/60 bg-canvas px-3 py-2 text-xs">
                  <p className="font-medium">
                    El libro actual ha cambiado desde la presentación
                  </p>
                  <p className="mt-1 text-ink-muted">
                    {m.bookDrift.addedCount} operación(es) del periodo fueron
                    añadidas posteriormente.
                  </p>
                </div>
              ) : null}
            </div>
          ))}
      </section>

      <section className="card-panel space-y-2 p-5 text-sm text-ink-muted">
        <p>
          READY_FOR_SUBMISSION no es presentación AEAT ni CLOSED. Esta pantalla
          no firma ni paga.
        </p>
        <p className="text-xs">{validation.performance.note}</p>
      </section>
    </div>
  );
}
