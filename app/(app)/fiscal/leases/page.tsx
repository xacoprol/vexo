import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/calculations";
import { LeaseForm } from "@/components/fiscal/LeaseForm";
import { deactivateLease } from "./actions";

function withholdingLabel(status: string): string {
  if (status === "YES") return "Sí";
  if (status === "NO") return "No";
  return "Revisar";
}

export default async function FiscalLeasesPage() {
  const leases = await prisma.businessPremisesLease.findMany({
    include: { counterparty: true },
    orderBy: [{ active: "desc" }, { startDate: "desc" }],
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Locales / inmuebles arrendados
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Fuente de verdad fiscal para futuros Modelos 115 y 180. No es un CRM
          inmobiliario. La retención se declara por local; no se infiere por
          categoría de gasto.
        </p>
      </div>

      <LeaseForm />

      {leases.length === 0 ? (
        <p className="card-panel px-4 py-8 text-center text-sm text-ink-muted">
          No hay locales. Crea uno arriba y luego vincula los recibos de alquiler
          desde Gastos.
        </p>
      ) : (
        <div className="space-y-3">
          {leases.map((l) => (
            <section key={l.id} className="card-panel space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">
                    {l.propertyAddress}
                    {!l.active ? (
                      <span className="ml-2 text-xs text-ink-muted">(inactivo)</span>
                    ) : null}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Arrendador: {l.counterparty.name}
                    {l.counterparty.taxId
                      ? ` · NIF: ${l.counterparty.taxId}`
                      : " · NIF: pendiente revisión"}
                  </p>
                  <p className="text-sm text-ink-muted">
                    Inicio: {formatDate(l.startDate)}
                    {l.endDate ? ` · Fin: ${formatDate(l.endDate)}` : ""}
                    {" · "}
                    Retención: {withholdingLabel(l.withholdingStatus)}
                    {l.withholdingStatus === "YES" &&
                    l.defaultWithholdingRate != null
                      ? ` (${l.defaultWithholdingRate} %)`
                      : ""}
                  </p>
                  {l.cadastralReference ? (
                    <p className="text-xs text-ink-muted">
                      Catastro: {l.cadastralReference}
                    </p>
                  ) : null}
                </div>
                {l.active ? (
                  <form action={deactivateLease.bind(null, l.id)}>
                    <button
                      type="submit"
                      className="text-xs text-danger hover:underline"
                    >
                      Desactivar
                    </button>
                  </form>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
