import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ExpenseForm } from "@/components/fiscal/ExpenseForm";

async function loadLeaseOptions() {
  const leases = await prisma.businessPremisesLease.findMany({
    where: { active: true },
    include: { counterparty: true },
    orderBy: { propertyAddress: "asc" },
  });
  return leases.map((l) => ({
    id: l.id,
    label: `${l.propertyAddress} · ${l.counterparty.name}`,
    landlordName: l.counterparty.name,
    landlordNif: l.counterparty.taxId,
    withholdingStatus: l.withholdingStatus,
    defaultWithholdingRate: l.defaultWithholdingRate,
  }));
}

export default async function NewExpensePage() {
  const leases = await loadLeaseOptions();
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/fiscal/expenses"
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Gastos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo gasto
        </h1>
      </div>
      <ExpenseForm leases={leases} />
    </div>
  );
}
