import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/calculations";
import {
  deleteInvestmentAsset,
  updateInvestmentAsset,
} from "./actions";

export default async function FiscalAssetsPage() {
  const assets = await prisma.investmentAsset.findMany({
    include: {
      amortizations: { orderBy: { year: "asc" } },
    },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Bienes de inversión
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Altas desde el libro de bienes y cuadro lineal. El 130 prorratea por
          meses desde la fecha de alta y corta al final de la vida útil.
        </p>
      </div>

      {assets.length === 0 ? (
        <p className="card-panel px-4 py-8 text-center text-sm text-ink-muted">
          No hay bienes. Importa el libro de bienes de inversión en{" "}
          <Link href="/fiscal/books" className="text-accent underline">
            Libros registro
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {assets.map((a) => (
            <section key={a.id} className="card-panel space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{a.description}</h2>
                  <p className="text-sm text-ink-muted">
                    {a.supplierName ?? "—"}
                    {a.invoiceNumber ? ` · ${a.invoiceNumber}` : ""}
                    {a.purchaseDate
                      ? ` · ${formatDate(a.purchaseDate)}`
                      : ""}
                  </p>
                  <p className="mt-1 font-mono text-sm">
                    Base {formatCurrency(Number(a.base))} · IVA{" "}
                    {formatCurrency(Number(a.vatAmount))}
                  </p>
                </div>
                <form action={deleteInvestmentAsset.bind(null, a.id)}>
                  <button type="submit" className="text-xs text-danger hover:underline">
                    Borrar
                  </button>
                </form>
              </div>

              <form
                action={updateInvestmentAsset.bind(null, a.id)}
                className="flex flex-wrap items-end gap-3"
              >
                <div>
                  <label className="label" htmlFor={`life-${a.id}`}>
                    Años vida útil
                  </label>
                  <input
                    id={`life-${a.id}`}
                    name="usefulLifeYears"
                    type="number"
                    min={1}
                    max={40}
                    defaultValue={a.usefulLifeYears}
                    className="input w-24"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`start-${a.id}`}>
                    Año inicio
                  </label>
                  <input
                    id={`start-${a.id}`}
                    name="startYear"
                    type="number"
                    defaultValue={
                      a.startYear ??
                      a.purchaseDate?.getFullYear() ??
                      new Date().getFullYear()
                    }
                    className="input w-28"
                  />
                </div>
                <div className="min-w-[12rem] flex-1">
                  <label className="label" htmlFor={`notes-${a.id}`}>
                    Notas
                  </label>
                  <input
                    id={`notes-${a.id}`}
                    name="notes"
                    defaultValue={a.notes ?? ""}
                    className="input"
                  />
                </div>
                <button type="submit" className="btn-secondary text-sm">
                  Recalcular amortización
                </button>
              </form>

              {a.amortizations.length ? (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-ink-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">Año</th>
                      <th className="py-1 text-right font-medium">Cuota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.amortizations.map((am) => (
                      <tr key={am.id} className="border-t border-line/40">
                        <td className="py-1">{am.year}</td>
                        <td className="py-1 text-right font-mono">
                          {formatCurrency(Number(am.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
