import { prisma } from "@/lib/prisma";
import { buildModel115 } from "@/lib/modelo-115/engine";
import { parse115PresentedSnapshot } from "@/lib/modelo-115/presentation";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import type { FiscalQuarter } from "@/lib/fiscal";
import { buildModel180 } from "@/lib/modelo-180/engine";
import type { Quarter115SnapshotInput } from "@/lib/modelo-180/reconcile";
import type {
  Model180LeaseRef,
  Model180Result,
  Model180WithholdingRow,
} from "@/lib/modelo-180/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";

async function loadQuarter115ForReconcile(
  year: number,
  quarter: FiscalQuarter,
  withholdings: Model180WithholdingRow[],
  leases: Model180LeaseRef[]
): Promise<Quarter115SnapshotInput> {
  const presented = await getPresentedFiling("115", year, quarter);
  const snap = presented
    ? parse115PresentedSnapshot(presented.rawExtract)
    : null;

  const draft = buildModel115({
    year,
    quarter,
    withholdings: withholdings.map((w) => ({
      ...w,
      leaseId: w.leaseId,
    })),
    leases: leases.map((l) => ({
      id: l.id,
      counterpartyId: l.counterpartyId,
      propertyAddress: l.propertyAddress,
      withholdingStatus: l.withholdingStatus,
      withholdingExemptionReason: null,
      active: l.active,
    })),
    censusModel115: "YES",
  });

  const byLeaseMap = new Map<
    string,
    {
      leaseId: string | null;
      counterpartyId: string;
      baseAmount: number;
      withholdingAmount: number;
    }
  >();
  for (const lord of draft.landlords) {
    for (const line of lord.trace ?? []) {
      const key = `${lord.counterpartyId}|${line.leaseId ?? "NO_LEASE"}`;
      const cur = byLeaseMap.get(key) ?? {
        leaseId: line.leaseId ?? null,
        counterpartyId: lord.counterpartyId,
        baseAmount: 0,
        withholdingAmount: 0,
      };
      cur.baseAmount += line.baseAmount;
      cur.withholdingAmount += line.withholdingAmount;
      byLeaseMap.set(key, cur);
    }
  }

  if (snap) {
    return {
      quarter,
      baseAmount: Number(snap.boxes.box02) || 0,
      withholdingAmount: Number(snap.boxes.box03) || 0,
      presented: true,
      withholdingIds: draft.trace?.map
        ? // Model115 may expose landlords with traces
          draft.landlords.flatMap((l) =>
            (l.trace ?? []).map((t) => t.withholdingId)
          )
        : draft.landlords.flatMap((l) =>
            (l.trace ?? []).map((t) => t.withholdingId)
          ),
      byLease: [...byLeaseMap.values()],
    };
  }

  return {
    quarter,
    baseAmount: draft.boxes.box02,
    withholdingAmount: draft.boxes.box03,
    presented: false,
    withholdingIds: draft.landlords.flatMap((l) =>
      (l.trace ?? []).map((t) => t.withholdingId)
    ),
    byLease: [...byLeaseMap.values()],
  };
}

export async function buildModelo180Draft(year: number): Promise<Model180Result> {
  const [settings, rows, leases] = await Promise.all([
    prisma.companySettings.findFirst({
      select: {
        censusModel180: true,
        censusModel115: true,
      },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        kind: WITHHOLDING_KIND.RENT,
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
        counterpartyId: true,
        propertyAddress: true,
        cadastralReference: true,
        municipality: true,
        province: true,
        postalCode: true,
        countryCode: true,
        withholdingStatus: true,
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

  const leaseRefs: Model180LeaseRef[] = leases.map((l) => ({
    id: l.id,
    counterpartyId: l.counterpartyId,
    propertyAddress: l.propertyAddress,
    cadastralReference: l.cadastralReference,
    municipality: l.municipality,
    province: l.province,
    postalCode: l.postalCode,
    countryCode: l.countryCode,
    withholdingStatus: l.withholdingStatus,
    active: l.active,
  }));

  const withholdings: Model180WithholdingRow[] = rows.map((w) => ({
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

  const quarters115 = await Promise.all(
    ([1, 2, 3, 4] as FiscalQuarter[]).map((q) =>
      loadQuarter115ForReconcile(year, q, withholdings, leaseRefs)
    )
  );

  return buildModel180({
    year,
    withholdings,
    leases: leaseRefs,
    censusModel180: settings?.censusModel180,
    censusModel115: settings?.censusModel115,
    quarters115,
  });
}
