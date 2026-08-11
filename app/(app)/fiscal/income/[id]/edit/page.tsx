import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MarketplaceIncomeForm } from "@/components/fiscal/MarketplaceIncomeForm";

export default async function EditMarketplaceIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const income = await prisma.marketplaceIncome.findUnique({ where: { id } });
  if (!income) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/fiscal/income"
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Ingresos marketplace
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Editar ingreso
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {income.externalRef ?? income.externalKey}
        </p>
      </div>
      <MarketplaceIncomeForm income={income} />
    </div>
  );
}
