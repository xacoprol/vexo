"use client";

import { useState, useTransition } from "react";
import { CopyableBoxes } from "@/components/fiscal/CopyableBoxes";
import {
  prepareAssistedSubmissionAction,
  registerManualAeatFilingAction,
} from "@/app/(app)/fiscal/close/submission-actions";
import type { DeclarationModelCode } from "@/lib/fiscal-declaration";
import type { FiscalQuarter } from "@/lib/fiscal";

type Props = {
  year: number;
  quarter: FiscalQuarter;
  reviewId: string;
  model: DeclarationModelCode;
};

export function AssistedSubmissionPanel({
  year,
  quarter,
  reviewId,
  model,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [sedeUrl, setSedeUrl] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [boxes, setBoxes] = useState<{ code: string; label: string; value: number }[]>(
    []
  );
  const [result, setResult] = useState<number | undefined>();
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState("");
  const [filedAt, setFiledAt] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [differResult, setDifferResult] = useState("");

  function prepare() {
    setMsg(null);
    startTransition(async () => {
      const r = await prepareAssistedSubmissionAction({
        preFilingReviewId: reviewId,
        model,
        year,
        quarter,
      });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      setAttemptId(r.attemptId);
      setSedeUrl(r.prepared.sedeUrl);
      setChecklist(r.prepared.checklist);
      setPaymentNote(r.prepared.payment.notes);
      const parsed = Object.entries(r.prepared.boxes)
        .filter(([, v]) => v != null)
        .map(([code, v]) => ({
          code,
          label: `Casilla ${code}`,
          value: Number(String(v).replace(",", ".")),
        }));
      setBoxes(parsed);
      setResult(
        r.prepared.result != null
          ? Number(String(r.prepared.result).replace(",", "."))
          : undefined
      );
      setMsg(
        r.reused
          ? "Intento asistido reutilizado (idempotente)."
          : "Listo para presentar en Sede (acción de usuario)."
      );
    });
  }

  function register(match: boolean) {
    setMsg(null);
    if (!receiptId.trim()) {
      setMsg("Indica el número de justificante / CSV.");
      return;
    }
    startTransition(async () => {
      const r = await registerManualAeatFilingAction({
        preFilingReviewId: reviewId,
        model,
        year,
        quarter,
        filedAt,
        receiptId: receiptId.trim(),
        attemptId,
        useFrozenBoxes: true,
        filedResult: match
          ? undefined
          : differResult.trim() || "99999.99",
        notes: match ? null : "Registro con importes distintos al freeze",
      });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      setMsg(
        r.reviewMatchFlag === "FILED_MATCHES_REVIEW"
          ? "Filing registrado · coincide con freeze"
          : "Filing registrado · FILED_DIFFERS_FROM_REVIEW"
      );
    });
  }

  return (
    <div className="rounded-lg border border-line px-4 py-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Presentación asistida · Modelo {model}</p>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={pending}
          onClick={prepare}
        >
          {pending ? "Preparando…" : "Preparar presentación"}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Sin envío automático a AEAT. Abre la Sede, copia casillas y registra el
        justificante después.
      </p>
      {msg ? <p className="text-xs text-ink-muted">{msg}</p> : null}
      {sedeUrl ? (
        <a
          href={sedeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-accent underline text-xs"
        >
          Abrir Sede AEAT (modelo {model})
        </a>
      ) : null}
      {paymentNote ? (
        <p className="text-xs text-ink-muted">Pago / NRC: {paymentNote}</p>
      ) : null}
      {checklist.length > 0 ? (
        <ul className="list-inside list-disc text-xs text-ink-muted">
          {checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      {boxes.length > 0 ? (
        <CopyableBoxes boxes={boxes} result={result} resultLabel="Resultado" />
      ) : null}
      {attemptId ? (
        <div className="space-y-2 border-t border-line/60 pt-3">
          <p className="text-xs font-medium">Registrar justificante (MANUAL_AEAT)</p>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-md border border-line bg-canvas px-2 py-1 text-xs"
              placeholder="Justificante / CSV"
              value={receiptId}
              onChange={(e) => setReceiptId(e.target.value)}
            />
            <input
              type="date"
              className="rounded-md border border-line bg-canvas px-2 py-1 text-xs"
              value={filedAt}
              onChange={(e) => setFiledAt(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={pending}
              onClick={() => register(true)}
            >
              Registrar (coincide freeze)
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-md border border-line bg-canvas px-2 py-1 text-xs"
              placeholder="Resultado distinto (opcional)"
              value={differResult}
              onChange={(e) => setDifferResult(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              onClick={() => register(false)}
            >
              Registrar con diferencia
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
