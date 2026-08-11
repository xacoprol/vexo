import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
import { parseFiscalPeriod } from "@/lib/fiscal";
import { buildModelo349Draft } from "@/lib/fiscal-347-349";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { ThirdPartyOpsTable } from "@/components/fiscal/ThirdPartyOpsTable";
import { FilingCompare } from "@/components/fiscal/FilingCompare";

export default async function Modelo349Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [draft, presented] = await Promise.all([
    buildModelo349Draft(year, quarter),
    getPresentedFiling("349", year, quarter),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/fiscal?year=${year}&q=${quarter}`}
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Modelo 349
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Declaración recapitulativa de operaciones intracomunitarias (borrador)
        </p>
      </div>

      <FiscalPeriodNav year={year} quarter={quarter} basePath="/fiscal/349" />

      <FilingCompare
        modelLabel="349"
        draftResult={draft.totalEntregas + draft.totalAdquisiciones}
        presented={presented}
      />

      {draft.skippedNoNif.entregas + draft.skippedNoNif.adquisiciones > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Excluidas del 349 por falta de NIF-IVA:{" "}
          {draft.skippedNoNif.entregas} entrega(s) y{" "}
          {draft.skippedNoNif.adquisiciones} adquisición(es). Sin VAT ID no se
          pueden declarar.
        </p>
      ) : null}

      {!draft.hasOps ? (
        <p className="rounded-lg border border-line bg-accent-soft/40 px-4 py-3 text-sm text-ink-muted">
          No hay operaciones UE en {draft.label}. Si no tuviste ventas
          intracomunitarias ni compras AIB (Bambu, etc.), normalmente no hace
          falta presentar el 349 este trimestre.
        </p>
      ) : null}

      <section className="card-panel space-y-6 p-5">
        <div>
          <h2 className="form-section-title">
            Operadores · {draft.label}
          </h2>
          <p className="form-section-hint">
            Entregas = facturas marcadas intracomunitarias. Adquisiciones =
            gastos marcados como intracomunitarios (AIB).
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <p>
              Entregas:{" "}
              <span className="font-mono font-medium">
                {formatCurrency(draft.totalEntregas)}
              </span>
            </p>
            <p>
              Adquisiciones:{" "}
              <span className="font-mono font-medium">
                {formatCurrency(draft.totalAdquisiciones)}
              </span>
            </p>
          </div>
        </div>

        <ThirdPartyOpsTable
          title="Entregas intracomunitarias"
          hint="Clave E · debe cuadrar con casilla 59 del 303"
          ops={draft.entregas}
          emptyText="Sin entregas UE este trimestre."
          keyLabels={{ E: "entregas" }}
        />

        <ThirdPartyOpsTable
          title="Adquisiciones intracomunitarias"
          hint="Clave A · debe cuadrar con casillas 10/11 del 303"
          ops={draft.adquisiciones}
          emptyText="Sin adquisiciones UE este trimestre."
          keyLabels={{ A: "adquisiciones" }}
        />
      </section>

      <section className="card-panel p-5">
        <h2 className="form-section-title">Presentados</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Tras presentar en la AEAT, sube el PDF en{" "}
          <Link href="/fiscal/filings" className="text-accent underline">
            Presentados
          </Link>
          .
        </p>
        {presented ? (
          <p className="mt-3 text-sm">
            {presented.quarter}T {presented.year} ·{" "}
            <span className="font-mono">
              {formatCurrency(presented.result)}
            </span>
            {presented.sourceFileName
              ? ` · ${presented.sourceFileName}`
              : ""}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            Aún no hay 349 de {draft.label} en Presentados.
          </p>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        Necesitas NIF-IVA correcto del cliente/proveedor UE. Usa la{" "}
        <Link href="/fiscal/guide" className="text-accent underline">
          Guía
        </Link>{" "}
        tras el 303/130.
      </p>
    </div>
  );
}
