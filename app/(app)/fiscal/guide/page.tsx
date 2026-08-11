import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
import { prisma } from "@/lib/prisma";
import {
  buildFiscalPeriodSummary,
  type FiscalQuarter,
} from "@/lib/fiscal";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import {
  buildUpcomingDeadlines,
  filingTargetPeriod,
  urgencyLabel,
} from "@/lib/fiscal-calendar";
import { buildModelo349Draft } from "@/lib/fiscal-347-349";
import { listPendingLiquidaciones } from "@/lib/fiscal-payments";
import { resolveFiscalNextStep } from "@/lib/fiscal-next-step";
import { CopyableBoxes } from "@/components/fiscal/CopyableBoxes";
import { ThirdPartyOpsTable } from "@/components/fiscal/ThirdPartyOpsTable";
import { FiscalNextStepCard } from "@/components/fiscal/FiscalNextStepCard";

export default async function FiscalGuidePage() {
  const now = new Date();
  const target = filingTargetPeriod(now);
  const year = target.year;
  const quarter = target.quarter as FiscalQuarter;
  const [
    summary,
    draft349,
    presented303,
    presented130,
    presented349,
    pendingPay,
    aeatOpenCount,
    booksForYear,
    settings,
  ] = await Promise.all([
    buildFiscalPeriodSummary(year, quarter),
    buildModelo349Draft(year, quarter),
    getPresentedFiling("303", year, quarter),
    getPresentedFiling("130", year, quarter),
    getPresentedFiling("349", year, quarter),
    listPendingLiquidaciones(),
    prisma.aeatCommunication.count({ where: { status: "ABIERTA" } }),
    prisma.registerBook.findMany({
      where: { year },
      select: { bookType: true, _count: { select: { lines: true } } },
    }),
    prisma.companySettings.findFirst({ select: { fiscalRegime: true } }),
  ]);
  const deadlines = buildUpcomingDeadlines(now);
  const skip130 = (settings?.fiscalRegime ?? "130") === "131";

  const expenseCount = summary.expenses.count;
  const marketplaceCount = summary.issued.marketplaceCount;
  const invoiceCount = summary.issued.count;

  const bookIngresos = booksForYear.find((b) => b.bookType === "INGRESOS");
  const bookGastos = booksForYear.find((b) => b.bookType === "GASTOS");
  const bookBienes = booksForYear.find((b) => b.bookType === "BIENES");
  const booksOk = Boolean(
    bookIngresos &&
      bookIngresos._count.lines > 0 &&
      bookGastos &&
      bookGastos._count.lines > 0
  );
  const booksHint = booksOk
    ? `Ingresos ${bookIngresos!._count.lines} · Gastos ${bookGastos!._count.lines}${
        bookBienes ? ` · Bienes ${bookBienes._count.lines}` : " · Bienes pendiente"
      }`
    : !bookIngresos || !bookGastos
      ? "Falta generar o importar libros de ingresos y gastos del año"
      : "Libros sin líneas: regenera desde facturas/gastos";

  const nextStep = resolveFiscalNextStep({
    year,
    quarter,
    hasIncome: invoiceCount > 0 || marketplaceCount > 0,
    hasExpenses: expenseCount > 0,
    booksOk,
    presented303: Boolean(presented303),
    presented130: Boolean(presented130),
    has349Ops: draft349.hasOps,
    incomplete349Nif: draft349.incompleteNif,
    presented349: Boolean(presented349),
    pendingNrcCount: pendingPay.length,
    aeatOpenCount,
    skip130,
  });

  const checklist = [
    {
      ok: invoiceCount > 0 || marketplaceCount > 0,
      label: "Ingresos del periodo",
      hint:
        invoiceCount + marketplaceCount > 0
          ? `${invoiceCount} facturas W3D · ${marketplaceCount} marketplace`
          : "Emite facturas y/o importa Amazon/Shopify",
      href: "/invoices",
    },
    {
      ok: expenseCount > 0,
      label: "Gastos del trimestre",
      hint:
        expenseCount > 0
          ? `${expenseCount} gastos · base ${formatCurrency(summary.expenses.base)}`
          : "Sube facturas de gasto (PDF/CSV Amazon)",
      href: "/fiscal/expenses",
    },
    {
      ok: booksOk,
      label: `Libros registro ${year}`,
      hint: booksHint,
      href: `/fiscal/books?year=${year}`,
    },
    {
      ok: Boolean(presented303),
      label: `303 ${quarter}T ${year} presentado`,
      hint: presented303
        ? `Guardado · resultado ${formatCurrency(presented303.result)}`
        : "Copia casillas → Cl@ve en sede → sube PDF a Presentados",
      href: `/fiscal/303?year=${year}&q=${quarter}`,
    },
    {
      ok: skip130 || Boolean(presented130),
      label: skip130
        ? `130 ${quarter}T ${year} (régimen 131: no aplica)`
        : `130 ${quarter}T ${year} presentado`,
      hint: skip130
        ? "Estás en módulos; no presentas 130"
        : presented130
          ? `Guardado · resultado ${formatCurrency(presented130.result)}`
          : "Presenta aunque el resultado sea 0 o negativo; luego sube el PDF",
      href: `/fiscal/130?year=${year}&q=${quarter}`,
    },
    {
      ok: draft349.incompleteNif
        ? false
        : !draft349.hasOps || Boolean(presented349),
      label: draft349.incompleteNif
        ? `349 ${quarter}T ${year}: faltan NIF-IVA`
        : draft349.hasOps
          ? `349 ${quarter}T ${year} presentado`
          : `349 ${quarter}T ${year} (no aplica)`,
      hint: draft349.incompleteNif
        ? `${draft349.skippedNoNif.adquisiciones + draft349.skippedNoNif.entregas} ops UE sin VAT ID — complétalas antes de presentar`
        : draft349.hasOps
          ? presented349
            ? `Guardado · ${formatCurrency(presented349.result)}`
            : `Hay ops UE · entregas ${formatCurrency(draft349.totalEntregas)} · adquis. ${formatCurrency(draft349.totalAdquisiciones)}`
          : "Sin ops intracomunitarias este trimestre",
      href: draft349.incompleteNif
        ? "/fiscal/expenses?missingNif=1"
        : `/fiscal/349?year=${year}&q=${quarter}`,
    },
    {
      ok: pendingPay.length === 0,
      label:
        pendingPay.length === 0
          ? "Pagos / NRC al día"
          : `${pendingPay.length} liquidación(es) sin NRC`,
      hint:
        pendingPay.length === 0
          ? "No hay 303/130 a ingresar sin pago"
          : pendingPay
              .slice(0, 3)
              .map((p) => `${p.modelType} ${p.periodLabel}`)
              .join(" · "),
      href: "/fiscal/payments",
    },
    {
      ok: aeatOpenCount === 0,
      label:
        aeatOpenCount === 0
          ? "AEAT sin plazos abiertos"
          : `${aeatOpenCount} comunicación(es) AEAT abiertas`,
      hint:
        aeatOpenCount === 0
          ? "Sin requerimientos pendientes en Vexo (mira también DEHú)"
          : "Registra plazo y marca respondida cuando acabes",
      href: "/fiscal/aeat",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Guía de presentación
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Un solo camino: datos → casillas → Cl@ve en la AEAT → PDF en
          Presentados. Periodo:{" "}
          <span className="font-medium text-ink">
            {quarter}T {year}
          </span>
          .
        </p>
      </div>

      <FiscalNextStepCard step={nextStep} />

      <section className="card-panel space-y-3 p-5">
        <h2 className="form-section-title">Cómo se presenta (siempre igual)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>
            Datos del trimestre al día: facturas, marketplace, gastos. Las{" "}
            <Link href="/recurring" className="text-accent underline">
              periódicas
            </Link>{" "}
            generan proformas: conviértelas en factura si deben entrar en el IVA.
          </li>
          <li>
            Regenera{" "}
            <Link
              href={`/fiscal/books?year=${year}`}
              className="text-accent underline"
            >
              libros
            </Link>{" "}
            (archivo formal; no cambian las casillas del borrador).
          </li>
          <li>
            Orden: <strong className="text-ink">303</strong> →{" "}
            <strong className="text-ink">130</strong>
            {draft349.needsAttention ? (
              <>
                {" "}
                → <strong className="text-ink">349</strong>
              </>
            ) : null}
            . Copia casillas abajo o en cada página del modelo.
          </li>
          <li>
            Entra en la{" "}
            <a
              href="https://sede.agenciatributaria.gob.es/"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              sede AEAT
            </a>{" "}
            con Cl@ve, abre el modelo y pega casilla a casilla.
          </li>
          <li>
            Sube el PDF en{" "}
            <Link href="/fiscal/filings" className="text-accent underline">
              Presentados
            </Link>
            . Si hay que pagar, anota el NRC en{" "}
            <Link href="/fiscal/payments" className="text-accent underline">
              Pagos
            </Link>
            .
          </li>
        </ol>
      </section>

      <section className="card-panel space-y-3 p-5">
        <h2 className="form-section-title">
          Checklist {quarter}T {year}
        </h2>
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li
              key={c.label}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">
                  <span className={c.ok ? "text-success" : "text-warning"}>
                    {c.ok ? "✓" : "○"}
                  </span>{" "}
                  {c.label}
                </p>
                <p className="text-xs text-ink-muted">{c.hint}</p>
              </div>
              <Link href={c.href} className="btn-ghost text-xs">
                Ir
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Plazos próximos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {deadlines.map((d) => {
            const u = urgencyLabel(d.dueDate, now);
            const presented =
              d.model === "303"
                ? presented303
                : d.model === "130"
                  ? presented130
                  : d.model === "349"
                    ? presented349
                    : null;
            return (
              <div
                key={`${d.model}-${d.periodLabel}`}
                className="card-panel p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-lg font-semibold">{d.model}</p>
                    <p className="text-sm text-ink-muted">{d.periodLabel}</p>
                  </div>
                  <span
                    className={`badge text-xs ${
                      u.kind === "overdue" || u.kind === "soon"
                        ? "bg-warning/15 text-warning"
                        : "bg-line text-ink-muted"
                    }`}
                  >
                    {presented ? "Presentado" : u.text}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink-muted">{d.what}</p>
                <p className="mt-1 text-xs">
                  Límite: <span className="font-medium">{d.dueLabel}</span>
                  {d.model === "303" || d.model === "130" ? (
                    <span className="text-ink-muted">
                      {" "}
                      (domiciliación suele ser ~día 15)
                    </span>
                  ) : null}
                </p>
                <Link
                  href={d.href}
                  className="btn-secondary mt-3 inline-flex text-xs"
                >
                  Ver casillas
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-panel space-y-4 p-5">
        <div>
          <h2 className="form-section-title">
            Casillas 303 · {quarter}T {year}
          </h2>
          <p className="form-section-hint">
            Calculadas con tus facturas, marketplace y gastos. Si falta gasto, el
            IVA a pagar sale más alto.
          </p>
        </div>
        <CopyableBoxes
          boxes={summary.modelo303.boxes}
          result={summary.modelo303.result}
          resultLabel="A ingresar / compensar (casilla resultado)"
        />
        <Link
          href={`/fiscal/303?year=${year}&q=${quarter}`}
          className="text-sm text-accent underline"
        >
          Abrir página completa del 303
        </Link>
      </section>

      <section className="card-panel space-y-4 p-5">
        <div>
          <h2 className="form-section-title">
            Casillas 130 · {quarter}T {year}
          </h2>
          <p className="form-section-hint">
            Acumulado desde el 1 de enero. Aunque el resultado sea 0 o negativo,
            en estimación directa suele haber que presentar (elige la opción que
            indique la AEAT).
          </p>
        </div>
        <CopyableBoxes
          boxes={summary.modelo130.boxes}
          result={summary.modelo130.result}
          resultLabel="Resultado pago fraccionado"
        />
        <Link
          href={`/fiscal/130?year=${year}&q=${quarter}`}
          className="text-sm text-accent underline"
        >
          Abrir página completa del 130
        </Link>
      </section>

      {draft349.needsAttention ? (
        <section className="card-panel space-y-4 p-5">
          <div>
            <h2 className="form-section-title">
              349 · {quarter}T {year}
            </h2>
            <p className="form-section-hint">
              {draft349.incompleteNif
                ? "Hay operaciones UE sin NIF-IVA: complétalas antes de presentar."
                : "Operadores a declarar en la sede AEAT."}
            </p>
          </div>
          <ThirdPartyOpsTable
            title="Entregas"
            ops={draft349.entregas}
            emptyText="Sin entregas UE"
            keyLabels={{ E: "entregas" }}
          />
          <ThirdPartyOpsTable
            title="Adquisiciones"
            ops={draft349.adquisiciones}
            emptyText="Sin adquisiciones UE"
            keyLabels={{ A: "adquisiciones" }}
          />
          <Link
            href={`/fiscal/349?year=${year}&q=${quarter}`}
            className="text-sm text-accent underline"
          >
            Abrir 349 completo
          </Link>
        </section>
      ) : null}
    </div>
  );
}
