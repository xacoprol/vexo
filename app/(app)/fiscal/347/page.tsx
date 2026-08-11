import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
import { parseFiscalYear } from "@/lib/fiscal";
import { buildModelo347Draft, MODELO_347_THRESHOLD } from "@/lib/fiscal-347-349";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { ThirdPartyOpsTable } from "@/components/fiscal/ThirdPartyOpsTable";
import { FilingCompare } from "@/components/fiscal/FilingCompare";

export default async function Modelo347Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = parseFiscalYear(sp);
  const nowY = new Date().getFullYear();
  const years: number[] = [];
  for (let y = nowY; y >= nowY - 3; y--) years.push(y);

  const [draft, presented] = await Promise.all([
    buildModelo347Draft(year),
    getPresentedFiling("347", year, null),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Modelo 347
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Declaración anual de operaciones con terceras personas (borrador).
          Umbral {formatCurrency(MODELO_347_THRESHOLD)} por tercero.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/fiscal/347?year=${y}`}
            className={y === year ? "btn-primary text-xs" : "btn-ghost text-xs"}
          >
            {y}
          </Link>
        ))}
      </div>

      <FilingCompare
        modelLabel="347"
        modelType="347"
        year={year}
        quarter={null}
        draftResult={draft.totalDeclared}
        draftBoxes={[
          {
            code: "total",
            label: "Importe total declarado",
            value: draft.totalDeclared,
          },
        ]}
        presented={presented}
      />

      {draft.skippedNoNif.sales + draft.skippedNoNif.purchases > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Excluidas del borrador por falta de NIF:{" "}
          {draft.skippedNoNif.sales} factura(s) y{" "}
          {draft.skippedNoNif.purchases} gasto(s). Complétalos en clientes /
          gastos o el 347 saldrá incompleto.
        </p>
      ) : null}

      <section className="card-panel space-y-4 p-5">
        <div>
          <h2 className="form-section-title">Declarables · {year}</h2>
          <p className="form-section-hint">
            Ventas nacionales (clave B) y compras interiores con NIF (clave A).
            Marketplace B2C y operaciones intracom/export no entran aquí.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <p>
            Ventas:{" "}
            <span className="font-mono font-medium">
              {formatCurrency(draft.salesTotal)}
            </span>
          </p>
          <p>
            Compras:{" "}
            <span className="font-mono font-medium">
              {formatCurrency(draft.purchasesTotal)}
            </span>
          </p>
          <p>
            Terceros:{" "}
            <span className="font-mono font-medium">{draft.declared.length}</span>
          </p>
        </div>
        <ThirdPartyOpsTable
          title="Terceros a declarar"
          ops={draft.declared}
          emptyText={`Nadie supera ${formatCurrency(MODELO_347_THRESHOLD)} en ${year}.`}
          keyLabels={{ A: "compras", B: "ventas" }}
        />
      </section>

      {draft.belowThreshold.length > 0 ? (
        <details className="card-panel px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-muted">
            Por debajo del umbral ({draft.belowThreshold.length})
          </summary>
          <div className="mt-4">
            <ThirdPartyOpsTable
              title="No declarables"
              ops={draft.belowThreshold}
              keyLabels={{ A: "compras", B: "ventas" }}
            />
          </div>
        </details>
      ) : null}

      <section className="card-panel overflow-x-auto p-5">
        <h2 className="form-section-title">Presentados</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Sube el PDF en{" "}
          <Link href="/fiscal/filings" className="text-accent underline">
            Presentados
          </Link>{" "}
          tras enviarlo a la AEAT.
        </p>
        {presented ? (
          <p className="mt-3 text-sm">
            Año {presented.year} · resultado registrado{" "}
            <span className="font-mono">
              {formatCurrency(presented.result)}
            </span>
            {presented.sourceFileName
              ? ` · ${presented.sourceFileName}`
              : ""}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            Aún no hay 347 de {year} en Presentados.
          </p>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        Orientativo por NIF e importe con IVA incluido (≥ 3.005,06 €). Revisa claves A/B en la sede y
        que los NIF de proveedores estén bien en gastos.
      </p>
    </div>
  );
}
