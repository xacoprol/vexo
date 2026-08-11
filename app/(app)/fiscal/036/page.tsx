import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/calculations";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";

const CHECKLIST = [
  {
    title: "Epígrafes IAE",
    hint: "Comprueba que tus actividades (fabricación / comercio / marketplace) están dadas de alta.",
  },
  {
    title: "ROI (Registro de operadores intracomunitarios)",
    hint: "Necesario si haces compras/ventas UE (Bambu, clientes UE). Sin ROI no debes facturar intracom.",
  },
  {
    title: "Domicilio fiscal y datos de contacto",
    hint: "Deben coincidir con Ajustes (NIF, dirección, email).",
  },
  {
    title: "Obligaciones periódicas",
    hint: "303, 130, 349 si aplica, 390/347 anuales. No se cambian en el 036 salvo alta/baja.",
  },
  {
    title: "OSS / ventas a distancia UE",
    hint: "Si vendes B2C UE fuera de OSS/Amazon, revisa umbrales. Marketplace suele recaudar por ti.",
  },
  {
    title: "Modificación cuando cambie algo",
    hint: "Cambio de domicilio, alta ROI, nueva actividad → presenta 036/037 y archiva el PDF aquí.",
  },
] as const;

export default async function Modelo036Page() {
  const filings = await prisma.fiscalFiling.findMany({
    where: { modelType: "036" },
    include: { documents: { take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
  const censusDocs = await prisma.fiscalDocument.findMany({
    where: { category: "CENSUS" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Censo 036 / 037
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Checklist de obligaciones censales. Presentación en la sede AEAT con
          Cl@ve; aquí archivas el justificante.
        </p>
      </div>

      <section className="card-panel space-y-3 p-5">
        <h2 className="form-section-title">Checklist censal</h2>
        <p className="form-section-hint">
          No es un formulario automático: úsalo para revisar antes de tocar el
          036. Enlace:{" "}
          <a
            href="https://sede.agenciatributaria.gob.es/"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            sede AEAT
          </a>
          .
        </p>
        <ul className="space-y-2">
          {CHECKLIST.map((c) => (
            <li
              key={c.title}
              className="rounded-lg border border-line px-3 py-2.5"
            >
              <p className="text-sm font-medium">{c.title}</p>
              <p className="text-xs text-ink-muted">{c.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-panel overflow-x-auto p-5">
        <h2 className="form-section-title">036 presentados</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Sube el PDF en{" "}
          <Link href="/fiscal/filings" className="text-accent underline">
            Presentados
          </Link>{" "}
          o en el{" "}
          <Link href="/fiscal/archive" className="text-accent underline">
            Archivo
          </Link>
          .
        </p>
        {filings.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Aún no hay 036 estructurados. Puede haber certificados en Archivo.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-line text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-left">Año</th>
                <th className="px-2 py-2 text-left">Presentado</th>
                <th className="px-2 py-2 text-left">Documento</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} className="border-b border-line/40">
                  <td className="px-2 py-2">{f.year}</td>
                  <td className="px-2 py-2 text-ink-muted">
                    {f.filedAt ? formatDate(f.filedAt) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {f.documents[0] ? (
                      <a
                        href={fiscalDocumentHref(f.documents[0].id)}
                        className="text-accent underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    ) : (
                      f.sourceFileName ?? "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {censusDocs.length > 0 ? (
        <section className="card-panel p-5">
          <h2 className="form-section-title">Documentos censales (archivo)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {censusDocs.map((d) => (
              <li key={d.id}>
                <a
                  href={fiscalDocumentHref(d.id)}
                  className="text-accent underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.title}
                </a>
                <span className="ml-2 text-xs text-ink-muted">
                  {d.sourceFileName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
