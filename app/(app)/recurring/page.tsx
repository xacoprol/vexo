import Link from "next/link";
import { Suspense } from "react";
import { InlineSkeleton } from "@/components/ui/PageSkeleton";
import { prisma } from "@/lib/prisma";
import { calculateDocument } from "@/lib/calculations";
import { parsePage, paginationMeta } from "@/lib/pagination";
import { Pagination } from "@/components/ui/Pagination";
import {
  RecurringTable,
  type RecurringListRow,
} from "@/components/recurring/RecurringTable";
import { LiveSearch } from "@/components/ui/LiveSearch";
import { isZeroVatOperation } from "@/lib/recurring";
import type { Prisma } from "@prisma/client";

function templateTotal(t: {
  irpfRate: number;
  vatOperationType: string;
  lines: {
    description: string;
    quantity: { toString(): string } | number;
    unitPrice: { toString(): string } | number;
    vatRate: number;
    discountPct: number;
  }[];
}): number {
  const forceZeroVat = isZeroVatOperation(t.vatOperationType);
  const { total } = calculateDocument(
    t.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      vatRate: forceZeroVat ? 0 : l.vatRate,
      discountPct: l.discountPct,
    })),
    t.irpfRate
  );
  return total;
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const q = sp.q?.trim();

  const where: Prisma.RecurringInvoiceTemplateWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { client: { name: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};

  const total = await prisma.recurringInvoiceTemplate.count({ where });
  const meta = paginationMeta(total, page);

  const [templates, logs] = await Promise.all([
    prisma.recurringInvoiceTemplate.findMany({
      where,
      include: {
        client: true,
        lines: true,
      },
      orderBy: { nextRunDate: "asc" },
      skip: meta.skip,
      take: meta.take,
    }),
    prisma.cronRunLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  const rows: RecurringListRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    clientName: t.client.name,
    frequency: t.frequency,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate?.toISOString() ?? null,
    nextRunDate: t.nextRunDate?.toISOString() ?? null,
    status: t.status,
    total: templateTotal(t),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Periódicas
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            El cron crea proformas; tú las conviertes en factura cuando toque
          </p>
        </div>
        <Link href="/recurring/new" className="btn-primary">
          Nueva
        </Link>
      </div>

      <Suspense fallback={<InlineSkeleton />}>
        <LiveSearch placeholder="Buscar por nombre o cliente…" />
      </Suspense>

      <RecurringTable rows={rows} />

      <Pagination
        basePath="/recurring"
        params={{ q: sp.q }}
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        pageSize={meta.pageSize}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Log de ejecuciones cron
        </h2>
        <div className="card-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-line/20 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Inicio</th>
                <th className="px-4 py-2 text-left font-medium">Resultado</th>
                <th className="px-4 py-2 text-right font-medium">Revisadas</th>
                <th className="px-4 py-2 text-right font-medium">Proformas</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-muted">
                    Aún no hay ejecuciones. Invoca{" "}
                    <code className="font-mono text-xs">
                      /api/cron/generate-recurring-invoices
                    </code>{" "}
                    con el header Authorization.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-b border-line/50">
                    <td className="px-4 py-2 font-mono text-xs">
                      {l.startedAt.toLocaleString("es-ES")}
                    </td>
                    <td className="px-4 py-2">
                      {l.success ? (
                        <span className="text-success">OK</span>
                      ) : (
                        <span className="text-danger">Error</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{l.templatesChecked}</td>
                    <td className="px-4 py-2 text-right">{l.invoicesCreated}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
