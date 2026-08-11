import Link from "next/link";
import {
  buildFiscalPeriodSummary,
  parseFiscalPeriod,
} from "@/lib/fiscal";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { ModeloDraft } from "@/components/fiscal/ModeloDraft";
import { FilingCompare } from "@/components/fiscal/FilingCompare";

export default async function Modelo303Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [summary, presented] = await Promise.all([
    buildFiscalPeriodSummary(year, quarter),
    getPresentedFiling("303", year, quarter),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/fiscal?year=${year}&q=${quarter}`} className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Modelo 303
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Autoliquidación IVA trimestral (borrador)
        </p>
      </div>
      <FiscalPeriodNav
        year={year}
        quarter={quarter}
        basePath="/fiscal/303"
      />
      <FilingCompare
        modelLabel="303"
        modelType="303"
        year={year}
        quarter={quarter}
        draftResult={summary.modelo303.result}
        draftBoxes={summary.modelo303.boxes}
        incomeBase={summary.issued.incomeBase}
        expensesBase={summary.expenses.base}
        vatRepercutida={summary.issued.quotaRepercutida}
        vatDeductible={summary.expenses.vatDeductible}
        presented={presented}
      />
      <ModeloDraft title="Casillas orientativas" model="303" summary={summary} />
      <p className="text-xs text-ink-muted">
        Copia estos importes en la sede electrónica (régimen general). Casilla{" "}
        <strong>69</strong> es el resultado a ingresar / compensar. La{" "}
        <strong>110</strong> arrastra saldos negativos de trimestres previos del
        año (y del 4T anterior si lo tienes en Presentados). Canarias va en{" "}
        <strong>60</strong> con exportaciones; marketplace OSS en{" "}
        <strong>123</strong>. Compras UE (Bambu, etc.) van en{" "}
        <strong>10/11</strong> y <strong>36/37</strong> si el gasto está marcado
        como intracomunitario. No cubre criterio de caja.
      </p>
    </div>
  );
}
