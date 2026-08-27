import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/modelo-390/money";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_STATUS,
} from "@/lib/fiscal-withholding";
import { resolve115WithholdingPeriod } from "@/lib/modelo-115/period";

export type LeaseWithholdingYearAggregate = {
  year: number;
  byLandlord: {
    counterpartyId: string;
    landlordName: string;
    landlordTaxId: string;
    leaseIds: string[];
    baseAmount: number;
    withholdingAmount: number;
    expenseIds: string[];
    withholdingIds: string[];
  }[];
  byLease: {
    leaseId: string;
    propertyAddress: string;
    counterpartyId: string;
    baseAmount: number;
    withholdingAmount: number;
    expenseIds: string[];
  }[];
  totals: { baseAmount: number; withholdingAmount: number; count: number };
};

export type RentWithholdingAggInput = {
  id: string;
  status: string;
  rectifiesId: string | null;
  counterpartyId: string;
  sourceType: string;
  sourceId: string;
  baseAmount: number;
  withholdingAmount: number;
  paymentDate: Date | null;
  accrualDate: Date;
  counterparty: { id: string; name: string; taxId: string };
  leaseId: string | null;
  propertyAddress?: string | null;
};

/**
 * Agregación pura por año de paymentDate (misma fuente que Modelo 115).
 * Excluye SUPERSEDED/RECTIFIED y registros sin paymentDate.
 */
export function sumEffectiveRentWithholdingsForYear(
  year: number,
  rows: RentWithholdingAggInput[]
): {
  baseAmount: number;
  withholdingAmount: number;
  count: number;
  includedIds: string[];
  missingPaymentDateIds: string[];
} {
  const active = rows.filter((w) => w.status === WITHHOLDING_STATUS.ACTIVE);
  const included: RentWithholdingAggInput[] = [];
  const missingPaymentDateIds: string[] = [];

  for (const w of active) {
    const superseded = active.some(
      (o) => o.rectifiesId === w.id && o.id !== w.id
    );
    if (superseded) continue;

    const resolved = resolve115WithholdingPeriod({
      paymentDate: w.paymentDate,
      accrualDate: w.accrualDate,
    });
    if (!resolved.ok) {
      missingPaymentDateIds.push(w.id);
      continue;
    }
    if (resolved.year !== year) continue;
    included.push(w);
  }

  let baseAmount = 0;
  let withholdingAmount = 0;
  for (const w of included) {
    baseAmount = round2(baseAmount + Number(w.baseAmount));
    withholdingAmount = round2(
      withholdingAmount + Number(w.withholdingAmount)
    );
  }

  return {
    baseAmount,
    withholdingAmount,
    count: included.length,
    includedIds: included.map((w) => w.id),
    missingPaymentDateIds,
  };
}

/**
 * Agrega retenciones RENT del año por arrendador/inmueble.
 * Año = paymentDate (alineado con Modelo 115). Preparación 180 — sin casillas.
 */
export async function aggregateLeaseWithholdingData(
  year: number
): Promise<LeaseWithholdingYearAggregate> {
  const withholdings = await prisma.fiscalWithholding.findMany({
    where: {
      direction: WITHHOLDING_DIRECTION.PRACTICED,
      kind: WITHHOLDING_KIND.RENT,
      status: WITHHOLDING_STATUS.ACTIVE,
    },
    include: {
      counterparty: { select: { id: true, name: true, taxId: true } },
    },
    orderBy: { paymentDate: "asc" },
  });

  const expenseIds = withholdings
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

  const leaseIds = [
    ...new Set(expenses.map((e) => e.leaseId).filter(Boolean) as string[]),
  ];
  const leases =
    leaseIds.length === 0
      ? []
      : await prisma.businessPremisesLease.findMany({
          where: { id: { in: leaseIds } },
          select: {
            id: true,
            propertyAddress: true,
            counterpartyId: true,
          },
        });
  const leaseById = new Map(leases.map((l) => [l.id, l]));

  const aggInputs: RentWithholdingAggInput[] = withholdings.map((w) => {
    const lid =
      w.sourceType === "EXPENSE" ? expenseLease.get(w.sourceId) ?? null : null;
    return {
      id: w.id,
      status: w.status,
      rectifiesId: w.rectifiesId,
      counterpartyId: w.counterpartyId,
      sourceType: w.sourceType,
      sourceId: w.sourceId,
      baseAmount: Number(w.baseAmount),
      withholdingAmount: Number(w.withholdingAmount),
      paymentDate: w.paymentDate,
      accrualDate: w.accrualDate,
      counterparty: w.counterparty,
      leaseId: lid,
      propertyAddress: lid ? leaseById.get(lid)?.propertyAddress : null,
    };
  });

  const effective = sumEffectiveRentWithholdingsForYear(year, aggInputs);
  const includedSet = new Set(effective.includedIds);
  const includedRows = aggInputs.filter((w) => includedSet.has(w.id));

  const byLandlordMap = new Map<
    string,
    LeaseWithholdingYearAggregate["byLandlord"][number]
  >();
  const byLeaseMap = new Map<
    string,
    LeaseWithholdingYearAggregate["byLease"][number]
  >();

  for (const w of includedRows) {
    const base = round2(Number(w.baseAmount));
    const wh = round2(Number(w.withholdingAmount));
    const cp = w.counterparty;

    let lord = byLandlordMap.get(cp.id);
    if (!lord) {
      lord = {
        counterpartyId: cp.id,
        landlordName: cp.name,
        landlordTaxId: cp.taxId,
        leaseIds: [],
        baseAmount: 0,
        withholdingAmount: 0,
        expenseIds: [],
        withholdingIds: [],
      };
      byLandlordMap.set(cp.id, lord);
    }
    lord.baseAmount = round2(lord.baseAmount + base);
    lord.withholdingAmount = round2(lord.withholdingAmount + wh);
    lord.withholdingIds.push(w.id);
    if (w.sourceType === "EXPENSE") {
      lord.expenseIds.push(w.sourceId);
      if (w.leaseId && !lord.leaseIds.includes(w.leaseId)) {
        lord.leaseIds.push(w.leaseId);
      }
    }

    if (w.leaseId) {
      let row = byLeaseMap.get(w.leaseId);
      if (!row) {
        row = {
          leaseId: w.leaseId,
          propertyAddress: w.propertyAddress ?? "—",
          counterpartyId: cp.id,
          baseAmount: 0,
          withholdingAmount: 0,
          expenseIds: [],
        };
        byLeaseMap.set(w.leaseId, row);
      }
      row.baseAmount = round2(row.baseAmount + base);
      row.withholdingAmount = round2(row.withholdingAmount + wh);
      if (w.sourceType === "EXPENSE") row.expenseIds.push(w.sourceId);
    }
  }

  return {
    year,
    byLandlord: [...byLandlordMap.values()],
    byLease: [...byLeaseMap.values()],
    totals: {
      baseAmount: effective.baseAmount,
      withholdingAmount: effective.withholdingAmount,
      count: effective.count,
    },
  };
}
