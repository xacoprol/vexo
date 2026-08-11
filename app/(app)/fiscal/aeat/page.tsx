import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/calculations";
import { fiscalDocumentHref } from "@/lib/fiscal-blob";
import {
  createAeatCommunication,
  deleteAeatCommunication,
  markAeatClosed,
  markAeatResponded,
} from "./actions";

const KIND_LABEL: Record<string, string> = {
  NOTIFICACION: "Notificación",
  REQUERIMIENTO: "Requerimiento",
  COMUNICACION: "Comunicación",
  OTRO: "Otro",
};

const STATUS_LABEL: Record<string, string> = {
  ABIERTA: "Abierta",
  RESPONDIDA: "Respondida",
  CERRADA: "Cerrada",
};

function dueTone(dueAt: Date | null, status: string): "ok" | "soon" | "overdue" | null {
  if (!dueAt || status !== "ABIERTA") return null;
  const days = Math.ceil(
    (dueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "ok";
}

export default async function FiscalAeatPage() {
  const rows = await prisma.aeatCommunication.findMany({
    include: { document: true },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { occurredAt: "desc" }],
  });

  const openDue = rows.filter(
    (r) => r.status === "ABIERTA" && r.dueAt && r.dueAt.getTime() < Date.now()
  );

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
          Notificaciones y requerimientos con plazo de respuesta. Revisa también
          el buzón DEHú de la sede.
        </p>
      </div>

      {openDue.length > 0 ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {openDue.length} comunicación(es) con plazo vencido sin marcar como
          respondida.
        </p>
      ) : null}

      <section className="card-panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Registrar</h2>
        <form
          action={createAeatCommunication}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div>
            <label className="label" htmlFor="occurredAt">
              Fecha recepción
            </label>
            <input
              id="occurredAt"
              name="occurredAt"
              type="date"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="dueAt">
              Plazo respuesta
            </label>
            <input id="dueAt" name="dueAt" type="date" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Tipo
            </label>
            <select
              id="kind"
              name="kind"
              className="input"
              defaultValue="REQUERIMIENTO"
            >
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="subject">
              Asunto
            </label>
            <input id="subject" name="subject" className="input" required />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="summary">
              Resumen / qué pide
            </label>
            <textarea
              id="summary"
              name="summary"
              className="input min-h-[4rem]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="file">
              PDF
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept="application/pdf"
              className="input"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary text-sm">
              Guardar
            </button>
          </div>
        </form>
      </section>

      <section className="card-panel overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No hay comunicaciones archivadas. Si te llega algo en DEHú, regístralo
            aquí con el plazo.
          </p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Recepción</th>
                <th className="px-4 py-2 text-left">Plazo</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Asunto</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = dueTone(r.dueAt, r.status);
                return (
                  <tr key={r.id} className="border-b border-line/50">
                    <td className="px-4 py-2 text-ink-muted">
                      {formatDate(r.occurredAt)}
                    </td>
                    <td className="px-4 py-2">
                      {r.dueAt ? (
                        <span
                          className={
                            tone === "overdue"
                              ? "font-medium text-danger"
                              : tone === "soon"
                                ? "font-medium text-warning"
                                : "text-ink-muted"
                          }
                        >
                          {formatDate(r.dueAt)}
                        </span>
                      ) : (
                        "—"
                      )}
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
                    <td className="px-4 py-2 text-xs">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {r.status === "ABIERTA" ? (
                          <>
                            <form action={markAeatResponded.bind(null, r.id)}>
                              <button
                                type="submit"
                                className="text-xs text-accent hover:underline"
                              >
                                Respondida
                              </button>
                            </form>
                            <form action={markAeatClosed.bind(null, r.id)}>
                              <button
                                type="submit"
                                className="text-xs text-ink-muted hover:underline"
                              >
                                Cerrar
                              </button>
                            </form>
                          </>
                        ) : null}
                        <form action={deleteAeatCommunication.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="text-xs text-danger hover:underline"
                          >
                            Borrar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
