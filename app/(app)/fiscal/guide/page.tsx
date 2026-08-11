import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
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
import { CopyableBoxes } from "@/components/fiscal/CopyableBoxes";

export default async function FiscalGuidePage() {
  const now = new Date();
  const target = filingTargetPeriod(now);
  const year = target.year;
  const quarter = target.quarter as FiscalQuarter;
  const summary = await buildFiscalPeriodSummary(year, quarter);
  const deadlines = buildUpcomingDeadlines(now);

  const [presented303, presented130] = await Promise.all([
    getPresentedFiling("303", year, quarter),
    getPresentedFiling("130", year, quarter),
  ]);

  const expenseCount = summary.expenses.count;
  const marketplaceCount = summary.issued.marketplaceCount;
  const invoiceCount = summary.issued.count;

  const checklist = [
    {
      ok: invoiceCount > 0 || marketplaceCount > 0,
      label: "Ingresos del periodo",
      hint:
        invoiceCount + marketplaceCount > 0
          ? `${invoiceCount} facturas W3D · ${marketplaceCount} marketplace`
          : "Importa Amazon/Shopify o emite facturas",
      href: "/fiscal/income",
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
      ok: Boolean(presented303),
      label: `303 ${quarter}T ${year} presentado`,
      hint: presented303
        ? `Guardado · resultado ${formatCurrency(presented303.result)}`
        : "Cuando lo presentes en la AEAT, sube el PDF a Presentados",
      href: "/fiscal/filings",
    },
    {
      ok: Boolean(presented130),
      label: `130 ${quarter}T ${year} presentado`,
      hint: presented130
        ? `Guardado · resultado ${formatCurrency(presented130.result)}`
        : "Igual: presenta y sube el justificante",
      href: "/fiscal/filings",
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
          Te digo qué modelo toca, con qué casillas y en qué orden. Tú solo
          copias en la sede de la AEAT.
        </p>
      </div>

      <section className="card-panel space-y-3 p-5">
        <h2 className="form-section-title">Ahora mismo</h2>
        <p className="text-sm text-ink">
          Periodo a liquidar:{" "}
          <span className="font-semibold">
            {quarter}T {year}
          </span>
          . Primero el <strong>303 (IVA)</strong>, luego el{" "}
          <strong>130 (IRPF)</strong>. Si tuviste compras/ventas en la UE, el{" "}
          <strong>349</strong>.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>
            Completa{" "}
            <Link href="/fiscal/expenses" className="text-accent underline">
              gastos
            </Link>{" "}
            e{" "}
            <Link href="/fiscal/income" className="text-accent underline">
              ingresos marketplace
            </Link>{" "}
            del trimestre.
          </li>
          <li>Revisa las casillas de abajo (se calculan solas).</li>
          <li>
            Entra en la{" "}
            <a
              href="https://sede.agenciatributaria.gob.es/"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              sede AEAT
            </a>
            , abre el modelo y pega casilla a casilla.
          </li>
          <li>
            Cuando acabes, sube el PDF en{" "}
            <Link href="/fiscal/filings" className="text-accent underline">
              Presentados
            </Link>{" "}
            para no perder el justificante.
          </li>
        </ol>
      </section>

      <section className="card-panel space-y-3 p-5">
        <h2 className="form-section-title">Checklist {quarter}T {year}</h2>
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
                  : null;
            return (
              <div key={`${d.model}-${d.periodLabel}`} className="card-panel p-4">
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
                </p>
                <Link href={d.href} className="btn-secondary mt-3 inline-flex text-xs">
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
        <Link href={`/fiscal/303?year=${year}&q=${quarter}`} className="text-sm text-accent underline">
          Abrir página completa del 303
        </Link>
      </section>

      <section className="card-panel space-y-4 p-5">
        <div>
          <h2 className="form-section-title">
            Casillas 130 · {quarter}T {year}
          </h2>
          <p className="form-section-hint">
            Acumulado desde el 1 de enero. Si el resultado es negativo o cero,
            suele no haber que ingresar (marca la opción que indique la AEAT).
          </p>
        </div>
        <CopyableBoxes
          boxes={summary.modelo130.boxes}
          result={summary.modelo130.result}
          resultLabel="Resultado pago fraccionado"
        />
        <Link href={`/fiscal/130?year=${year}&q=${quarter}`} className="text-sm text-accent underline">
          Abrir página completa del 130
        </Link>
      </section>

      <p className="rounded-lg border border-line bg-line/20 px-4 py-3 text-xs text-ink-muted">
        Esto es una guía orientativa a partir de tus datos en Vexo. No sustituye
        a un asesor ni a la declaración oficial. Si algo no cuadra (Amazon OSS,
        intracom, prorrateos), revisa con tu gestoría o pregunta aquí antes de
        presentar.
      </p>
    </div>
  );
}
