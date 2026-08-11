import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExpenseForm } from "@/components/fiscal/ExpenseForm";

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
        defaultUsefulLifeYears={
          expense.investmentAsset?.usefulLifeYears ?? 4
        }
      />
    </div>
  );
}
