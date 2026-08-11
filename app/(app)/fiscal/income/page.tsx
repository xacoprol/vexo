import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { InlineSkeleton } from "@/components/ui/PageSkeleton";
import { prisma } from "@/lib/prisma";
import { parsePage, paginationMeta } from "@/lib/pagination";
import { Pagination } from "@/components/ui/Pagination";
import { LiveSearch } from "@/components/ui/LiveSearch";
import { MarketplaceIncomeDropZone } from "@/components/fiscal/MarketplaceIncomeDropZone";
import { MarketplaceIncomeFilters } from "@/components/fiscal/MarketplaceIncomeFilters";
import { MarketplaceIncomeTable } from "@/components/fiscal/MarketplaceIncomeTable";
import { ShopifySyncCard } from "@/components/fiscal/ShopifySyncCard";
import { shopifyConfiguredHint } from "@/lib/shopify-client";

export default async function MarketplaceIncomePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    channel?: string;
    vat?: string;
    year?: string;
    month?: string;
  }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();
  const page = parsePage(sp.page);
  const channel = (sp.channel ?? "").toUpperCase();
  const vat = (sp.vat ?? "").toUpperCase();
  const year = parseInt(sp.year ?? "", 10);
  const month = parseInt(sp.month ?? "", 10);

  const and: Prisma.MarketplaceIncomeWhereInput[] = [];

  if (query) {
    and.push({
      OR: [
        { externalRef: { contains: query, mode: "insensitive" } },
        { orderId: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { channel: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (channel === "AMAZON" || channel === "SHOPIFY") {
    and.push({ channel });
  }
  if (
    vat === "TAXABLE" ||
    vat === "EXEMPT" ||
    vat === "MARKETPLACE_COLLECTED"
  ) {
    and.push({ vatStatus: vat });
  }
  if (Number.isFinite(year) && year >= 2000 && year <= 2100) {
    if (Number.isFinite(month) && month >= 1 && month <= 12) {
      const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const to = new Date(year, month, 0, 23, 59, 59, 999);
      and.push({ issueDate: { gte: from, lte: to } });
    } else {
      const from = new Date(year, 0, 1, 0, 0, 0, 0);
      const to = new Date(year, 11, 31, 23, 59, 59, 999);
      and.push({ issueDate: { gte: from, lte: to } });
    }
  }

  const where: Prisma.MarketplaceIncomeWhereInput | undefined = and.length
    ? { AND: and }
    : undefined;

  const total = await prisma.marketplaceIncome.count({ where });
  const meta = paginationMeta(total, page);

  const nowY = new Date().getFullYear();
  const filterYears = [nowY + 1, nowY, nowY - 1, nowY - 2];

  const [rows, settings] = await Promise.all([
    prisma.marketplaceIncome.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip: meta.skip,
      take: meta.take,
    }),
    prisma.companySettings.findFirst({
      select: {
        shopifyShop: true,
        shopifyClientId: true,
        shopifyClientSecret: true,
        shopifyAccessToken: true,
        shopifyLastSyncAt: true,
      },
    }),
  ]);

  const shopifyHint = shopifyConfiguredHint({
    shopifyShop: settings?.shopifyShop ?? null,
    shopifyClientId: settings?.shopifyClientId ?? null,
    shopifyClientSecret: settings?.shopifyClientSecret ?? null,
    shopifyAccessToken: settings?.shopifyAccessToken ?? null,
  });

  const listRows = rows.map((r) => ({
    id: r.id,
    issueDate: r.issueDate.toISOString(),
    channel: r.channel,
    transactionType: r.transactionType,
    externalRef: r.externalRef,
    sku: r.sku,
    vatStatus: r.vatStatus,
    vatRate: r.vatRate,
    subtotal: Number(r.subtotal),
    vatAmount: Number(r.vatAmount),
  }));

  const filterParams = {
    q: query,
    channel: channel || undefined,
    vat: vat || undefined,
    year: Number.isFinite(year) ? String(year) : undefined,
    month:
      Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12
        ? String(month)
        : undefined,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/fiscal" className="text-sm text-ink-muted hover:text-accent">
            ← Fiscal
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Ingresos marketplace
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Amazon (CSV) y Shopify (API, CSV o Informe IVA) · alta manual si
            hace falta · no usan la serie W3D
          </p>
        </div>
        <Link href="/fiscal/income/new" className="btn-primary text-sm">
          Nuevo ingreso
        </Link>
      </div>

      <ShopifySyncCard
        ready={shopifyHint.ready}
        shop={shopifyHint.shop}
        lastSyncAt={settings?.shopifyLastSyncAt?.toISOString() ?? null}
      />

      <MarketplaceIncomeDropZone />

      <div className="space-y-3">
        <Suspense fallback={<InlineSkeleton />}>
          <LiveSearch placeholder="Buscar factura Amazon, pedido, SKU…" />
        </Suspense>
        <Suspense fallback={<InlineSkeleton />}>
          <MarketplaceIncomeFilters years={filterYears} />
        </Suspense>
      </div>

      <MarketplaceIncomeTable
        rows={listRows}
        emptyHint={
          query || channel || vat || Number.isFinite(year)
            ? "No hay ingresos con estos filtros."
            : "No hay ingresos. Importa CSV, sincroniza Shopify o crea uno a mano."
        }
      />

      <Pagination
        basePath="/fiscal/income"
        params={filterParams}
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        pageSize={meta.pageSize}
      />
    </div>
  );
}
