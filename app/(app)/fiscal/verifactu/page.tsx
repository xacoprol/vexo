import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auditVerifactuChain } from "@/lib/verifactu-audit";
import {
  parseVerifactuEnv,
  parseVerifactuMode,
  VERIFACTU_STATUS_LABEL,
} from "@/lib/verifactu";
import { formatDate } from "@/lib/calculations";
import {
  runVerifactuRemitNow,
  retryVerifactuEventAction,
  sealMissingInvoice,
  updateVerifactuSettings,
} from "./actions";
import { VerifactuModeForm } from "@/components/fiscal/VerifactuModeForm";
import { VerifactuRemitButton } from "@/components/fiscal/VerifactuRemitButton";

export default async function VerifactuPage() {
  const [settings, audit, events] = await Promise.all([
    prisma.companySettings.findFirst({
      select: { verifactuMode: true, verifactuEnv: true, nif: true },
    }),
    auditVerifactuChain(),
    prisma.verifactuEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        invoice: { select: { id: true, fullNumber: true, status: true } },
      },
    }),
  ]);

  const mode = parseVerifactuMode(settings?.verifactuMode);
  const env = parseVerifactuEnv(settings?.verifactuEnv);

  const missing = audit.issues.filter((i) => i.code === "MISSING_HASH");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
          ← Fiscal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Veri*Factu
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sello local, auditoría de cadena y cola de remisión AEAT (obligación
          autónomos: 1 jul 2027)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card-panel px-4 py-3">
          <p className="text-xs uppercase text-ink-muted">Modo</p>
          <p className="mt-1 font-semibold">{mode}</p>
        </div>
        <div className="card-panel px-4 py-3">
          <p className="text-xs uppercase text-ink-muted">Entorno</p>
          <p className="mt-1 font-semibold">{env}</p>
        </div>
        <div className="card-panel px-4 py-3">
          <p className="text-xs uppercase text-ink-muted">Selladas</p>
          <p className="mt-1 font-semibold">
            {audit.sealedCount}/{audit.invoiceCount}
          </p>
        </div>
        <div className="card-panel px-4 py-3">
          <p className="text-xs uppercase text-ink-muted">Incidencias</p>
          <p className="mt-1 font-semibold">{audit.issues.length}</p>
        </div>
      </div>

      <div className="card-panel space-y-4 p-4">
        <h2 className="text-sm font-semibold">Configuración</h2>
        {!settings?.nif?.trim() ? (
          <p className="text-sm text-danger">
            Falta el NIF en{" "}
            <Link href="/settings" className="underline">
              Ajustes
            </Link>{" "}
            — sin NIF no se puede sellar.
          </p>
        ) : null}
        <VerifactuModeForm
          mode={mode}
          env={env}
          action={updateVerifactuSettings}
        />
        <p className="text-xs text-ink-muted">
          Certificado AEAT: no se guarda en git. Configura{" "}
          <code className="font-mono">VERIFACTU_AEAT_ENDPOINT</code> y{" "}
          <code className="font-mono">VERIFACTU_AEAT_TOKEN</code> en Vercel.
          Hasta entonces el stub acepta en TEST (
          <code className="font-mono">VERIFACTU_AEAT_STUB</code>).
        </p>
        <VerifactuRemitButton action={runVerifactuRemitNow} disabled={mode !== "VERIFACTU"} />
      </div>

      <div className="card-panel overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Auditoría de cadena</h2>
          <span className="text-xs text-ink-muted">
            {formatDate(audit.checkedAt)}
          </span>
        </div>
        {audit.issues.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">
            Sin incidencias. Cadena coherente.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Severidad</th>
                <th className="px-4 py-2 text-left">Factura</th>
                <th className="px-4 py-2 text-left">Detalle</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {audit.issues.map((issue, idx) => (
                <tr key={`${issue.code}-${issue.invoiceId}-${idx}`} className="border-b border-line/50">
                  <td className="px-4 py-2">
                    <span
                      className={
                        issue.severity === "error"
                          ? "text-danger"
                          : "text-warning"
                      }
                    >
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {issue.invoiceId ? (
                      <Link
                        href={`/invoices/${issue.invoiceId}`}
                        className="text-accent hover:underline"
                      >
                        {issue.fullNumber}
                      </Link>
                    ) : (
                      issue.fullNumber
                    )}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{issue.message}</td>
                  <td className="px-4 py-2 text-right">
                    {issue.code === "MISSING_HASH" && issue.invoiceId ? (
                      <form action={sealMissingInvoice.bind(null, issue.invoiceId)}>
                        <button type="submit" className="btn-ghost text-xs">
                          Sellar
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {missing.length > 0 ? (
          <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
            {missing.length} factura(s) sin sello — usa «Sellar» o el backfill.
          </p>
        ) : null}
      </div>

      <div className="card-panel overflow-x-auto">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Cola de eventos</h2>
          <p className="text-xs text-ink-muted">
            Estados: PENDING → SENT → ACCEPTED / REJECTED · SKIPPED en modo
            NO_VERIFACTU
          </p>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">
            Aún no hay eventos. Se crean al sellar o anular facturas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Factura</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">AEAT</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink-muted">
                    {formatDate(ev.createdAt)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link
                      href={`/invoices/${ev.invoice.id}`}
                      className="text-accent hover:underline"
                    >
                      {ev.invoice.fullNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{ev.kind}</td>
                  <td className="px-4 py-2">{ev.status}</td>
                  <td className="max-w-[14rem] truncate px-4 py-2 text-xs text-ink-muted">
                    {ev.aeatCode ? `${ev.aeatCode}: ` : ""}
                    {ev.aeatMessage ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {ev.status === "REJECTED" ? (
                      <form action={retryVerifactuEventAction.bind(null, ev.id)}>
                        <button type="submit" className="btn-ghost text-xs">
                          Reintentar
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        Estados factura:{" "}
        {Object.entries(VERIFACTU_STATUS_LABEL)
          .map(([k, v]) => `${k}=${v}`)
          .join(" · ")}
      </p>
    </div>
  );
}
