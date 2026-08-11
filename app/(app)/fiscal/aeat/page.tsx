import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/calculations";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import {
  createAeatCommunication,
  deleteAeatCommunication,
} from "./actions";

const KIND_LABEL: Record<string, string> = {
  NOTIFICACION: "Notificación",
  REQUERIMIENTO: "Requerimiento",
  COMUNICACION: "Comunicación",
  OTRO: "Otro",
};

export default async function FiscalAeatPage() {
  const rows = await prisma.aeatCommunication.findMany({
    include: { document: true },
    orderBy: { occurredAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Comunicaciones AEAT
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Notificaciones, requerimientos y otras comunicaciones
        </p>
      </div>

      <section className="card-panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Registrar</h2>
        <form action={createAeatCommunication} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="occurredAt">Fecha</label>
            <input id="occurredAt" name="occurredAt" type="date" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="kind">Tipo</label>
            <select id="kind" name="kind" className="input" defaultValue="COMUNICACION">
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="subject">Asunto</label>
            <input id="subject" name="subject" className="input" required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="summary">Resumen</label>
            <textarea id="summary" name="summary" className="input min-h-[4rem]" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="file">PDF</label>
            <input id="file" name="file" type="file" accept="application/pdf" className="input" />
          </div>
          <div>
            <button type="submit" className="btn-primary text-sm">
              Guardar
            </button>
          </div>
        </form>
      </section>

      <section className="card-panel overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No hay comunicaciones archivadas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Asunto</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink-muted">
                    {formatDate(r.occurredAt)}
                  </td>
                  <td className="px-4 py-2">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </td>
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.subject}</p>
                    {r.summary ? (
                      <p className="text-xs text-ink-muted">{r.summary}</p>
                    ) : null}
                    {r.document ? (
                      <a
                        href={fiscalDocumentHref(r.document.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent underline"
                      >
                        Ver PDF
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={deleteAeatCommunication.bind(null, r.id)}>
                      <button type="submit" className="text-xs text-danger hover:underline">
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
