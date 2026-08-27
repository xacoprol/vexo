import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExpenseForm } from "@/components/fiscal/ExpenseForm";
import {
  findActiveExpensePracticedWithholding,
  findActiveExpenseRentWithholding,
} from "@/lib/fiscal-withholding";

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

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { investmentAsset: { select: { usefulLifeYears: true } } },
  });
  if (!expense) notFound();

  const [withholding, rentWh, leases] = await Promise.all([
    findActiveExpensePracticedWithholding(id),
    findActiveExpenseRentWithholding(id),
    loadLeaseOptions(),
  ]);

  const toDraft = (
    w: Awaited<ReturnType<typeof findActiveExpensePracticedWithholding>>
  ) =>
    w
      ? {
          baseAmount: Number(w.baseAmount),
          rate: w.rate,
          withholdingAmount: Number(w.withholdingAmount),
          paymentDate: w.paymentDate
            ? w.paymentDate.toISOString().slice(0, 10)
            : null,
        }
      : null;

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
          Editar gasto
        </h1>
      </div>
      <ExpenseForm
        expense={expense}
        practicedWithholding={toDraft(withholding)}
        rentWithholding={toDraft(rentWh)}
        leases={leases}
        defaultUsefulLifeYears={
          expense.investmentAsset?.usefulLifeYears ?? 4
        }
      />
    </div>
  );
}
