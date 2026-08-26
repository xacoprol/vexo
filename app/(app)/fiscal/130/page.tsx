import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  buildFiscalPeriodSummary,
  parseFiscalPeriod,
} from "@/lib/fiscal";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import { FiscalPeriodNav } from "@/components/fiscal/FiscalPeriodNav";
import { ModeloDraft } from "@/components/fiscal/ModeloDraft";
import { FilingCompare } from "@/components/fiscal/FilingCompare";

export default async function Modelo130Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { year, quarter } = parseFiscalPeriod(sp);
  const [summary, presented, settings] = await Promise.all([
    buildFiscalPeriodSummary(year, quarter),
    getPresentedFiling("130", year, quarter),
    prisma.companySettings.findFirst(),
  ]);
  const regime = settings?.fiscalRegime ?? "130";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/fiscal?year=${year}&q=${quarter}`} className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Modelo 130
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pago fraccionado IRPF · estimación directa (borrador)
        </p>
      </div>
      <FiscalPeriodNav
        year={year}
        quarter={quarter}
        basePath="/fiscal/130"
      />
      {regime === "131" ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          En Ajustes figura régimen 131 (módulos). Este borrador 130 no te
          aplica.
        </p>
      ) : null}
      {summary.modelo130.warnings?.length ? (
        <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <p className="font-medium text-warning">Requiere revisión</p>
          <ul className="list-disc space-y-1 pl-5 text-warning/90">
            {summary.modelo130.warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <FilingCompare
        modelLabel="130"
        modelType="130"
        year={year}
        quarter={quarter}
        draftResult={summary.modelo130.result}
        draftBoxes={summary.modelo130.boxes}
        incomeBase={
          summary.modelo130.boxes.find((b) => b.code === "01")?.value ??
          summary.issued.incomeBase
        }
        expensesBase={
          summary.modelo130.boxes.find((b) => b.code === "02")?.value ??
          summary.expenses.base
        }
        presented={presented}
      />
      <ModeloDraft title="Casillas orientativas" model="130" summary={summary} />
      <p className="text-xs text-ink-muted">
        El 130 es <strong>acumulado desde el 1 de enero</strong> hasta el fin
        del trimestre (como pide AEAT). Casilla 12 = max(0, 07 + 11). Solo
        apartado I (no agrícolas). Obligación de presentar:{" "}
        <strong>{summary.modelo130.filingObligation?.status ?? "—"}</strong>
        {summary.modelo130.filingObligation?.reasons?.[0]
          ? ` — ${summary.modelo130.filingObligation.reasons[0]}`
          : ""}
        . Imputación IRPF por devengo (fecha factura), no por cobro.
      </p>
    </div>
  );
}
