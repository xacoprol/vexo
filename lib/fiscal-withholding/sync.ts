import { Prisma } from "@prisma/client";
import { fiscalQuarterFromDate } from "@/lib/modelo-347/deadlines";
import { prisma } from "@/lib/prisma";
import {
  expectedWithholdingAmount,
  parsePracticedWithholdingStatus,
  validatePracticedWithholding,
} from "@/lib/fiscal-withholding/amounts";
import { resolveOrCreateFiscalCounterparty } from "@/lib/fiscal-withholding/counterparty";
import {
  COUNTERPARTY_KIND,
  PRACTICED_WITHHOLDING_STATUS,
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_SOURCE,
  WITHHOLDING_STATUS,
} from "@/lib/fiscal-withholding/types";

export type ExpensePracticedWithholdingData = {
  practicedWithholdingStatus: string;
  supplierName: string;
  supplierNif: string | null;
  issueDate: Date;
  /** Base sujeta a retención (suele = subtotal). */
  withholdingBase: number;
  withholdingRate: number;
  withholdingAmount: number;
  paymentDate?: Date | null;
};

/**
 * Sincroniza 0..1 FiscalWithholding ACTIVE PRACTICED PROFESSIONAL por Expense.
 * Neon HTTP: sin $transaction interactiva — compensación secuencial.
 */
