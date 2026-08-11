import Link from "next/link";
import { MarketplaceIncomeForm } from "@/components/fiscal/MarketplaceIncomeForm";

export default function NewMarketplaceIncomePage() {
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
          Nuevo ingreso
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Alta manual (venta fuera de CSV/API o corrección puntual)
        </p>
      </div>
      <MarketplaceIncomeForm />
    </div>
  );
}
