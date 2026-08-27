import type { FiscalQuarter } from "@/lib/fiscal";
import { prisma } from "@/lib/prisma";
import { buildModel115 } from "@/lib/modelo-115/engine";
import type {
  Model115LeaseRef,
  Model115Result,
  Model115WithholdingRow,
} from "@/lib/modelo-115/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";

export async function buildModelo115Draft(
  year: number,
  quarter: FiscalQuarter,
  month?: number | null
): Promise<Model115Result> {
  const [settings, rows, leases] = await Promise.all([
    prisma.companySettings.findFirst({
      select: {
        censusModel115: true,
        rentsBusinessPremises: true,
        businessRentSubjectToWithholding: true,
        model115Periodicity: true,
      },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        kind: WITHHOLDING_KIND.RENT,
        OR: [
          { year },
          { year: year - 1 },
          { year: year + 1 },
          { paymentDate: { not: null } },
        ],
      },
      include: {
        counterparty: {
          select: {
            id: true,
            name: true,
            taxId: true,
            normalizedTaxId: true,
            kind: true,
            countryCode: true,
            requiresReview: true,
          },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.businessPremisesLease.findMany({
      select: {
        id: true,
        propertyAddress: true,
        withholdingStatus: true,
        withholdingExemptionReason: true,
        counterpartyId: true,
        active: true,
      },
    }),
  ]);

  const expenseIds = rows
    .filter((w) => w.sourceType === "EXPENSE")
    .map((w) => w.sourceId);
  const expenses =
    expenseIds.length === 0
      ? []
      : await prisma.expense.findMany({
          where: { id: { in: expenseIds } },
          select: { id: true, leaseId: true },
        });
  const expenseLease = new Map(
    expenses.map((e) => [e.id, e.leaseId] as const)
  );

  const withholdings: Model115WithholdingRow[] = rows.map((w) => ({
    id: w.id,
    direction: w.direction,
    kind: w.kind,
    status: w.status,
    rectifiesId: w.rectifiesId,
    counterpartyId: w.counterpartyId,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    baseAmount: Number(w.baseAmount),
    rate: w.rate,
    withholdingAmount: Number(w.withholdingAmount),
    accrualDate: w.accrualDate,
    paymentDate: w.paymentDate,
    year: w.year,
    quarter: w.quarter,
    leaseId:
      w.sourceType === "EXPENSE"
        ? expenseLease.get(w.sourceId) ?? null
        : null,
    counterparty: w.counterparty,
  }));

  const leaseRefs: Model115LeaseRef[] = leases.map((l) => ({
    id: l.id,
    propertyAddress: l.propertyAddress,
    withholdingStatus: l.withholdingStatus,
    withholdingExemptionReason: l.withholdingExemptionReason,
    counterpartyId: l.counterpartyId,
    active: l.active,
  }));

  return buildModel115({
    year,
    quarter,
    month: month ?? null,
    withholdings,
    leases: leaseRefs,
    censusModel115: settings?.censusModel115,
    rentsBusinessPremises: settings?.rentsBusinessPremises,
    businessRentSubjectToWithholding:
      settings?.businessRentSubjectToWithholding,
    model115Periodicity: settings?.model115Periodicity,
  });
}
