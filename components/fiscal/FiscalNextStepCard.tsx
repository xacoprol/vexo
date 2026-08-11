import Link from "next/link";
import type { FiscalNextStep } from "@/lib/fiscal-next-step";

export function FiscalNextStepCard({ step }: { step: FiscalNextStep }) {
  const border =
    step.tone === "done"
      ? "border-success/30 bg-success/5"
      : step.tone === "warning"
        ? "border-warning/30 bg-warning/10"
        : "border-accent/30 bg-accent-soft/50";
  const titleColor =
    step.tone === "done"
      ? "text-success"
      : step.tone === "warning"
        ? "text-warning"
        : "text-ink";

  return (
    <section className={`rounded-xl border px-5 py-4 ${border}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Tu próximo paso
      </p>
      <h2 className={`mt-1 text-xl font-semibold tracking-tight ${titleColor}`}>
        {step.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">{step.detail}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={step.href} className="btn-primary">
          {step.cta}
        </Link>
        <Link href="/fiscal/guide" className="text-sm text-accent underline">
          Ver guía completa
        </Link>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Recuerda: Vexo prepara borradores. Presentar = sede AEAT con Cl@ve → subir
        PDF a Presentados.
      </p>
    </section>
  );
}