export async function syncExpensePracticedWithholding(
  expenseId: string,
  data: ExpensePracticedWithholdingData
): Promise<{ withholdingId: string | null }> {
  const status = parsePracticedWithholdingStatus(data.practicedWithholdingStatus);

  const existing = await prisma.fiscalWithholding.findMany({
    where: {
      sourceType: WITHHOLDING_SOURCE.EXPENSE,
      sourceId: expenseId,
      direction: WITHHOLDING_DIRECTION.PRACTICED,
      kind: WITHHOLDING_KIND.PROFESSIONAL,
      status: WITHHOLDING_STATUS.ACTIVE,
    },
  });

  if (status !== PRACTICED_WITHHOLDING_STATUS.YES) {
    for (const w of existing) {
      await prisma.fiscalWithholding.delete({ where: { id: w.id } });
    }
    return { withholdingId: null };
  }

  const validation = validatePracticedWithholding({
    counterpartyTaxId: data.supplierNif,
    counterpartyName: data.supplierName,
    baseAmount: data.withholdingBase,
    rate: data.withholdingRate,
    withholdingAmount: data.withholdingAmount,
    accrualDate: data.issueDate,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const counterparty = await resolveOrCreateFiscalCounterparty({
    taxId: data.supplierNif,
    name: data.supplierName,
    kind: COUNTERPARTY_KIND.PROFESSIONAL,
    countryCode: "ES",
  });

  const accrualDate = data.issueDate;
  const year = accrualDate.getFullYear();
  const quarter = fiscalQuarterFromDate(accrualDate);
  const payload = {
    direction: WITHHOLDING_DIRECTION.PRACTICED,
    kind: WITHHOLDING_KIND.PROFESSIONAL,
    counterpartyId: counterparty.id,
    sourceType: WITHHOLDING_SOURCE.EXPENSE,
    sourceId: expenseId,
    baseAmount: new Prisma.Decimal(data.withholdingBase),
    rate: data.withholdingRate,
    withholdingAmount: new Prisma.Decimal(data.withholdingAmount),
    accrualDate,
    paymentDate: data.paymentDate ?? null,
    year,
    quarter,
    status: WITHHOLDING_STATUS.ACTIVE,
  };

  if (existing.length === 0) {
    const created = await prisma.fiscalWithholding.create({ data: payload });
    return { withholdingId: created.id };
  }

  // Mantener uno ACTIVE; eliminar duplicados sobrantes
  const [primary, ...dupes] = existing;
  for (const d of dupes) {
    await prisma.fiscalWithholding.delete({ where: { id: d.id } });
  }
  const updated = await prisma.fiscalWithholding.update({
    where: { id: primary.id },
    data: payload,
  });
  return { withholdingId: updated.id };
}

/** Borra withholdings ACTIVE vinculados a un gasto (antes de borrar el gasto). */
export async function deleteExpensePracticedWithholdings(
  expenseId: string
): Promise<number> {
  const rows = await prisma.fiscalWithholding.findMany({
    where: {
      sourceType: WITHHOLDING_SOURCE.EXPENSE,
      sourceId: expenseId,
    },
    select: { id: true },
  });
  for (const r of rows) {
    await prisma.fiscalWithholding.delete({ where: { id: r.id } });
  }
  return rows.length;
}

export async function findActiveExpensePracticedWithholding(expenseId: string) {
  return prisma.fiscalWithholding.findFirst({
    where: {
      sourceType: WITHHOLDING_SOURCE.EXPENSE,
      sourceId: expenseId,
      direction: WITHHOLDING_DIRECTION.PRACTICED,
      kind: WITHHOLDING_KIND.PROFESSIONAL,
      status: WITHHOLDING_STATUS.ACTIVE,
    },
    include: { counterparty: true },
  });
}

export type ExpenseRentWithholdingData = {
  /** null / vacío → limpia RENT ACTIVE del gasto. */
  leaseId: string | null;
  issueDate: Date;
  withholdingBase: number;
  withholdingRate: number;
  withholdingAmount: number;
  paymentDate?: Date | null;
};

/**
 * Sincroniza 0..1 FiscalWithholding ACTIVE PRACTICED RENT por Expense.
 * Solo si el Lease vinculado declara withholdingStatus=YES.
 * Neon HTTP: compensación secuencial (sin $transaction interactiva).
 */
export async function syncExpenseRentWithholding(
  expenseId: string,
  data: ExpenseRentWithholdingData
): Promise<{ withholdingId: string | null }> {
  const existing = await prisma.fiscalWithholding.findMany({
    where: {
      sourceType: WITHHOLDING_SOURCE.EXPENSE,
      sourceId: expenseId,
      direction: WITHHOLDING_DIRECTION.PRACTICED,
      kind: WITHHOLDING_KIND.RENT,
      status: WITHHOLDING_STATUS.ACTIVE,
    },
  });

  const clear = async () => {
    for (const w of existing) {
      await prisma.fiscalWithholding.delete({ where: { id: w.id } });
    }
    return { withholdingId: null as string | null };
  };

  const leaseId = String(data.leaseId ?? "").trim() || null;
  if (!leaseId) return clear();

  const lease = await prisma.businessPremisesLease.findUnique({
    where: { id: leaseId },
    include: {
      counterparty: true,
    },
  });
  if (!lease) return clear();

  if (lease.withholdingStatus !== "YES") {
    return clear();
  }

  const landlord = lease.counterparty;
  const validation = validatePracticedWithholding({
    counterpartyTaxId: landlord.taxId,
    counterpartyName: landlord.name,
    baseAmount: data.withholdingBase,
    rate: data.withholdingRate,
    withholdingAmount: data.withholdingAmount,
    accrualDate: data.issueDate,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const accrualDate = data.issueDate;
  const year = accrualDate.getFullYear();
  const quarter = fiscalQuarterFromDate(accrualDate);
  const payload = {
    direction: WITHHOLDING_DIRECTION.PRACTICED,
    kind: WITHHOLDING_KIND.RENT,
    counterpartyId: landlord.id,
    sourceType: WITHHOLDING_SOURCE.EXPENSE,
    sourceId: expenseId,
    baseAmount: new Prisma.Decimal(data.withholdingBase),
    rate: data.withholdingRate,
    withholdingAmount: new Prisma.Decimal(data.withholdingAmount),
    accrualDate,
    paymentDate: data.paymentDate ?? null,
    year,
    quarter,
    status: WITHHOLDING_STATUS.ACTIVE,
  };

  if (existing.length === 0) {
    const created = await prisma.fiscalWithholding.create({ data: payload });
    return { withholdingId: created.id };
  }

  const [primary, ...dupes] = existing;
  for (const d of dupes) {
    await prisma.fiscalWithholding.delete({ where: { id: d.id } });
  }
  const updated = await prisma.fiscalWithholding.update({
    where: { id: primary.id },
    data: payload,
  });
  return { withholdingId: updated.id };
}

export async function findActiveExpenseRentWithholding(expenseId: string) {
  return prisma.fiscalWithholding.findFirst({
    where: {
      sourceType: WITHHOLDING_SOURCE.EXPENSE,
      sourceId: expenseId,
      direction: WITHHOLDING_DIRECTION.PRACTICED,
      kind: WITHHOLDING_KIND.RENT,
      status: WITHHOLDING_STATUS.ACTIVE,
    },
    include: { counterparty: true },
  });
}

export { expectedWithholdingAmount };
