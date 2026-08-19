import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MarketplaceIncomeForm } from "@/components/fiscal/MarketplaceIncomeForm";
import { convertMarketplaceIncomeToInvoice } from "../../actions";
import { canConvertMarketplaceIncome } from "@/lib/marketplace-invoice";

export default async function EditMarketplaceIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const income = await prisma.marketplaceIncome.findUnique({
    where: { id },
    include: { invoice: { select: { id: true, fullNumber: true } } },
  });
  if (!income) notFound();

  const convertCheck = canConvertMarketplaceIncome(income);

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
        {income.invoice ? (
          <p className="mt-2 text-sm">
            Factura W3D:{" "}
            <Link
              href={`/invoices/${income.invoice.id}`}
              className="font-mono text-accent hover:underline"
            >
              {income.invoice.fullNumber}
            </Link>
          </p>
        ) : convertCheck.ok ? (
          <form
            action={convertMarketplaceIncomeToInvoice.bind(null, id)}
            className="mt-3"
          >
            <button type="submit" className="btn-primary text-sm">
              Convertir en factura W3D
            </button>
          </form>
        ) : null}
      </div>
      {income.invoice ? (
        <p className="text-sm text-ink-muted">
          Este ingreso ya está facturado; los importes no se pueden modificar aquí.
        </p>
      ) : (
        <MarketplaceIncomeForm income={income} />
      )}
    </div>
  );
}
