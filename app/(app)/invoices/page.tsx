import Link from "next/link";
import { Suspense } from "react";
import { InlineSkeleton } from "@/components/ui/PageSkeleton";
import { prisma } from "@/lib/prisma";
import { parsePage, paginationMeta } from "@/lib/pagination";
import { Pagination } from "@/components/ui/Pagination";
import {
  InvoicesTable,
  type InvoiceListRow,
} from "@/components/invoices/InvoicesTable";
import {
  LiveDate,
  LiveSearch,
  LiveSelect,
} from "@/components/ui/LiveSearch";
import { InvoiceDropZone } from "@/components/invoices/InvoiceDropZone";
import type { Prisma } from "@prisma/client";
import { resolveVerifactuInvoiceStatus } from "@/lib/verifactu";

/** OCR Gemini puede superar el límite por defecto de Vercel Hobby. */
export const maxDuration = 60;

function primaryVatRate(rates: number[]): number | null {
  if (!rates.length) return null;
  const counts = new Map<number, number>();
  for (const r of rates) counts.set(r, (counts.get(r) ?? 0) + 1);
  let best = rates[0];
  let bestCount = 0;
  for (const [rate, count] of counts) {
    if (count > bestCount) {
      best = rate;
      bestCount = count;
    }
  }
  return best;
}

const LEGAL_LABELS: Record<string, string> = {
  SUJETA: "Sujeta a IVA",
  EXENTA: "Exenta",
  INTRACOMUNITARIA: "Intracomunitaria",
  CANARIAS: "Canarias",
  EXPORTACION: "Exportación",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const q = sp.q?.trim();

  const where: Prisma.InvoiceWhereInput = {
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.from || sp.to
      ? {
          issueDate: {
            ...(sp.from ? { gte: new Date(sp.from) } : {}),
            ...(sp.to ? { lte: new Date(sp.to) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { fullNumber: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
            { client: { nif: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await prisma.invoice.count({ where });
  const meta = paginationMeta(total, page);

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      client: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: { vatRate: true, description: true },
      },
      payments: { select: { amount: true } },
      verifactuEvents: {
        where: { status: { in: ["PENDING", "SENT", "REJECTED"] } },
        select: { status: true },
        take: 5,
      },
    },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    skip: meta.skip,
    take: meta.take,
  });

  const rows: InvoiceListRow[] = invoices.map((inv) => {
    const totalAmt = Number(inv.total);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const pending =
      inv.status === "PAGADA" || inv.status === "ANULADA"
        ? 0
        : Math.max(0, Math.round((totalAmt - paid) * 100) / 100);
    const hasPending = inv.verifactuEvents.some(
      (e) => e.status === "PENDING" || e.status === "SENT"
    );
    const hasRejected = inv.verifactuEvents.some(
      (e) => e.status === "REJECTED"
    );
    return {
      id: inv.id,
      fullNumber: inv.fullNumber,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate?.toISOString() ?? null,
      status: inv.status,
      fiscalStatus: inv.fiscalStatus,
      paymentMethod: inv.paymentMethod,
      notes: inv.notes,
      subtotal: Number(inv.subtotal),
      vatAmount: Number(inv.vatAmount),
      irpfRate: inv.irpfRate,
      irpfAmount: Number(inv.irpfAmount),
      total: totalAmt,
      pendingAmount: pending,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      primaryVatRate: primaryVatRate(inv.lines.map((l) => l.vatRate)),
      description: inv.lines[0]?.description ?? null,
      legal: LEGAL_LABELS[inv.vatOperationType] ?? inv.vatOperationType,
      clientName: inv.client.name,
      clientNif: inv.client.nif,
      verifactuStatus: resolveVerifactuInvoiceStatus({
        status: inv.status,
        verifactuHash: inv.verifactuHash,
        verifactuSentAt: inv.verifactuSentAt,
        pendingEvent: hasPending,
        rejectedEvent: hasRejected && !inv.verifactuSentAt,
      }),
    };
  });

  const params = { status: sp.status, from: sp.from, to: sp.to, q: sp.q };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturas</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Numeración correlativo · borradores editables · emisión bloquea el contenido fiscal
          </p>
        </div>
        <Link href="/invoices/new" className="btn-primary">
          Nueva factura
        </Link>
      </div>

      <InvoiceDropZone />

      <div className="flex flex-wrap items-end gap-2">
        <Suspense fallback={<InlineSkeleton />}>
          <LiveSearch placeholder="Buscar por nº, cliente o NIF…" />
        </Suspense>
        <Suspense fallback={null}>
          <LiveSelect
            param="status"
            label="Estado"
            allLabel="Todos"
            options={["PENDIENTE", "PAGADA", "VENCIDA", "ANULADA"].map((s) => ({
              value: s,
              label: s,
            }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <LiveDate param="from" label="Desde" />
        </Suspense>
        <Suspense fallback={null}>
          <LiveDate param="to" label="Hasta" />
        </Suspense>
      </div>

      <InvoicesTable invoices={rows} />

      <Pagination
        basePath="/invoices"
        params={params}
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        pageSize={meta.pageSize}
      />
    </div>
  );
}
